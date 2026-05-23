import type { CloudflareRoutingStatus, CloudflareTestResult, SetupInput } from "~src/types"

const CLOUDFLARE_API_BASE = "https://api.cloudflare.com/client/v4"

type CloudflareEnvelope<T> = {
  success: boolean
  errors: Array<{ code: number; message: string }>
  messages: Array<{ code: number; message: string }>
  result: T
}

type TokenVerifyResult = {
  id: string
  status: "active" | "disabled" | "expired"
}

type ZoneResult = {
  id: string
  name: string
  status: string
}

type EmailRoutingSettings = {
  enabled: boolean
  name: string
  status?: CloudflareRoutingStatus
}

export type RoutingRule = {
  id?: string
  enabled?: boolean
  name?: string
  matchers?: Array<{ type: "all" | "literal"; field?: "to"; value?: string }>
  actions?: Array<{ type: "drop" | "forward" | "worker"; value?: string[] }>
  priority?: number
}

type CheckResult<T> =
  | {
      ok: true
      data: T
    }
  | {
      ok: false
      error: string
    }

const sleep = (ms: number) => new Promise((resolve) => globalThis.setTimeout(resolve, ms))

export class CloudflareApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly cloudflareErrors: CloudflareEnvelope<unknown>["errors"] = []
  ) {
    super(message)
  }
}

export class CloudflareClient {
  constructor(private readonly apiToken: string) {}

  private async request<T>(path: string, init: RequestInit = {}, retryCount = 2): Promise<T> {
    let lastError: unknown

    for (let attempt = 0; attempt <= retryCount; attempt += 1) {
      try {
        const response = await fetch(`${CLOUDFLARE_API_BASE}${path}`, {
          ...init,
          headers: {
            Authorization: `Bearer ${this.apiToken}`,
            "Content-Type": "application/json",
            ...(init.headers ?? {})
          }
        })

        const body = (await response.json()) as CloudflareEnvelope<T>

        if (!response.ok || !body.success) {
          const message =
            body.errors?.[0]?.message ?? `Cloudflare request failed with ${response.status}.`
          throw new CloudflareApiError(message, response.status, body.errors)
        }

        return body.result
      } catch (error) {
        lastError = error
        const retryable =
          !(error instanceof CloudflareApiError) ||
          error.status === 429 ||
          (error.status !== undefined && error.status >= 500)

        if (!retryable || attempt === retryCount) break
        await sleep(350 * 2 ** attempt)
      }
    }

    if (lastError instanceof Error) throw lastError
    throw new Error("Cloudflare request failed.")
  }

  verifyToken() {
    return this.request<TokenVerifyResult>("/user/tokens/verify")
  }

  getZone(zoneId: string) {
    return this.request<ZoneResult>(`/zones/${zoneId}`)
  }

  getEmailRoutingSettings(zoneId: string) {
    return this.request<EmailRoutingSettings>(`/zones/${zoneId}/email/routing`)
  }

  listRoutingRules(zoneId: string) {
    return this.request<RoutingRule[]>(`/zones/${zoneId}/email/routing/rules?per_page=100`)
  }

  createForwardRule(zoneId: string, alias: string, forwardingEmail: string) {
    return this.request<RoutingRule>(`/zones/${zoneId}/email/routing/rules`, {
      method: "POST",
      body: JSON.stringify({
        name: `Cloakmail forward ${alias}`,
        enabled: true,
        matchers: [{ type: "literal", field: "to", value: alias }],
        actions: [{ type: "forward", value: [forwardingEmail] }]
      })
    })
  }

  updateForwardRule(zoneId: string, ruleId: string, alias: string, forwardingEmail: string) {
    return this.request<RoutingRule>(`/zones/${zoneId}/email/routing/rules/${ruleId}`, {
      method: "PUT",
      body: JSON.stringify({
        name: `Cloakmail forward ${alias}`,
        enabled: true,
        matchers: [{ type: "literal", field: "to", value: alias }],
        actions: [{ type: "forward", value: [forwardingEmail] }]
      })
    })
  }

  disableForwardRule(zoneId: string, ruleId: string, alias: string, forwardingEmail: string) {
    return this.request<RoutingRule>(`/zones/${zoneId}/email/routing/rules/${ruleId}`, {
      method: "PUT",
      body: JSON.stringify({
        name: `Cloakmail forward ${alias}`,
        enabled: false,
        matchers: [{ type: "literal", field: "to", value: alias }],
        actions: [{ type: "forward", value: [forwardingEmail] }]
      })
    })
  }

