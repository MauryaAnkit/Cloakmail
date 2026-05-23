import { Ban, Check, Copy, ExternalLink, Plus, RefreshCw, Search, Settings, ShieldOff, Trash2 } from "lucide-react"
import { useMemo, useState } from "react"

import "~style.css"

import { Button } from "~components/Button"
import { useActiveTab } from "~hooks/useActiveTab"
import { useExtensionState } from "~hooks/useExtensionState"
import type { RequestBody as GenerateAliasRequest, ResponseBody as GenerateAliasResponse } from "~background/messages/generate-alias"
import type { RequestBody as MutateAliasRequest } from "~background/messages/mutate-alias"
import type { ResponseBody as SyncAliasesResponse } from "~background/messages/sync-aliases"
import { sendBackgroundMessage } from "~src/lib/messaging"
import type { AliasRecord } from "~src/types"

const openOptions = () => chrome.runtime.openOptionsPage()

const Popup = () => {
  const hostname = useActiveTab()
  const { state, loading, error, refresh } = useExtensionState()
  const [currentAlias, setCurrentAlias] = useState<AliasRecord>()
  const [query, setQuery] = useState("")
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState<string>()
  const [message, setMessage] = useState<string>()

  const aliases = useMemo(() => {
    const items = Object.values(state?.aliases ?? {})
    const normalizedQuery = query.trim().toLowerCase()

    if (!normalizedQuery) return items.slice(0, 8)

    return items
      .filter((alias) =>
        [alias.alias, alias.hostname, alias.label].some((value) =>
          value.toLowerCase().includes(normalizedQuery)
        )
      )
      .slice(0, 12)
  }, [query, state?.aliases])

  const generate = async () => {
    if (!hostname) {
      setMessage("Open a website tab first.")
      return
    }

    setBusy(true)
    setMessage(undefined)

    try {
      const response = await sendBackgroundMessage<GenerateAliasRequest, GenerateAliasResponse>({
        name: "generate-alias",
        body: { hostname }
      })
      setCurrentAlias(response.alias)
      await copy(response.alias.alias)
      await refresh()
      setMessage(response.created ? "Alias created and copied." : "Existing alias copied.")
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not generate alias.")
    } finally {
      setBusy(false)
    }
  }

  const copy = async (alias: string) => {
    await navigator.clipboard.writeText(alias)
    setCopied(alias)
    window.setTimeout(() => setCopied(undefined), 1200)
  }

  const mutateAlias = async (aliasId: string, action: MutateAliasRequest["action"]) => {
    const destructive = action === "delete" || action === "block"
    if (destructive && !window.confirm("Stop this alias from forwarding email?")) return

    setBusy(true)
    setMessage(undefined)

    try {
      await sendBackgroundMessage<MutateAliasRequest, unknown>({
        name: "mutate-alias",
        body: { aliasId, action }
      })
      await refresh()
      setMessage(action === "delete" ? "Alias deleted from Cloudflare and local storage." : "Alias updated.")
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not update alias.")
    } finally {
      setBusy(false)
    }
  }

  const syncAliases = async () => {
    setBusy(true)
    setMessage(undefined)

    try {
      const response = await sendBackgroundMessage<never, SyncAliasesResponse>({
        name: "sync-aliases"
      })
      await refresh()
      setMessage(response.message)
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not sync aliases.")
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return <main className="grid h-[420px] w-[360px] place-items-center bg-ink text-zinc-300">Loading...</main>
  }

  if (!state?.settings?.setupComplete) {
    return (
      <main className="w-[360px] bg-ink p-5 text-white">
        <div className="mb-7 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">Cloakmail</h1>
            <p className="mt-1 text-sm text-zinc-400">Private aliases on your domain.</p>
          </div>
          <Settings className="h-5 w-5 text-mint" />
        </div>
        <Button className="w-full" onClick={openOptions}>
          <ExternalLink className="h-4 w-4" />
          Set up Cloudflare
        </Button>
        {error ? <p className="mt-4 text-sm text-coral">{error}</p> : null}
      </main>
    )
  }

  return (
    <main className="w-[380px] bg-ink text-white">
      <section className="border-b border-white/10 p-4">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold">Cloakmail</h1>
            <p className="text-xs text-zinc-400">{hostname ?? "No website detected"}</p>
          </div>
          <button
            className="rounded-md p-2 text-zinc-300 transition hover:bg-white/10 hover:text-white"
            title="Settings"
            onClick={openOptions}>
            <Settings className="h-5 w-5" />
          </button>
        </div>

        <Button className="w-full" disabled={busy} onClick={generate}>
          <Plus className="h-4 w-4" />
          {busy ? "Generating..." : "Generate alias"}
        </Button>
        <Button className="mt-2 w-full" variant="secondary" disabled={busy} onClick={syncAliases}>
          <RefreshCw className="h-4 w-4" />
          Sync Cloudflare rules
        </Button>

        {currentAlias ? (
          <div className="mt-3 rounded-md border border-mint/30 bg-mint/10 p-3">
            <p className="text-xs uppercase tracking-wide text-mint">Current website alias</p>
            <div className="mt-1 flex items-center gap-2">
              <p className="min-w-0 flex-1 truncate text-sm font-semibold">{currentAlias.alias}</p>
              <button title="Copy alias" onClick={() => copy(currentAlias.alias)}>
                {copied === currentAlias.alias ? <Check className="h-4 w-4 text-mint" /> : <Copy className="h-4 w-4 text-zinc-300" />}
              </button>
            </div>
          </div>
        ) : null}

        {message ? <p className="mt-3 text-sm text-zinc-300">{message}</p> : null}
      </section>

      <section className="p-4">
        <div className="mb-3 flex items-center gap-2 rounded-md border border-white/10 bg-white/8 px-3">
          <Search className="h-4 w-4 text-zinc-500" />
          <input
            className="h-10 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-zinc-500"
            placeholder="Search aliases"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>

        <div className="grid max-h-[260px] gap-2 overflow-y-auto overflow-x-hidden pr-1">
          {aliases.map((alias) => (
            <article key={alias.id} className="min-w-0 rounded-md border border-white/10 bg-white/6 p-3">
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <p className="break-all text-sm font-semibold leading-5">{alias.alias}</p>
                  <p className="truncate text-xs text-zinc-500">{alias.hostname}</p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    <StatusBadge value={alias.status ?? "active"} />
                    <StatusBadge value={alias.syncStatus ?? "local"} muted />
                    {alias.routingMode === "dedicated_rule" ? <StatusBadge value="Cloudflare" muted /> : null}
                  </div>
                </div>
                <button className="shrink-0" title="Copy alias" onClick={() => copy(alias.alias)}>
                  {copied === alias.alias ? <Check className="h-4 w-4 text-mint" /> : <Copy className="h-4 w-4 text-zinc-300" />}
                </button>
                {alias.status === "active" ? (
                  <button className="shrink-0" title="Disable forwarding" onClick={() => mutateAlias(alias.id, "disable")}>
                    <ShieldOff className="h-4 w-4 text-zinc-300" />
                  </button>
                ) : alias.status !== "deleted" ? (
                  <button className="shrink-0" title="Enable forwarding" onClick={() => mutateAlias(alias.id, "enable")}>
                    <Check className="h-4 w-4 text-zinc-300" />
                  </button>
                ) : null}
                {alias.status !== "deleted" ? (
                  <>
                    <button className="shrink-0" title="Block alias" onClick={() => mutateAlias(alias.id, "block")}>
                      <Ban className="h-4 w-4 text-zinc-300" />
                    </button>
                    <button className="shrink-0" title="Delete alias" onClick={() => mutateAlias(alias.id, "delete")}>
                      <Trash2 className="h-4 w-4 text-zinc-300" />
                    </button>
                  </>
                ) : null}
              </div>
              {alias.syncError ? <p className="mt-2 text-xs text-coral">{alias.syncError}</p> : null}
            </article>
          ))}
          {aliases.length === 0 ? <p className="py-8 text-center text-sm text-zinc-500">No aliases yet.</p> : null}
        </div>
      </section>
    </main>
  )
}

export default Popup

const StatusBadge = ({ value, muted = false }: { value?: string; muted?: boolean }) => {
  const label = value ?? "unknown"
  const color =
    label === "active" || label === "synced"
      ? "border-mint/30 bg-mint/10 text-mint"
      : label === "deleted" || label === "blocked" || label === "error" || label === "missing"
        ? "border-coral/30 bg-coral/10 text-coral"
        : muted
          ? "border-white/10 bg-white/6 text-zinc-400"
          : "border-white/10 bg-white/10 text-zinc-300"

  return (
    <span className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase ${color}`}>
      {label.replace("_", " ")}
    </span>
  )
}
