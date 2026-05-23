import type { SetupInput, SetupValidationResult } from "~src/types"

const zoneIdPattern = /^[a-f0-9]{32}$/i
const domainPattern = /^(?!-)(?:[a-z0-9-]{1,63}\.)+[a-z]{2,63}$/i
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export const normalizeDomain = (domain: string) =>
  domain.trim().toLowerCase().replace(/^@/, "").replace(/\.+$/, "")

export const normalizeEmail = (email: string) => email.trim().toLowerCase()

export const validateSetupInput = (input: SetupInput): SetupValidationResult => {
  const errors: SetupValidationResult["errors"] = {}
  const domain = normalizeDomain(input.domain)
  const forwardingEmail = normalizeEmail(input.forwardingEmail)

  if (input.apiToken !== undefined && input.apiToken.length > 0 && !input.apiToken.trim()) {
    errors.apiToken = "Cloudflare API token is required."
  }

  if (!zoneIdPattern.test(input.zoneId.trim())) {
    errors.zoneId = "Zone ID should be the 32 character ID from Cloudflare."
  }

  if (!domainPattern.test(domain)) {
    errors.domain = "Enter a valid domain or subdomain, for example mail.example.com."
  }

  if (!emailPattern.test(forwardingEmail)) {
    errors.forwardingEmail = "Enter a valid destination email address."
  }

  return {
    ok: Object.keys(errors).length === 0,
    errors
  }
}
