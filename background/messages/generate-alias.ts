import type { PlasmoMessaging } from "@plasmohq/messaging"

import { generateAliasForHostname } from "~src/lib/alias"
import type { GeneratedAliasResult } from "~src/types"

export type RequestBody = {
  hostname: string
}

export type ResponseBody = GeneratedAliasResult

const handler: PlasmoMessaging.MessageHandler<RequestBody, ResponseBody> = async (req, res) => {
  if (!req.body?.hostname) {
    throw new Error("Hostname is required.")
  }

  res.send(await generateAliasForHostname(req.body.hostname))
}

export default handler
