import { CheckCircle2, Cloud, Download, HelpCircle, ShieldCheck, Upload, Wrench } from "lucide-react"
import { useEffect, useRef, useState } from "react"

import "~style.css"

import { Button } from "~components/Button"
import { TextField } from "~components/TextField"
import { useExtensionState } from "~hooks/useExtensionState"
import type { RequestBody as SaveSettingsRequest } from "~background/messages/save-settings"
import type { RequestBody as TestCloudflareRequest, ResponseBody as TestCloudflareResponse } from "~background/messages/test-cloudflare"
import type { ResponseBody as ExportBackupResponse } from "~background/messages/export-backup"
import type { RequestBody as ImportBackupRequest, ResponseBody as ImportBackupResponse } from "~background/messages/import-backup"
import { sendBackgroundMessage } from "~src/lib/messaging"
import { validateSetupInput } from "~src/lib/validation"
import type { SetupInput } from "~src/types"

const emptyForm: SetupInput = {
  apiToken: "",
  zoneId: "",
  domain: "",
  forwardingEmail: "",
  routingMode: "dedicated_rule"
}

const Options = () => {
  const { state, refresh } = useExtensionState()
  const [form, setForm] = useState<SetupInput>(emptyForm)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [testing, setTesting] = useState(false)
  const [saving, setSaving] = useState(false)
  const [result, setResult] = useState<TestCloudflareResponse>()
  const [message, setMessage] = useState<string>()
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!state?.settings) return
    setForm({
      apiToken: "",
      zoneId: state.settings.zoneId,
      domain: state.settings.domain,
      forwardingEmail: state.settings.forwardingEmail,
      routingMode: "dedicated_rule"
    })
  }, [state?.settings])

  const updateField = (field: keyof SetupInput, value: string) => {
    setForm((current) => ({ ...current, [field]: value }))
    setErrors((current) => ({ ...current, [field]: "" }))
  }

  const validate = () => {
    const validation = validateSetupInput(form)
    setErrors(validation.errors as Record<string, string>)
    return validation.ok
  }

  const testCloudflare = async () => {
    if (!validate()) return

    setTesting(true)
    setMessage(undefined)

    try {
      const response = await sendBackgroundMessage<TestCloudflareRequest, TestCloudflareResponse>({
        name: "test-cloudflare",
        body: form
      })
      setResult(response)
      setMessage(response.message)
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Cloudflare test failed.")
    } finally {
      setTesting(false)
    }
  }

  const save = async () => {
    if (!validate()) return

    setSaving(true)
    setMessage(undefined)

    try {
      await sendBackgroundMessage<SaveSettingsRequest, unknown>({
        name: "save-settings",
        body: { ...form, darkMode: true }
      })
      await refresh()
      setMessage("Settings saved locally.")
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not save settings.")
    } finally {
      setSaving(false)
    }
  }

  const exportBackup = async () => {
    try {
      const backup = await sendBackgroundMessage<never, ExportBackupResponse>({
        name: "export-backup"
      })
      const blob = new Blob([JSON.stringify(backup, null, 2)], {
        type: "application/json"
      })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement("a")
      anchor.href = url
      anchor.download = `cloakmail-backup-${new Date().toISOString().slice(0, 10)}.json`
      anchor.click()
      URL.revokeObjectURL(url)
      setMessage("Backup exported without API token or encrypted secrets.")
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not export backup.")
    }
  }

  const importBackupFile = async (file: File) => {
    try {
      const parsed = JSON.parse(await file.text()) as unknown
      const response = await sendBackgroundMessage<ImportBackupRequest, ImportBackupResponse>({
        name: "import-backup",
        body: { backup: parsed }
      })
      await refresh()
      setMessage(response.message)
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not import backup.")
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = ""
    }
  }

  return (
    <main className="min-h-screen bg-ink text-white">
      <div className="mx-auto grid max-w-5xl gap-8 px-5 py-10 md:grid-cols-[0.9fr_1.1fr]">
        <section className="pt-4">
          <div className="mb-8 inline-flex h-12 w-12 items-center justify-center rounded-md bg-mint text-ink">
            <ShieldCheck className="h-7 w-7" />
          </div>
          <h1 className="text-4xl font-bold tracking-normal">Cloakmail setup</h1>
          <p className="mt-4 max-w-md text-base leading-7 text-zinc-300">
            Privacy-first email aliases, self-hosted on Cloudflare.
          </p>

          <div className="mt-8 grid gap-4 text-sm text-zinc-300">
            <div className="flex gap-3">
              <Cloud className="mt-0.5 h-5 w-5 text-mint" />
              <p>Use a user API token scoped to this zone with Zone Settings Read and Email Routing Rules Read/Write.</p>
            </div>
            <div className="flex gap-3">
              <Wrench className="mt-0.5 h-5 w-5 text-mint" />
              <p>Enable Email Routing and verify the destination email in Cloudflare first.</p>
            </div>
            <div className="flex gap-3">
              <CheckCircle2 className="mt-0.5 h-5 w-5 text-mint" />
              <p>Each alias gets its own Cloudflare rule, so disable and delete actions are real.</p>
            </div>
          </div>
        </section>

        <section className="rounded-lg border border-white/10 bg-white/6 p-5 shadow-soft">
          <div className="grid gap-4">
            <TextField
              label="Cloudflare API token"
              type="password"
              autoComplete="off"
              placeholder={state?.settings?.hasEncryptedApiToken ? "Encrypted token saved - leave blank to keep it" : "Token with Email Routing permissions"}
              value={form.apiToken}
              error={errors.apiToken}
              onChange={(event) => updateField("apiToken", event.target.value)}
            />
            <TextField
              label="Zone ID"
              placeholder="32 character Cloudflare zone ID"
              value={form.zoneId}
              error={errors.zoneId}
              onChange={(event) => updateField("zoneId", event.target.value)}
            />
            <TextField
              label="Alias domain or subdomain"
              placeholder="mail.example.com"
              value={form.domain}
              error={errors.domain}
              onChange={(event) => updateField("domain", event.target.value)}
            />
            <TextField
              label="Forwarding email"
              placeholder="you@gmail.com"
              value={form.forwardingEmail}
              error={errors.forwardingEmail}
              onChange={(event) => updateField("forwardingEmail", event.target.value)}
            />

          </div>

          <div className="mt-5 flex flex-wrap gap-3">
            <Button variant="secondary" disabled={testing} onClick={testCloudflare}>
              {testing ? "Testing..." : "Test credentials"}
            </Button>
            <Button disabled={saving} onClick={save}>
              {saving ? "Saving..." : "Save locally"}
            </Button>
          </div>

          {message ? (
            <p className={`mt-4 text-sm ${result?.ok ? "text-mint" : "text-zinc-300"}`}>
              {message}
            </p>
          ) : null}

          {result ? (
            <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
              <Status label="Token" ok={result.tokenValid} />
              <Status label="Zone" ok={result.zoneValid} />
              <Status label="Email Routing" ok={result.emailRoutingEnabled} />
              <Status label="Status" ok={result.routingStatus === "ready"} value={result.routingStatus} />
            </div>
          ) : null}

          <div className="mt-6 border-t border-white/10 pt-5">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <h2 className="font-semibold">Backup</h2>
                <p className="mt-1 text-sm text-zinc-400">Export aliases and non-secret settings. API tokens are never included.</p>
              </div>
              <HelpCircle className="h-4 w-4 text-zinc-500" />
            </div>
            <div className="flex flex-wrap gap-3">
              <Button variant="secondary" onClick={exportBackup}>
                <Download className="h-4 w-4" />
                Export Backup
              </Button>
              <Button variant="ghost" onClick={() => fileInputRef.current?.click()}>
                <Upload className="h-4 w-4" />
                Import Backup
              </Button>
              <input
                ref={fileInputRef}
                className="hidden"
                type="file"
                accept="application/json,.json"
                onChange={(event) => {
                  const file = event.target.files?.[0]
                  if (file) void importBackupFile(file)
                }}
              />
            </div>
          </div>

          <div className="mt-6 border-t border-white/10 pt-5 text-sm text-zinc-400">
            <h2 className="font-semibold text-white">About Cloakmail</h2>
            <p className="mt-1">Privacy-first email aliases, self-hosted on Cloudflare.</p>
            <p className="mt-2">Version 0.1.0</p>
          </div>
        </section>
      </div>
    </main>
  )
}

const Status = ({ label, ok, value }: { label: string; ok: boolean; value?: string }) => (
  <div className="rounded-md border border-white/10 bg-ink/50 p-3">
    <p className="text-xs text-zinc-500">{label}</p>
    <p className={ok ? "text-mint" : "text-coral"}>{value ?? (ok ? "OK" : "Needs attention")}</p>
  </div>
)

export default Options
