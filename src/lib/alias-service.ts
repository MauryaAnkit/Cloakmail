import { CloudflareClient, type RoutingRule } from "~src/lib/cloudflare"
import { nowIso } from "~src/lib/dates"
import {
  blockAliasLocally,
  deleteAliasLocally,
  enqueuePendingAction,
  getAliasByAddress,
  getSettings,
  getStorageSnapshot,
  removeAlias,
  updateAliasStatusLocally,
  updateMetadata,
  upsertAlias,
  upsertAliases
} from "~src/lib/storage"
import { getDecryptedApiToken } from "~src/lib/token-service"
import type { AliasRecord, AliasStatus, AliasSyncResult } from "~src/types"

const isLiteralAliasRule = (rule: RoutingRule, alias: string) =>
  rule.matchers?.some(
    (matcher) =>
      matcher.type === "literal" &&
      matcher.field === "to" &&
      matcher.value?.toLowerCase() === alias.toLowerCase()
  )

const isForwardRule = (rule: RoutingRule) =>
  rule.actions?.some((action) => action.type === "forward")

const isDropRule = (rule: RoutingRule) => rule.actions?.some((action) => action.type === "drop")

const createClient = async () => {
  const settings = await getSettings()

  if (!settings?.setupComplete) {
    throw new Error("Cloakmail is not configured yet.")
  }

  return {
    settings,
    client: new CloudflareClient(await getDecryptedApiToken())
  }
}

export const attachCloudflareForwardRule = async (alias: AliasRecord) => {
  const { settings, client } = await createClient()

  if (settings.routingMode !== "dedicated_rule") {
    return alias
  }

  const syncing =
    (await updateAliasStatusLocally(alias.id, {
      routingMode: "dedicated_rule",
      syncStatus: "syncing",
      pendingAction: "create_rule",
      syncError: undefined
    })) ?? alias

  try {
    const rule = syncing.cloudflareRuleId
      ? await client.updateForwardRule(
          settings.zoneId,
          syncing.cloudflareRuleId,
          syncing.alias,
          settings.forwardingEmail
        )
      : await client.createForwardRule(settings.zoneId, syncing.alias, settings.forwardingEmail)

    const updated: AliasRecord = {
      ...syncing,
      status: "active",
      routingMode: "dedicated_rule",
      cloudflareRuleId: rule.id,
      cloudflareRuleName: rule.name,
      cloudflareEnabled: rule.enabled ?? true,
      syncStatus: "synced",
      syncError: undefined,
      pendingAction: undefined,
      lastSyncedAt: nowIso(),
      updatedAt: nowIso()
    }

    await upsertAlias(updated)
    return updated
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not create Cloudflare rule."
    await enqueuePendingAction({
      aliasId: syncing.id,
      type: "create_rule",
      lastError: message
    })

    await upsertAlias({
      ...syncing,
      syncStatus: "error",
      syncError: message,
      pendingAction: "create_rule",
      updatedAt: nowIso()
    })

    throw error
  }
}

export const setDedicatedAliasDelivery = async (
  aliasId: string,
  status: Extract<AliasStatus, "active" | "disabled" | "blocked" | "deleted">,
  reason?: string
) => {
  const { settings, client } = await createClient()
  const { aliases } = await getStorageSnapshot()
  const alias = aliases[aliasId]

  if (!alias) {
    throw new Error("Alias not found.")
  }

  if (settings.routingMode !== "dedicated_rule" || alias.routingMode !== "dedicated_rule") {
    if (status === "blocked") return blockAliasLocally(aliasId, reason)
    if (status === "deleted") return deleteAliasLocally(aliasId)
    return updateAliasStatusLocally(aliasId, { status, syncStatus: "pending" })
  }

  const pendingAction =
    status === "active"
      ? "forward_rule"
      : status === "deleted"
        ? "delete_rule"
        : status === "disabled"
          ? "sync_alias"
          : "drop_rule"
  await updateAliasStatusLocally(aliasId, {
    syncStatus: "syncing",
    pendingAction,
    syncError: undefined
  })

  try {
    if (status === "deleted") {
      if (alias.cloudflareRuleId) {
        await client.deleteRoutingRule(settings.zoneId, alias.cloudflareRuleId)
      }

      await removeAlias(aliasId)
      return {
        ...alias,
        status: "deleted" as const,
        syncStatus: "synced" as const,
        cloudflareRuleId: undefined,
        cloudflareRuleName: undefined,
        cloudflareEnabled: false,
        updatedAt: nowIso()
      } satisfies AliasRecord
    }

    const rule = alias.cloudflareRuleId
      ? status === "active"
        ? await client.updateForwardRule(
            settings.zoneId,
            alias.cloudflareRuleId,
            alias.alias,
            settings.forwardingEmail
          )
        : status === "disabled"
          ? await client.disableForwardRule(
              settings.zoneId,
              alias.cloudflareRuleId,
              alias.alias,
              settings.forwardingEmail
            )
          : await client.updateDropRule(settings.zoneId, alias.cloudflareRuleId, alias.alias)
      : status === "active"
        ? await client.createForwardRule(settings.zoneId, alias.alias, settings.forwardingEmail)
        : status === "disabled"
          ? await client
              .createForwardRule(settings.zoneId, alias.alias, settings.forwardingEmail)
              .then((createdRule) =>
                client.disableForwardRule(
                  settings.zoneId,
                  requireRuleId(createdRule),
                  alias.alias,
                  settings.forwardingEmail
                )
              )
          : await client.createDropRule(settings.zoneId, alias.alias)

    const updated: AliasRecord = {
      ...alias,
      status,
      routingMode: "dedicated_rule",
      cloudflareRuleId: rule.id,
      cloudflareRuleName: rule.name,
      cloudflareEnabled: status === "disabled" ? false : rule.enabled ?? true,
      syncStatus: "synced",
      syncError: undefined,
      pendingAction: undefined,
      lastSyncedAt: nowIso(),
      updatedAt: nowIso()
    }

    await upsertAlias(updated)

    return updated
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not update Cloudflare rule."
    await enqueuePendingAction({
      aliasId,
      type: pendingAction,
      lastError: message
    })

    await updateAliasStatusLocally(aliasId, {
      syncStatus: "error",
      syncError: message,
      pendingAction
    })

    throw error
  }
}

