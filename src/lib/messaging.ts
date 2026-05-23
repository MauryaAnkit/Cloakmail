import { sendToBackground } from "@plasmohq/messaging"

type BackgroundRequest<RequestBody> = {
  name: string
  body?: RequestBody
}

export const sendBackgroundMessage = async <RequestBody, ResponseBody>(
  request: BackgroundRequest<RequestBody>
) =>
  sendToBackground<RequestBody, ResponseBody>({
    name: request.name as never,
    body: request.body
  })
