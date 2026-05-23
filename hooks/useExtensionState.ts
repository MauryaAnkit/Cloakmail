import { useCallback, useEffect, useState } from "react"

import type { ResponseBody as GetStateResponse } from "~background/messages/get-state"
import { sendBackgroundMessage } from "~src/lib/messaging"

export const useExtensionState = () => {
  const [state, setState] = useState<GetStateResponse>()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string>()

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(undefined)

    try {
      setState(await sendBackgroundMessage<never, GetStateResponse>({ name: "get-state" }))
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load extension state.")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  return { state, loading, error, refresh }
}
