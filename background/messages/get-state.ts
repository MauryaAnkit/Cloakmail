import type { PlasmoMessaging } from "@plasmohq/messaging"

import { getStorageSnapshot } from "~src/lib/storage"
import type { ExtensionMetadata, StorageShape } from "~src/types"

export type ResponseBody = Omit<StorageShape, "encryptedApiToken" | "metadata"> & {
  metadata: Omit<ExtensionMetadata, "installationId">
}

const handler: PlasmoMessaging.MessageHandler<never, ResponseBody> = async (_req, res) => {
  const { encryptedApiToken: _encryptedApiToken, metadata, ...snapshot } = await getStorageSnapshot()
  const { installationId: _installationId, ...publicMetadata } = metadata
  res.send({
    ...snapshot,
    metadata: publicMetadata
  })
}

export default handler
