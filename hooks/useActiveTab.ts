import { useEffect, useState } from "react"

export const useActiveTab = () => {
  const [hostname, setHostname] = useState<string>()

  useEffect(() => {
    void chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
      if (!tab?.url) return

      try {
        setHostname(new URL(tab.url).hostname)
      } catch {
        setHostname(undefined)
      }
    })
  }, [])

  return hostname
}
