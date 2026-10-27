"use client"

import * as React from "react"
import { cn } from "@workspace/ui/lib/utils"

/**
 * A WAI-ARIA listbox.
 *
 * Written against the Base UI primitives already used across this package
 * (the same `data-slot` + `cn` conventions, no extra headless dependency).
 *
 * Keyboard model, per the ARIA Authoring Practices:
 * - ArrowUp / ArrowDown move the active option (optionally wrapping with `loop`)
 * - Home / End jump to the first / last option
 * - Enter / Space activate the focused option
 * - Printable characters jump to the next option starting with that prefix
 *
 * Focus stays on the list (a "roving" `aria-activedescendant`), which is what
 * keeps a drag handle inside an option usable: pointer drags never depend on
 * which option currently owns DOM focus.
 */

export interface ListboxProps
  extends Omit<React.ComponentProps<"div">, "onChange" | "defaultValue"> {
  /** Ids of the selected options. */
  value?: string[]
  /** Initial selection when uncontrolled. */
  defaultValue?: string[]
  onValueChange?: (value: string[]) => void
  /** Whether more than one option may be selected. */
  multiple?: boolean
  /** Wrap focus around at the first/last option. */
  loop?: boolean
  /**
   * Focus the list when it mounts. Useful inside a popover, where focus would
   * otherwise stay on the trigger (or a search field) and arrow keys would never
   * reach the options.
   */
  autoFocus?: boolean
  /**
   * Receives the list element so callers can move focus into the list from a
   * sibling control (e.g. pressing ArrowDown in a filter field).
   */
  focusRef?: React.RefObject<HTMLDivElement | null>
  /** Accessible label for the list. */
  "aria-label"?: string
  "aria-labelledby"?: string
}

export interface ListboxItemProps extends React.ComponentProps<"div"> {
  /** Stable id of this option; must be unique within the list. */
  value: string
  /** Prevent focusing and selecting this option. */
  disabled?: boolean
}

interface ListboxContextValue {
  activeValue: string | null
  setActiveValue: (value: string | null) => void
  selectedValues: string[]
  toggleValue: (value: string) => void
  multiple: boolean
  registerItem: (value: string, node: HTMLElement | null) => void
  getItemId: (value: string) => string
  baseId: string
}

const ListboxContext = React.createContext<ListboxContextValue | null>(null)

function useListboxContext(component: string): ListboxContextValue {
  const context = React.useContext(ListboxContext)
  if (!context) {
    throw new Error(`${component} must be used within <Listbox>`)
  }
  return context
}

/** Returns the option elements in DOM order, skipping disabled ones. */
function getNavigableItems(root: HTMLElement | null): HTMLElement[] {
  if (!root) return []
  const nodes = root.querySelectorAll<HTMLElement>(
    '[data-slot="listbox-item"]:not([data-disabled])'
  )
  return Array.from(nodes)
}

