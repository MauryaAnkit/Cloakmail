import { nowIso } from "~src/lib/dates"
import { createRandomBase64 } from "~src/lib/crypto"
import type {
  AliasRecord,
  BlockedAlias,
  EncryptedSecret,
  ExtensionMetadata,
  ExtensionSettings,
  PendingAliasAction,
  StorageShape
} from "~src/types"

const DEFAULT_METADATA: ExtensionMetadata = {
  schemaVersion: 3,
  installedAt: nowIso(),
  installationId: createRandomBase64()
}

const storageArea = () => chrome.storage.local

const readKeys = async <T extends Partial<StorageShape>>(
  keys?: Array<keyof StorageShape>
): Promise<T> =>
  new Promise((resolve, reject) => {
    const requestedKeys = keys ? (keys as string[]) : null
    storageArea().get(requestedKeys, (items) => {
      const error = chrome.runtime.lastError
      if (error) {
        reject(new Error(error.message))
        return
      }

      resolve(items as T)
    })
  })

const write = async (patch: Partial<StorageShape>) =>
  new Promise<void>((resolve, reject) => {
    storageArea().set(patch, () => {
      const error = chrome.runtime.lastError
      if (error) {
        reject(new Error(error.message))
        return
      }

      resolve()
    })
  })

export const getStorageSnapshot = async (): Promise<StorageShape> => {
  const current = await readKeys<Partial<StorageShape>>()
  const metadata: ExtensionMetadata = {
    ...DEFAULT_METADATA,
    ...current.metadata,
    schemaVersion: 3,
    installationId: current.metadata?.installationId ?? createRandomBase64()
  }
  const aliases = Object.fromEntries(
    Object.entries(current.aliases ?? {}).map(([id, alias]) => [
      id,
      {
        ...alias,
        routingMode: alias.routingMode ?? "dedicated_rule",
        syncStatus: alias.syncStatus ?? "local"
      }
    ])
  )

  return {
    settings: current.settings
      ? {
          zoneId: current.settings.zoneId,
          domain: current.settings.domain,
          forwardingEmail: current.settings.forwardingEmail,
          darkMode: current.settings.darkMode,
          setupComplete: current.settings.setupComplete,
          createdAt: current.settings.createdAt,
          updatedAt: current.settings.updatedAt,
          routingMode: "dedicated_rule",
          hasEncryptedApiToken: Boolean(current.encryptedApiToken ?? current.settings.hasEncryptedApiToken)
        }
      : undefined,
    aliases,
    blockedAliases: current.blockedAliases ?? {},
    pendingActions: current.pendingActions ?? {},
    encryptedApiToken: current.encryptedApiToken,
    metadata: {
      ...metadata,
      schemaVersion: 3
    }
  }
}

export const getSettings = async () => {
  const { settings } = await readKeys<Pick<StorageShape, "settings">>(["settings"])
  return settings
}

export const getLegacyPlaintextApiToken = async () => {
  const { settings } = await readKeys<Pick<StorageShape, "settings">>(["settings"])
  return (settings as (ExtensionSettings & { apiToken?: string }) | undefined)?.apiToken
}

export const saveSettings = async (
  input: Omit<ExtensionSettings, "createdAt" | "updatedAt">
) => {
  const existing = await getSettings()
  const timestamp = nowIso()
  const settings: ExtensionSettings = {
    ...input,
    createdAt: existing?.createdAt ?? timestamp,
    updatedAt: timestamp
  }

  await write({ settings })
  return settings
}

export const saveEncryptedApiToken = async (encryptedApiToken: EncryptedSecret) => {
  const existingSettings = await getSettings()
  const timestamp = nowIso()
  const patch: Partial<StorageShape> = { encryptedApiToken }

  if (existingSettings) {
    patch.settings = {
      ...existingSettings,
      hasEncryptedApiToken: true,
      updatedAt: timestamp
    }
  }

  await write(patch)
}

export const getEncryptedApiToken = async () => {
  const { encryptedApiToken } = await readKeys<Pick<StorageShape, "encryptedApiToken">>([
    "encryptedApiToken"
  ])
  return encryptedApiToken
}

export const getOrCreateMetadata = async () => {
  const snapshot = await getStorageSnapshot()
  await write({ metadata: snapshot.metadata })
  return snapshot.metadata
}

