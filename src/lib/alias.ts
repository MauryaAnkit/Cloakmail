import { nowIso } from "~src/lib/dates"
import { attachCloudflareForwardRule } from "~src/lib/alias-service"
import {
  getAliasByAddress,
  getAliasBySiteKey,
  getSettings,
  upsertAlias
} from "~src/lib/storage"
import type { AliasRecord, GeneratedAliasResult } from "~src/types"

const suffixAlphabet = "23456789abcdefghjkmnpqrstuvwxyz"

export const normalizeHostname = (rawHostname: string) => {
  try {
    const url = rawHostname.includes("://") ? new URL(rawHostname) : new URL(`https://${rawHostname}`)
    return url.hostname.toLowerCase().replace(/^www\./, "")
  } catch {
    return rawHostname.toLowerCase().replace(/^www\./, "").replace(/[^a-z0-9.-]/g, "")
  }
}

export const getSiteLabel = (hostname: string) => {
  const normalized = normalizeHostname(hostname)
  const parts = normalized.split(".").filter(Boolean)
  const label = (parts.length >= 2 ? parts[parts.length - 2] : parts[0]) ?? "site"
  return normalizeAliasLabel(label)
}

export const normalizeAliasLabel = (value: string) => {
  const cleaned = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 28)

  return cleaned || "site"
}

const randomSuffix = (length = 4) => {
  const bytes = crypto.getRandomValues(new Uint8Array(length))
  return Array.from(bytes, (byte) => suffixAlphabet[byte % suffixAlphabet.length] ?? "x").join("")
}

export const createSiteKey = (hostname: string) => normalizeHostname(hostname)

export const generateAliasForHostname = async (
  hostname: string
): Promise<GeneratedAliasResult> => {
  const settings = await getSettings()

  if (!settings?.setupComplete) {
    throw new Error("Cloakmail is not configured yet.")
  }

  const normalizedHostname = normalizeHostname(hostname)
  const siteKey = createSiteKey(normalizedHostname)
  const existing = await getAliasBySiteKey(siteKey)

  if (existing && existing.status === "active") {
    const syncedExisting =
      settings.routingMode === "dedicated_rule" &&
      (!existing.cloudflareRuleId || existing.routingMode !== "dedicated_rule")
        ? await attachCloudflareForwardRule({
            ...existing,
            routingMode: "dedicated_rule",
            syncStatus: "syncing"
          })
        : existing

    return { alias: syncedExisting, created: false }
  }

  const label = getSiteLabel(normalizedHostname)
  let suffix = randomSuffix()
  let localPart = `${label}.${suffix}`
  let address = `${localPart}@${settings.domain}`

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const collision = await getAliasByAddress(address)
    if (!collision) break

    suffix = randomSuffix()
    localPart = `${label}.${suffix}`
    address = `${localPart}@${settings.domain}`
  }

  if (await getAliasByAddress(address)) {
    throw new Error("Could not generate a unique alias. Try again.")
  }

  const timestamp = nowIso()
  const alias: AliasRecord = {
    id: crypto.randomUUID(),
    alias: address,
    localPart,
    domain: settings.domain,
    siteKey,
    hostname: normalizedHostname,
    label,
    suffix,
    status: "active",
    routingMode: settings.routingMode,
    syncStatus: settings.routingMode === "dedicated_rule" ? "syncing" : "local",
    createdAt: timestamp,
    updatedAt: timestamp,
    usageCount: 0
  }

  await upsertAlias(alias)
  const syncedAlias =
    settings.routingMode === "dedicated_rule" ? await attachCloudflareForwardRule(alias) : alias

  return { alias: syncedAlias, created: true }
}
