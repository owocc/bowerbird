import * as React from "react"
import { ChevronDown } from "lucide-react"
import { cn } from "@workspace/ui/lib/utils"

interface AccordionContextValue {
  openValues: Set<string>
  toggleValue: (value: string) => void
}

const AccordionContext = React.createContext<AccordionContextValue | null>(null)
const AccordionItemContext = React.createContext<{ value: string; isOpen: boolean }>({
  value: "",
  isOpen: false,
})

export interface AccordionProps extends React.HTMLAttributes<HTMLDivElement> {
  type?: "single" | "multiple"
  defaultValue?: string | string[]
}

export function Accordion({
  type = "multiple",
  defaultValue,
  className,
  children,
  ...props
}: AccordionProps) {
  const [openValues, setOpenValues] = React.useState<Set<string>>(() => {
    if (!defaultValue) return new Set()
    return new Set(Array.isArray(defaultValue) ? defaultValue : [defaultValue])
  })

  const toggleValue = React.useCallback(
    (val: string) => {
      setOpenValues((prev) => {
        const next = new Set(prev)
        if (next.has(val)) {
          next.delete(val)
        } else {
          if (type === "single") {
            next.clear()
          }
          next.add(val)
        }
        return next
      })
    },
    [type]
  )

  return (
    <AccordionContext.Provider value={{ openValues, toggleValue }}>
      <div
        data-slot="accordion"
        className={cn("divide-y divide-border/50", className)}
        {...props}
      >
        {children}
      </div>
    </AccordionContext.Provider>
  )
}

export interface AccordionItemProps extends React.HTMLAttributes<HTMLDivElement> {
  value: string
}

export function AccordionItem({
  value,
  className,
  children,
  ...props
}: AccordionItemProps) {
  const ctx = React.useContext(AccordionContext)
  const isOpen = ctx ? ctx.openValues.has(value) : false

  return (
    <AccordionItemContext.Provider value={{ value, isOpen }}>
      <div
        data-slot="accordion-item"
        data-state={isOpen ? "open" : "closed"}
        className={cn("py-1", className)}
        {...props}
      >
        {children}
      </div>
    </AccordionItemContext.Provider>
  )
}

export interface AccordionTriggerProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  action?: React.ReactNode
}

export function AccordionTrigger({
  className,
  children,
  action,
  ...props
}: AccordionTriggerProps) {
  const ctx = React.useContext(AccordionContext)
  const { value, isOpen } = React.useContext(AccordionItemContext)

  return (
    <div className="flex items-center justify-between gap-2 py-1.5">
      <button
        type="button"
        onClick={() => ctx?.toggleValue(value)}
        aria-expanded={isOpen}
        className={cn(
          "flex flex-1 items-center justify-between gap-1.5 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors cursor-pointer select-none",
          className
        )}
        {...props}
      >
        <span className="truncate">{children}</span>
        <ChevronDown
          className={cn(
            "size-3.5 shrink-0 text-muted-foreground/70 transition-transform duration-150",
            isOpen && "rotate-180"
          )}
        />
      </button>
      {action && <div className="shrink-0 flex items-center">{action}</div>}
    </div>
  )
}

export function AccordionContent({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  const { isOpen } = React.useContext(AccordionItemContext)
  if (!isOpen) return null

  return (
    <div
      data-slot="accordion-content"
      className={cn("pb-2.5 pt-1 text-xs animate-in fade-in-50 duration-100", className)}
      {...props}
    >
      {children}
    </div>
  )
}
