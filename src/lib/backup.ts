import { nowIso } from "~src/lib/dates"
import {
  getSettings,
  getStorageSnapshot,
  saveSettings,
  upsertBlockedAliases,
  upsertAliases,
  updateMetadata
} from "~src/lib/storage"
import type { AliasRecord, BackupExport, BlockedAlias } from "~src/types"

const BACKUP_SCHEMA_VERSION = 1

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const isAliasRecord = (value: unknown): value is AliasRecord => {
  if (!isRecord(value)) return false
  return (
    typeof value.id === "string" &&
    typeof value.alias === "string" &&
    typeof value.localPart === "string" &&
    typeof value.domain === "string" &&
    typeof value.siteKey === "string" &&
    typeof value.hostname === "string" &&
    typeof value.label === "string" &&
    typeof value.status === "string" &&
    typeof value.createdAt === "string" &&
    typeof value.updatedAt === "string"
  )
}

const isBlockedAlias = (value: unknown): value is BlockedAlias => {
  if (!isRecord(value)) return false
  return typeof value.alias === "string" && typeof value.blockedAt === "string"
}

export const createBackupExport = async (): Promise<BackupExport> => {
  const snapshot = await getStorageSnapshot()

  if (!snapshot.settings) {
    throw new Error("Settings are not configured yet.")
  }

  const aliases = Object.values(snapshot.aliases)
  const blockedAliases = Object.values(snapshot.blockedAliases)

  return {
    schemaVersion: BACKUP_SCHEMA_VERSION,
    app: "Cloakmail",
    exportedAt: nowIso(),
    settings: {
      zoneId: snapshot.settings.zoneId,
      domain: snapshot.settings.domain,
      forwardingEmail: snapshot.settings.forwardingEmail,
      routingMode: "dedicated_rule",
      darkMode: snapshot.settings.darkMode
    },
    aliases,
    blockedAliases,
    metadata: {
      aliasCount: aliases.length,
      sourceSchemaVersion: snapshot.metadata.schemaVersion
    }
  }
}

export const validateBackupExport = (value: unknown): BackupExport => {
  if (!isRecord(value)) throw new Error("Backup file is not a JSON object.")
  if (value.app !== "Cloakmail") throw new Error("This is not a Cloakmail backup.")
  if (value.schemaVersion !== BACKUP_SCHEMA_VERSION) {
    throw new Error("Unsupported backup schema version.")
  }
  if (!isRecord(value.settings)) throw new Error("Backup settings are missing.")
  if (!Array.isArray(value.aliases)) throw new Error("Backup aliases are missing.")
  if (!Array.isArray(value.blockedAliases)) throw new Error("Backup blocked aliases are missing.")

  const settings = value.settings
  if (
    typeof settings.zoneId !== "string" ||
    typeof settings.domain !== "string" ||
    typeof settings.forwardingEmail !== "string"
  ) {
    throw new Error("Backup settings are invalid.")
  }

  if (!value.aliases.every(isAliasRecord)) {
    throw new Error("Backup contains invalid aliases.")
  }

  if (!value.blockedAliases.every(isBlockedAlias)) {
    throw new Error("Backup contains invalid blocked aliases.")
  }

  return value as BackupExport
}

export const importBackup = async (input: unknown) => {
  const backup = validateBackupExport(input)
  const existingSettings = await getSettings()

  await saveSettings({
    zoneId: backup.settings.zoneId,
    domain: backup.settings.domain,
    forwardingEmail: backup.settings.forwardingEmail,
    routingMode: "dedicated_rule",
    darkMode: backup.settings.darkMode,
    setupComplete: Boolean(existingSettings?.hasEncryptedApiToken),
    hasEncryptedApiToken: Boolean(existingSettings?.hasEncryptedApiToken)
  })

  await upsertAliases(
    backup.aliases.map((alias) => ({
      ...alias,
      routingMode: "dedicated_rule",
      syncStatus: alias.syncStatus ?? "pending"
    }))
  )
  await upsertBlockedAliases(backup.blockedAliases)
  await updateMetadata({ lastAliasSyncAt: undefined })

  return {
    importedAliases: backup.aliases.length,
    message: `Imported ${backup.aliases.length} aliases. API token was not included in the backup.`
  }
}
