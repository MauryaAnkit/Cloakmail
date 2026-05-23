import type { PlasmoCSConfig } from "plasmo"

import type { RequestBody as GenerateAliasRequest, ResponseBody as GenerateAliasResponse } from "~background/messages/generate-alias"
import type { RequestBody as MutateAliasRequest } from "~background/messages/mutate-alias"
import { sendBackgroundMessage } from "~src/lib/messaging"

export const config: PlasmoCSConfig = {
  matches: ["<all_urls>"],
  run_at: "document_idle"
}

const BUTTON_CLASS = "cloakmail-injected-button"
const FIELD_SELECTOR = [
  'input[type="email"]',
  'input[name*="email" i]',
  'input[id*="email" i]',
  'input[autocomplete="email"]'
].join(",")

const isVisible = (element: HTMLElement) => {
  const rect = element.getBoundingClientRect()
  const style = window.getComputedStyle(element)
  return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none"
}

const injectButtonForField = (input: HTMLInputElement) => {
  if (input.dataset.cloakmailAttached === "true" || !isVisible(input)) return
  input.dataset.cloakmailAttached = "true"

  const button = document.createElement("button")
  button.type = "button"
  button.className = BUTTON_CLASS
  button.textContent = "@"
  button.title = "Fill private alias"
  button.setAttribute("aria-label", "Fill private alias")

  Object.assign(button.style, {
    position: "absolute",
    zIndex: "2147483647",
    width: "28px",
    height: "28px",
    borderRadius: "6px",
    border: "1px solid rgba(143, 214, 191, 0.6)",
    background: "#101820",
    color: "#8fd6bf",
    fontWeight: "700",
    cursor: "pointer",
    boxShadow: "0 8px 24px rgba(0,0,0,.22)"
  })

  const positionButton = () => {
    const rect = input.getBoundingClientRect()
    button.style.top = `${window.scrollY + rect.top + Math.max(4, (rect.height - 28) / 2)}px`
    button.style.left = `${window.scrollX + rect.right - 34}px`
  }

  const fillAlias = async () => {
    button.textContent = "..."

    try {
      const response = await sendBackgroundMessage<GenerateAliasRequest, GenerateAliasResponse>({
        name: "generate-alias",
        body: { hostname: window.location.hostname }
      })

      input.focus()
      input.value = response.alias.alias
      input.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: response.alias.alias }))
      input.dispatchEvent(new Event("change", { bubbles: true }))

      await sendBackgroundMessage<MutateAliasRequest, unknown>({
        name: "mutate-alias",
        body: { aliasId: response.alias.id, action: "mark_used" }
      })

      button.textContent = "✓"
      window.setTimeout(() => {
        button.textContent = "@"
      }, 1000)
    } catch {
      button.textContent = "!"
      window.setTimeout(() => {
        button.textContent = "@"
      }, 1400)
    }
  }

  button.addEventListener("click", (event) => {
    event.preventDefault()
    event.stopPropagation()
    void fillAlias()
  })

  document.documentElement.append(button)
  positionButton()

  input.addEventListener("focus", positionButton)
  window.addEventListener("scroll", positionButton, { passive: true })
  window.addEventListener("resize", positionButton)
}

const scan = () => {
  document.querySelectorAll<HTMLInputElement>(FIELD_SELECTOR).forEach(injectButtonForField)
}

const observer = new MutationObserver(() => scan())

scan()
observer.observe(document.documentElement, {
  subtree: true,
  childList: true,
  attributes: true,
  attributeFilter: ["type", "name", "id", "autocomplete", "style", "class"]
})
