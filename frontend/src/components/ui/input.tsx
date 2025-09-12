import * as React from "react"

import { cn } from "@/lib/utils"

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    // Prevent React controlled/uncontrolled warnings by normalizing `value`
    // If a `value` prop is provided but is `undefined` or `null`, coerce to ''
    const { value, defaultValue, ...rest } = props as any

    const normalizedProps: React.InputHTMLAttributes<HTMLInputElement> = {
      type,
      className: cn(
        "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
        className
      ),
      ref: ref as any,
      ...(rest as object),
    }

    if (value !== undefined) {
      ;(normalizedProps as any).value = value ?? ""
    } else if (defaultValue !== undefined) {
      ;(normalizedProps as any).defaultValue = defaultValue
    }

    return <input {...(normalizedProps as any)} />
  }
)
Input.displayName = "Input"

export { Input }
