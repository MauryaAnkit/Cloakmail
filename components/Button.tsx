import type { ButtonHTMLAttributes, PropsWithChildren } from "react"

type ButtonProps = PropsWithChildren<
  ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: "primary" | "secondary" | "ghost" | "danger"
  }
>

const variants = {
  primary: "bg-mint text-ink hover:bg-mint/90",
  secondary: "bg-white/10 text-white hover:bg-white/15",
  ghost: "bg-transparent text-zinc-300 hover:bg-white/10",
  danger: "bg-coral/15 text-coral hover:bg-coral/25"
}

export const Button = ({ className = "", variant = "primary", ...props }: ButtonProps) => (
  <button
    {...props}
    className={`inline-flex h-10 items-center justify-center gap-2 rounded-md px-3 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${variants[variant]} ${className}`}
  />
)
