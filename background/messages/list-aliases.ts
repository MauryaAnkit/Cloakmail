import type { PlasmoMessaging } from "@plasmohq/messaging"

import { listAliases } from "~src/lib/storage"
import type { AliasRecord } from "~src/types"

export type ResponseBody = AliasRecord[]

const handler: PlasmoMessaging.MessageHandler<never, ResponseBody> = async (_req, res) => {
  res.send(await listAliases())
}

export default handler
