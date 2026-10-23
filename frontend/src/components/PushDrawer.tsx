import { useEffect, type CSSProperties, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface PushDrawerProps {
  open: boolean;
  onClose: () => void;
  /** Fraction of the viewport the drawer occupies (default 2/3). */
  widthFraction?: number;
  children: ReactNode;
  className?: string;
}

/**
 * Push-style left drawer: the main content translates right instead of being
 * covered by an overlay sheet. The drawer itself occupies `widthFraction` of
 * the viewport (2/3 by default).
 */
export function PushDrawer({
  open,
  onClose,
  widthFraction = 2 / 3,
  children,
  className,
}: PushDrawerProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const widthPct = Math.round(widthFraction * 100);

  return (
    <>
      <aside
        className={cn(
          "absolute inset-y-0 left-0 z-40 bg-sidebar border-r border-border overflow-hidden",
          "transition-transform duration-300 ease-out will-change-transform",
          open ? "translate-x-0" : "-translate-x-full",
          className
        )}
        style={{ width: `${widthPct}%` }}
        aria-hidden={!open}
      >
        {children}
      </aside>
      {open && (
        <button
          type="button"
          aria-label="Close drawer"
          className="absolute inset-0 z-30 bg-transparent"
          style={{ left: `${widthPct}%` }}
          onClick={onClose}
        />
      )}
    </>
  );
}

export function pushDrawerOffsetStyle(
  open: boolean,
  widthFraction = 2 / 3
): CSSProperties {
  return {
    transform: open ? `translateX(${Math.round(widthFraction * 100)}%)` : "translateX(0)",
    transition: "transform 300ms ease-out",
    willChange: "transform",
  };
}