function Listbox({
  value,
  defaultValue,
  onValueChange,
  multiple = false,
  loop = true,
  autoFocus = false,
  focusRef,
  className,
  children,
  onKeyDown,
  ...props
}: ListboxProps) {
  const baseId = React.useId()
  const rootRef = React.useRef<HTMLDivElement>(null)
  const setRootRef = React.useCallback(
    (node: HTMLDivElement | null) => {
      rootRef.current = node
      if (focusRef) focusRef.current = node
    },
    [focusRef]
  )
  const itemNodesRef = React.useRef(new Map<string, HTMLElement>())

  const [uncontrolled, setUncontrolled] = React.useState<string[]>(
    defaultValue ?? []
  )
  const selectedValues = value ?? uncontrolled

  const [activeValue, setActiveValue] = React.useState<string | null>(null)
  // For typeahead: the characters typed in quick succession.
  const typeaheadRef = React.useRef({ query: "", at: 0 })

  const emit = React.useCallback(
    (next: string[]) => {
      if (value === undefined) setUncontrolled(next)
      onValueChange?.(next)
    },
    [onValueChange, value]
  )

  const toggleValue = React.useCallback(
    (itemValue: string) => {
      if (multiple) {
        emit(
          selectedValues.includes(itemValue)
            ? selectedValues.filter((v) => v !== itemValue)
            : [...selectedValues, itemValue]
        )
        return
      }
      emit([itemValue])
    },
    [emit, multiple, selectedValues]
  )

  const registerItem = React.useCallback(
    (itemValue: string, node: HTMLElement | null) => {
      if (node) itemNodesRef.current.set(itemValue, node)
      else itemNodesRef.current.delete(itemValue)
    },
    []
  )

  const getItemId = React.useCallback(
    (itemValue: string) => `${baseId}-option-${itemValue}`,
    [baseId]
  )

  // Keep the active option pointing at something that still exists. Reading the
  // DOM instead of `children` keeps this stable across renders (children is a
  // fresh array every time and would retrigger the effect endlessly).
  React.useEffect(() => {
    const items = getNavigableItems(rootRef.current)
    if (items.length === 0) {
      if (activeValue !== null) setActiveValue(null)
      return
    }
    if (
      activeValue === null ||
      !items.some((node) => node.dataset.value === activeValue)
    ) {
      setActiveValue(items[0].dataset.value ?? null)
    }
  }, [activeValue])

  const moveActive = React.useCallback(
    (direction: 1 | -1) => {
      const items = getNavigableItems(rootRef.current)
      if (items.length === 0) return
      const currentIndex = items.findIndex(
        (node) => node.dataset.value === activeValue
      )

      let nextIndex: number
      if (currentIndex === -1) {
        nextIndex = direction === 1 ? 0 : items.length - 1
      } else {
        nextIndex = currentIndex + direction
        if (nextIndex < 0) nextIndex = loop ? items.length - 1 : 0
        if (nextIndex >= items.length) nextIndex = loop ? 0 : items.length - 1
      }
      setActiveValue(items[nextIndex].dataset.value ?? null)
    },
    [activeValue, loop]
  )

  const handleKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      onKeyDown?.(event)
      if (event.defaultPrevented) return

      switch (event.key) {
        case "ArrowDown":
          event.preventDefault()
          moveActive(1)
          return
        case "ArrowUp":
          event.preventDefault()
          moveActive(-1)
          return
        case "Home":
          event.preventDefault()
          setActiveValue(
            getNavigableItems(rootRef.current)[0]?.dataset.value ?? null
          )
          return
        case "End": {
          event.preventDefault()
          const items = getNavigableItems(rootRef.current)
          setActiveValue(items[items.length - 1]?.dataset.value ?? null)
          return
        }
        case "Enter":
        case " ":
        case "Spacebar":
          if (activeValue !== null) {
            event.preventDefault()
            toggleValue(activeValue)
          }
          return
        default:
          break
      }

      // Typeahead: printable characters only, no modifiers.
      if (
        event.key.length === 1 &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey
      ) {
        const now = Date.now()
        const state = typeaheadRef.current
        const query = now - state.at > 500 ? event.key : state.query + event.key
        typeaheadRef.current = { query, at: now }

        const items = getNavigableItems(rootRef.current)
        const match = items.find((node) =>
          (node.textContent ?? "").toLowerCase().startsWith(query.toLowerCase())
        )
        if (match) {
          event.preventDefault()
          setActiveValue(match.dataset.value ?? null)
        }
      }
    },
    [activeValue, moveActive, onKeyDown, toggleValue]
  )

  // Focus the list when an option is pressed, so arrow keys work right away.
  // Skip it when the press came from an interactive child (the drag grip),
  // which stops propagation itself.
  // Focus on mount so the arrow keys work the moment a popover opens.
  React.useEffect(() => {
    if (!autoFocus) return
    rootRef.current?.focus()
  }, [autoFocus])

  const handleMouseDown = React.useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      const root = rootRef.current
      if (!root) return
      // Leave focus alone when the press came from an interactive child (the
      // drag grip handles its own pointer events).
      const target = event.target as HTMLElement
      if (target.closest("button,input,textarea,select,a[href]")) return
      // Prevent the default focus/selection so the list keeps the roving focus.
      event.preventDefault()
      if (!root.contains(document.activeElement)) root.focus()
    },
    []
  )

  const contextValue = React.useMemo<ListboxContextValue>(
    () => ({
      activeValue,
      setActiveValue,
      selectedValues,
      toggleValue,
      multiple,
      registerItem,
      getItemId,
      baseId,
    }),
    [
      activeValue,
      selectedValues,
      toggleValue,
      multiple,
      registerItem,
      getItemId,
      baseId,
    ]
  )

  return (
    <ListboxContext.Provider value={contextValue}>
      <div
        ref={setRootRef}
        data-slot="listbox"
        role="listbox"
        tabIndex={0}
        aria-multiselectable={multiple || undefined}
        aria-activedescendant={
          activeValue !== null ? getItemId(activeValue) : undefined
        }
        onKeyDown={handleKeyDown}
        onMouseDown={handleMouseDown}
        className={cn("outline-none", className)}
        {...props}
      >
        {children}
      </div>
    </ListboxContext.Provider>
  )
}

function ListboxItem({
  value,
  disabled = false,
  className,
  children,
  onClick,
  onMouseEnter,
  ...props
}: ListboxItemProps) {
  const {
    activeValue,
    setActiveValue,
    selectedValues,
    toggleValue,
    registerItem,
    getItemId,
  } = useListboxContext("ListboxItem")

  const nodeRef = React.useCallback(
    (node: HTMLDivElement | null) => registerItem(value, node),
    [registerItem, value]
  )

  const isSelected = selectedValues.includes(value)
  const isActive = activeValue === value

  return (
    <div
      ref={nodeRef}
      id={getItemId(value)}
      data-slot="listbox-item"
      data-value={value}
      data-selected={isSelected ? "" : undefined}
      data-active={isActive ? "" : undefined}
      data-disabled={disabled ? "" : undefined}
      role="option"
      aria-selected={isSelected}
      aria-disabled={disabled || undefined}
      onClick={(event) => {
        onClick?.(event)
        if (event.defaultPrevented || disabled) return
        toggleValue(value)
      }}
      onMouseEnter={(event) => {
        onMouseEnter?.(event)
        if (!disabled) setActiveValue(value)
      }}
      className={cn(
        "cursor-pointer outline-none",
        disabled && "pointer-events-none opacity-50",
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
}

export { Listbox, ListboxItem, getNavigableItems }
