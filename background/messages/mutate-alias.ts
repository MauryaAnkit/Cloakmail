import type { PlasmoMessaging } from "@plasmohq/messaging"

import {
  markAliasUsed
} from "~src/lib/storage"
import { setDedicatedAliasDelivery } from "~src/lib/alias-service"
import type { AliasMutationAction, AliasRecord, BlockedAlias } from "~src/types"

export type RequestBody = {
  aliasId: string
  action: AliasMutationAction
  reason?: string
}

export type ResponseBody = AliasRecord | BlockedAlias | undefined

const handler: PlasmoMessaging.MessageHandler<RequestBody, ResponseBody> = async (req, res) => {
  if (!req.body) {
    throw new Error("Alias mutation request is required.")
  }

  const { aliasId, action, reason } = req.body

  if (action === "delete") {
    res.send(await setDedicatedAliasDelivery(aliasId, "deleted", reason))
    return
  }

  if (action === "block") {
    res.send(await setDedicatedAliasDelivery(aliasId, "blocked", reason))
    return
  }

  if (action === "disable") {
    res.send(await setDedicatedAliasDelivery(aliasId, "disabled", reason))
    return
  }

  if (action === "enable") {
    res.send(await setDedicatedAliasDelivery(aliasId, "active", reason))
    return
  }

  res.send(await markAliasUsed(aliasId))
}

export default handler
