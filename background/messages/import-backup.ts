import type { PlasmoMessaging } from "@plasmohq/messaging"

import { importBackup } from "~src/lib/backup"

export type RequestBody = {
  backup: unknown
}

export type ResponseBody = {
  importedAliases: number
  message: string
}

const handler: PlasmoMessaging.MessageHandler<RequestBody, ResponseBody> = async (req, res) => {
  if (!req.body) {
    throw new Error("Backup file is required.")
  }

  res.send(await importBackup(req.body.backup))
}

export default handler
