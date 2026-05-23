import type { PlasmoMessaging } from "@plasmohq/messaging"

import { createBackupExport } from "~src/lib/backup"
import type { BackupExport } from "~src/types"

export type ResponseBody = BackupExport

const handler: PlasmoMessaging.MessageHandler<never, ResponseBody> = async (_req, res) => {
  res.send(await createBackupExport())
}

export default handler