const requireRuleId = (rule: RoutingRule) => {
  if (!rule.id) {
    throw new Error("Cloudflare did not return a routing rule ID.")
  }

  return rule.id
}

export const syncAliasesWithCloudflare = async (): Promise<AliasSyncResult> => {
  const { settings, client } = await createClient()
  const { aliases } = await getStorageSnapshot()
  const rules = await client.listRoutingRules(settings.zoneId)
  const timestamp = nowIso()
  const updates: AliasRecord[] = []
  let created = 0
  let updated = 0
  let missing = 0

  for (const alias of Object.values(aliases)) {
    if (alias.routingMode !== "dedicated_rule") continue

    const rule = alias.cloudflareRuleId
      ? rules.find((candidate) => candidate.id === alias.cloudflareRuleId)
      : rules.find((candidate) => isLiteralAliasRule(candidate, alias.alias))

    if (!rule) {
      missing += 1
      updates.push({
        ...alias,
        syncStatus: "missing",
        syncError: "Cloudflare rule is missing.",
        updatedAt: timestamp
      })
      continue
    }

    const nextStatus: AliasStatus = isDropRule(rule)
      ? alias.status === "deleted"
        ? "deleted"
        : "blocked"
      : rule.enabled === false
        ? "disabled"
        : isForwardRule(rule)
          ? "active"
          : alias.status

    updates.push({
      ...alias,
      status: nextStatus,
      cloudflareRuleId: rule.id,
      cloudflareRuleName: rule.name,
      cloudflareEnabled: rule.enabled ?? true,
      syncStatus: "synced",
      syncError: undefined,
      pendingAction: undefined,
      lastSyncedAt: timestamp,
      updatedAt: timestamp
    })
    updated += 1
  }

  for (const rule of rules) {
    const matcher = rule.matchers?.find(
      (candidate) => candidate.type === "literal" && candidate.field === "to"
    )
    const address = matcher?.value?.toLowerCase()
    if (!address || !rule.id || !address.endsWith(`@${settings.domain}`)) continue
    if (await getAliasByAddress(address)) continue

    const localPart = address.split("@")[0] ?? address
    const label = localPart.split(".")[0] ?? "imported"
    updates.push({
      id: crypto.randomUUID(),
      alias: address,
      localPart,
      domain: settings.domain,
      siteKey: `imported:${address}`,
      hostname: "imported",
      label,
      suffix: "sync",
      status: isDropRule(rule) ? "blocked" : rule.enabled === false ? "disabled" : "active",
      routingMode: "dedicated_rule",
      cloudflareRuleId: rule.id,
      cloudflareRuleName: rule.name,
      cloudflareEnabled: rule.enabled ?? true,
      syncStatus: "synced",
      lastSyncedAt: timestamp,
      createdAt: timestamp,
      updatedAt: timestamp,
      usageCount: 0
    })
    created += 1
  }

  if (updates.length > 0) {
    await upsertAliases(updates)
  }

  await updateMetadata({ lastAliasSyncAt: timestamp })

  return {
    aliases: Object.values((await getStorageSnapshot()).aliases),
    created,
    updated,
    missing,
    message: `Sync complete. Imported ${created}, updated ${updated}, missing ${missing}.`
  }
}
