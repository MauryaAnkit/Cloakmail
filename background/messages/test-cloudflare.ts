import type { PlasmoMessaging } from "@plasmohq/messaging"

import { testCloudflareSetup } from "~src/lib/cloudflare"
import { updateMetadata } from "~src/lib/storage"
import { getDecryptedApiToken } from "~src/lib/token-service"
import type { CloudflareTestResult, SetupInput } from "~src/types"

export type RequestBody = SetupInput
export type ResponseBody = CloudflareTestResult

const handler: PlasmoMessaging.MessageHandler<RequestBody, ResponseBody> = async (req, res) => {
  if (!req.body) {
    throw new Error("Cloudflare settings are required.")
  }

  const apiToken = req.body.apiToken?.trim() || (await getDecryptedApiToken())
  const result = await testCloudflareSetup({ ...req.body, apiToken })
  await updateMetadata({ lastCloudflareCheckAt: new Date().toISOString() })
  res.send(result)
}

export default handler
