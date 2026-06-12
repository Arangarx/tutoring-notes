"use client"

import * as React from "react"
import { CheckIcon } from "lucide-react"
import { Checkbox as CheckboxPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"
import { Label } from "@/components/ui/label"

function Checkbox({
  className,
  ...props
}: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        "peer size-4 shrink-0 rounded-[4px] border border-input bg-background shadow-xs transition-shadow outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground",
        className
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className="grid place-content-center text-current transition-none"
      >
        <CheckIcon className="size-3.5" />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  )
}

function CheckboxField({
  id,
  label,
  className,
  labelClassName,
  ...checkboxProps
}: React.ComponentProps<typeof Checkbox> & {
  id: string
  label: React.ReactNode
  labelClassName?: string
}) {
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <Checkbox id={id} {...checkboxProps} />
      <Label
        htmlFor={id}
        className={cn("cursor-pointer font-normal", labelClassName)}
      >
        {label}
      </Label>
    </div>
  )
}

export { Checkbox, CheckboxField }
