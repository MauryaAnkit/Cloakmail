import type { PlasmoMessaging } from "@plasmohq/messaging"

import { syncAliasesWithCloudflare } from "~src/lib/alias-service"
import type { AliasSyncResult } from "~src/types"

export type ResponseBody = AliasSyncResult

const handler: PlasmoMessaging.MessageHandler<never, ResponseBody> = async (_req, res) => {
  res.send(await syncAliasesWithCloudflare())
}

export default handler
