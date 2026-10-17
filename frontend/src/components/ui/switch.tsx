import * as React from "react"
import { Switch as SwitchPrimitive } from "@base-ui/react/switch"
import { cn } from "@/lib/utils"

export interface SwitchProps
  extends Omit<React.ComponentProps<typeof SwitchPrimitive.Root>, "onCheckedChange"> {
  checked?: boolean
  defaultChecked?: boolean
  onCheckedChange?: (checked: boolean) => void
  size?: "sm" | "default"
}

export function Switch({
  className,
  checked,
  defaultChecked,
  onCheckedChange,
  disabled = false,
  size = "default",
  ...props
}: SwitchProps) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      checked={checked}
      defaultChecked={defaultChecked}
      onCheckedChange={(val) => onCheckedChange?.(val)}
      disabled={disabled}
      className={cn(
        "peer inline-flex shrink-0 items-center rounded-full border border-transparent transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer wails-no-drag",
        "data-[checked]:bg-primary data-[unchecked]:bg-input dark:data-[unchecked]:bg-muted/80",
        size === "sm" ? "h-4.5 w-8 p-0.5" : "h-5 w-9 p-0.5",
        className
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className={cn(
          "pointer-events-none block rounded-full bg-background dark:data-[checked]:bg-primary-foreground shadow-xs ring-0 transition-transform duration-150 ease-out",
          size === "sm"
            ? "size-3.5 data-[checked]:translate-x-3.5 data-[unchecked]:translate-x-0"
            : "size-4 data-[checked]:translate-x-4 data-[unchecked]:translate-x-0"
        )}
      />
    </SwitchPrimitive.Root>
  )
}
