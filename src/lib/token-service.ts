import { decryptString, encryptString } from "~src/lib/crypto"
import {
  getEncryptedApiToken,
  getSettings,
  getLegacyPlaintextApiToken,
  getOrCreateMetadata,
  saveSettings,
  saveEncryptedApiToken
} from "~src/lib/storage"

let decryptedTokenCache: string | undefined

export const saveApiTokenEncrypted = async (apiToken: string) => {
  const trimmed = apiToken.trim()
  if (!trimmed) return

  const metadata = await getOrCreateMetadata()
  const existing = await getEncryptedApiToken()
  const encrypted = await encryptString(trimmed, metadata.installationId, existing)
  await saveEncryptedApiToken(encrypted)
  decryptedTokenCache = trimmed
}

export const getDecryptedApiToken = async () => {
  if (decryptedTokenCache) return decryptedTokenCache

  const [metadata, encrypted] = await Promise.all([getOrCreateMetadata(), getEncryptedApiToken()])

  if (!encrypted) {
    const legacyPlaintextToken = await getLegacyPlaintextApiToken()
    if (legacyPlaintextToken) {
      await saveApiTokenEncrypted(legacyPlaintextToken)
      const settings = await getSettings()
      if (settings) {
        await saveSettings({
          zoneId: settings.zoneId,
          domain: settings.domain,
          forwardingEmail: settings.forwardingEmail,
          routingMode: "dedicated_rule",
          darkMode: settings.darkMode,
          setupComplete: settings.setupComplete,
          hasEncryptedApiToken: true
        })
      }
      decryptedTokenCache = legacyPlaintextToken
      return decryptedTokenCache
    }

    throw new Error("Cloudflare API token is not saved.")
  }

  decryptedTokenCache = await decryptString(encrypted, metadata.installationId)
  return decryptedTokenCache
}

export const clearTokenMemoryCache = () => {
  decryptedTokenCache = undefined
}
