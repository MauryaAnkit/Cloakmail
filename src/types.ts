export type RoutingMode = "dedicated_rule"

export type AliasStatus = "active" | "disabled" | "blocked" | "deleted"

export type AliasSyncStatus = "local" | "syncing" | "synced" | "pending" | "error" | "missing"

export type PendingAliasActionType =
  | "create_rule"
  | "forward_rule"
  | "drop_rule"
  | "delete_rule"
  | "sync_alias"

export type CloudflareRoutingStatus =
  | "ready"
  | "unconfigured"
  | "misconfigured"
  | "pending"
  | "unknown"

export type ExtensionSettings = {
  zoneId: string
  domain: string
  forwardingEmail: string
  routingMode: RoutingMode
  darkMode: boolean
  setupComplete: boolean
  hasEncryptedApiToken: boolean
  createdAt: string
  updatedAt: string
}

export type EncryptedSecret = {
  version: 1
  algorithm: "AES-GCM"
  kdf: "PBKDF2"
  iterations: number
  salt: string
  iv: string
  ciphertext: string
  createdAt: string
  updatedAt: string
}

export type AliasRecord = {
  id: string
  alias: string
  localPart: string
  domain: string
  siteKey: string
  hostname: string
  label: string
  suffix: string
  status: AliasStatus
  routingMode: RoutingMode
  cloudflareRuleId?: string
  cloudflareRuleName?: string
  cloudflareEnabled?: boolean
  syncStatus: AliasSyncStatus
  syncError?: string
  lastSyncedAt?: string
  pendingAction?: PendingAliasActionType
  createdAt: string
  updatedAt: string
  lastUsedAt?: string
  usageCount: number
  note?: string
}

export type BlockedAlias = {
  alias: string
  reason?: string
  blockedAt: string
}

export type ExtensionMetadata = {
  schemaVersion: 3
  installedAt: string
  installationId: string
  lastCloudflareCheckAt?: string
  lastAliasSyncAt?: string
}

export type PendingAliasAction = {
  id: string
  aliasId: string
  type: PendingAliasActionType
  attempts: number
  createdAt: string
  updatedAt: string
  lastError?: string
}

export type StorageShape = {
  settings?: ExtensionSettings
  aliases: Record<string, AliasRecord>
  blockedAliases: Record<string, BlockedAlias>
  pendingActions: Record<string, PendingAliasAction>
  encryptedApiToken?: EncryptedSecret
  metadata: ExtensionMetadata
}

export type SetupInput = {
  apiToken?: string
  zoneId: string
  domain: string
  forwardingEmail: string
  routingMode?: RoutingMode
}

export type SetupValidationResult = {
  ok: boolean
  errors: Partial<Record<keyof SetupInput, string>>
}

export type CloudflareTestResult = {
  ok: boolean
  tokenValid: boolean
  zoneValid: boolean
  emailRoutingEnabled: boolean
  routingStatus: CloudflareRoutingStatus
  zoneName?: string
  message: string
}

export type GeneratedAliasResult = {
  alias: AliasRecord
  created: boolean
}

export type AliasMutationAction = "delete" | "disable" | "enable" | "block" | "mark_used"

export type AliasSyncResult = {
  aliases: AliasRecord[]
  created: number
  updated: number
  missing: number
  message: string
}

export type BackupExport = {
  schemaVersion: 1
  app: "Cloakmail"
  exportedAt: string
  settings: Pick<ExtensionSettings, "zoneId" | "domain" | "forwardingEmail" | "routingMode" | "darkMode">
  aliases: AliasRecord[]
  blockedAliases: BlockedAlias[]
  metadata: {
    aliasCount: number
    sourceSchemaVersion: number
  }
}

export type RuntimeMessageResponse<T> = {
  ok: boolean
  data?: T
  error?: string
}