export const listAliases = async () => {
  const { aliases } = await getStorageSnapshot()
  return Object.values(aliases).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

export const getAliasBySiteKey = async (siteKey: string) => {
  const aliases = await listAliases()
  return aliases.find((alias) => alias.siteKey === siteKey && alias.status !== "deleted")
}

export const getAliasByAddress = async (address: string) => {
  const aliases = await listAliases()
  return aliases.find((alias) => alias.alias === address)
}

export const upsertAlias = async (alias: AliasRecord) => {
  const { aliases } = await getStorageSnapshot()
  await write({
    aliases: {
      ...aliases,
      [alias.id]: alias
    }
  })
  return alias
}

export const upsertAliases = async (nextAliases: AliasRecord[]) => {
  const { aliases } = await getStorageSnapshot()
  const merged = { ...aliases }

  for (const alias of nextAliases) {
    merged[alias.id] = alias
  }

  await write({ aliases: merged })
  return Object.values(merged)
}

export const removeAlias = async (aliasId: string) => {
  const { aliases, blockedAliases } = await getStorageSnapshot()
  const alias = aliases[aliasId]
  const nextAliases = { ...aliases }
  const nextBlockedAliases = { ...blockedAliases }

  delete nextAliases[aliasId]
  if (alias) {
    delete nextBlockedAliases[alias.alias]
  }

  await write({
    aliases: nextAliases,
    blockedAliases: nextBlockedAliases
  })
}

export const markAliasUsed = async (aliasId: string) => {
  const { aliases } = await getStorageSnapshot()
  const alias = aliases[aliasId]
  if (!alias) return undefined

  const updated: AliasRecord = {
    ...alias,
    lastUsedAt: nowIso(),
    updatedAt: nowIso(),
    usageCount: alias.usageCount + 1
  }

  await upsertAlias(updated)
  return updated
}

export const updateAliasStatusLocally = async (
  aliasId: string,
  patch: Partial<AliasRecord>
) => {
  const { aliases } = await getStorageSnapshot()
  const alias = aliases[aliasId]
  if (!alias) return undefined

  const updated: AliasRecord = {
    ...alias,
    ...patch,
    updatedAt: nowIso()
  }

  await upsertAlias(updated)
  return updated
}

export const deleteAliasLocally = async (aliasId: string) =>
  updateAliasStatusLocally(aliasId, { status: "deleted", syncStatus: "pending" })

export const blockAliasLocally = async (aliasId: string, reason?: string) => {
  const { aliases, blockedAliases } = await getStorageSnapshot()
  const alias = aliases[aliasId]
  if (!alias) return undefined

  const timestamp = nowIso()
  const blocked: BlockedAlias = {
    alias: alias.alias,
    reason,
    blockedAt: timestamp
  }

  await write({
    aliases: {
      ...aliases,
      [aliasId]: {
        ...alias,
        status: "blocked",
        syncStatus: "pending",
        updatedAt: timestamp
      }
    },
    blockedAliases: {
      ...blockedAliases,
      [alias.alias]: blocked
    }
  })

  return blocked
}

export const upsertBlockedAliases = async (blockedAliasesToSave: BlockedAlias[]) => {
  const { blockedAliases } = await getStorageSnapshot()
  const merged = { ...blockedAliases }

  for (const blockedAlias of blockedAliasesToSave) {
    merged[blockedAlias.alias] = blockedAlias
  }

  await write({ blockedAliases: merged })
  return merged
}

export const enqueuePendingAction = async (
  action: Omit<PendingAliasAction, "id" | "attempts" | "createdAt" | "updatedAt">
) => {
  const { pendingActions } = await getStorageSnapshot()
  const timestamp = nowIso()
  const pendingAction: PendingAliasAction = {
    ...action,
    id: crypto.randomUUID(),
    attempts: 0,
    createdAt: timestamp,
    updatedAt: timestamp
  }

  await write({
    pendingActions: {
      ...pendingActions,
      [pendingAction.id]: pendingAction
    }
  })

  return pendingAction
}

export const removePendingAction = async (actionId: string) => {
  const { pendingActions } = await getStorageSnapshot()
  const next = { ...pendingActions }
  delete next[actionId]
  await write({ pendingActions: next })
}

export const updatePendingAction = async (
  actionId: string,
  patch: Partial<PendingAliasAction>
) => {
  const { pendingActions } = await getStorageSnapshot()
  const action = pendingActions[actionId]
  if (!action) return undefined

  const updated: PendingAliasAction = {
    ...action,
    ...patch,
    updatedAt: nowIso()
  }

  await write({
    pendingActions: {
      ...pendingActions,
      [actionId]: updated
    }
  })

  return updated
}

export const updateMetadata = async (patch: Partial<ExtensionMetadata>) => {
  const { metadata } = await getStorageSnapshot()
  const next = {
    ...metadata,
    ...patch
  }

  await write({ metadata: next })
  return next
}