  createDropRule(zoneId: string, alias: string) {
    return this.request<RoutingRule>(`/zones/${zoneId}/email/routing/rules`, {
      method: "POST",
      body: JSON.stringify({
        name: `Cloakmail drop ${alias}`,
        enabled: true,
        matchers: [{ type: "literal", field: "to", value: alias }],
        actions: [{ type: "drop" }]
      })
    })
  }

  updateDropRule(zoneId: string, ruleId: string, alias: string) {
    return this.request<RoutingRule>(`/zones/${zoneId}/email/routing/rules/${ruleId}`, {
      method: "PUT",
      body: JSON.stringify({
        name: `Cloakmail drop ${alias}`,
        enabled: true,
        matchers: [{ type: "literal", field: "to", value: alias }],
        actions: [{ type: "drop" }]
      })
    })
  }

  deleteRoutingRule(zoneId: string, ruleId: string) {
    return this.request<RoutingRule>(`/zones/${zoneId}/email/routing/rules/${ruleId}`, {
      method: "DELETE"
    })
  }

}

const check = async <T>(task: Promise<T>): Promise<CheckResult<T>> => {
  try {
    return {
      ok: true,
      data: await task
    }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Cloudflare request failed."
    }
  }
}

const joinErrors = (errors: string[]) => {
  const uniqueErrors = [...new Set(errors.filter(Boolean))]
  if (uniqueErrors.length === 0) return "Cloudflare setup could not be verified."
  if (uniqueErrors.length === 1) return uniqueErrors[0] ?? "Cloudflare setup could not be verified."
  return uniqueErrors.join(" ")
}

const permissionHelp =
  "Check that the token is scoped to this zone and includes Zone Settings Read plus Email Routing Rules Read/Write."

const routingForbiddenHelp =
  "Cloudflare returned 403 for Email Routing settings. Add Zone Settings Read for this zone."

const rulesForbiddenHelp =
  "Cloudflare returned 403 for Email Routing rules. Add Email Routing Rules Read/Write for this zone."

const withPermissionHint = (error: string, hint: string) => {
  if (!/forbidden|403/i.test(error)) return error
  return `${hint} ${permissionHelp}`
}

const testRulesAccess = async (client: CloudflareClient, zoneId: string) => {
  const rules = await check(client.listRoutingRules(zoneId))
  if (rules.ok) return rules

  return {
    ok: false,
    error: rules.error
  }
}

export const testCloudflareSetup = async (
  input: SetupInput & { apiToken: string }
): Promise<CloudflareTestResult> => {
  const client = new CloudflareClient(input.apiToken)

  const [token, zone, routing, rules] = await Promise.all([
    check(client.verifyToken()),
    check(client.getZone(input.zoneId)),
    check(client.getEmailRoutingSettings(input.zoneId)),
    testRulesAccess(client, input.zoneId)
  ])

  const tokenValid = token.ok && token.data.status === "active"
  const zoneValid = zone.ok && zone.data.id === input.zoneId
  const routingReadable = routing.ok
  const rulesReadable = rules.ok
  const emailRoutingEnabled = routing.ok && Boolean(routing.data.enabled)
  const ok = tokenValid && zoneValid && emailRoutingEnabled && rulesReadable

  if (ok) {
    return {
      ok,
      tokenValid,
      zoneValid,
      emailRoutingEnabled,
      routingStatus: routing.data.status ?? "ready",
      zoneName: zone.data.name,
      message: "Cloudflare credentials, Email Routing, and routing rule access look ready."
    }
  }

  const errors = [
    token.ok ? "" : token.error,
    zone.ok ? "" : zone.error,
    routing.ok ? "" : withPermissionHint(routing.error, routingForbiddenHelp),
    rules.ok ? "" : withPermissionHint(rules.error, rulesForbiddenHelp)
  ]

  if (routingReadable && rulesReadable && !emailRoutingEnabled) {
    errors.push("Email Routing is reachable, but it is not enabled for this zone.")
  }

  return {
    ok,
    tokenValid,
    zoneValid,
    emailRoutingEnabled,
    routingStatus: routing.ok ? routing.data.status ?? "unknown" : "unknown",
    zoneName: zone.ok ? zone.data.name : undefined,
    message: joinErrors(errors)
  }
}
