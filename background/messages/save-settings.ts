import type { PlasmoMessaging } from "@plasmohq/messaging"

import { normalizeDomain, normalizeEmail, validateSetupInput } from "~src/lib/validation"
import { getEncryptedApiToken, saveSettings } from "~src/lib/storage"
import { saveApiTokenEncrypted } from "~src/lib/token-service"
import type { ExtensionSettings, SetupInput } from "~src/types"

export type RequestBody = SetupInput & {
  darkMode?: boolean
}

export type ResponseBody = ExtensionSettings

const handler: PlasmoMessaging.MessageHandler<RequestBody, ResponseBody> = async (req, res) => {
  if (!req.body) {
    throw new Error("Settings are required.")
  }

  const validation = validateSetupInput(req.body)

  if (!validation.ok) {
    throw new Error(Object.values(validation.errors)[0] ?? "Check your settings.")
  }

  if (req.body.apiToken?.trim()) {
    await saveApiTokenEncrypted(req.body.apiToken)
  }

  if (!(await getEncryptedApiToken()) && !req.body.apiToken?.trim()) {
    throw new Error("Cloudflare API token is required.")
  }

  const settings = await saveSettings({
    zoneId: req.body.zoneId.trim(),
    domain: normalizeDomain(req.body.domain),
    forwardingEmail: normalizeEmail(req.body.forwardingEmail),
    routingMode: "dedicated_rule",
    darkMode: req.body.darkMode ?? true,
    hasEncryptedApiToken: true,
    setupComplete: true
  })

  res.send(settings)
}

export default handler
