import type { InputHTMLAttributes } from "react"

type TextFieldProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string
  error?: string
}

export const TextField = ({ label, error, className = "", ...props }: TextFieldProps) => (
  <label className="grid gap-1.5 text-sm text-zinc-200">
    <span className="font-medium">{label}</span>
    <input
      {...props}
      className={`cloakmail-input h-11 rounded-md border border-white/10 bg-[#17212b] px-3 text-sm text-zinc-50 caret-mint outline-none transition placeholder:text-zinc-500 selection:bg-mint selection:text-ink focus:border-mint ${className}`}
    />
    {error ? <span className="text-xs text-coral">{error}</span> : null}
  </label>
)
