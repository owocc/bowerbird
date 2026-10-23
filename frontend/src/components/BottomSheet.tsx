import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  className?: string;
}

const PEEK_VH = 0.48;

/**
 * Bottom drawer that peeks at ~half screen and can be dragged up to fullscreen.
 */
export function BottomSheet({
  open,
  onClose,
  title,
  children,
  className,
}: BottomSheetProps) {
  const [expanded, setExpanded] = useState(false);
  const [dragY, setDragY] = useState(0);
  const startYRef = useRef(0);
  const draggingRef = useRef(false);
  const sheetRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      setExpanded(false);
      setDragY(0);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    draggingRef.current = true;
    startYRef.current = e.clientY;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }, []);

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!draggingRef.current) return;
      const dy = e.clientY - startYRef.current;
      setDragY(dy);
    },
    []
  );

  const onPointerUp = useCallback(() => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    const h = window.innerHeight;
    if (dragY > h * 0.18) {
      onClose();
    } else if (dragY < -h * 0.12) {
      setExpanded(true);
    } else if (expanded && dragY > h * 0.08) {
      setExpanded(false);
    }
    setDragY(0);
  }, [dragY, expanded, onClose]);

  if (!open) return null;

  const height = expanded ? "100%" : `${Math.round(PEEK_VH * 100)}vh`;
  const translate = draggingRef.current || dragY !== 0 ? dragY : 0;

  return (
    <div className="absolute inset-0 z-50 flex flex-col justify-end">
      <button
        type="button"
        className="absolute inset-0 bg-black/35"
        aria-label="Dismiss"
        onClick={onClose}
      />
      <div
        ref={sheetRef}
        className={cn(
          "relative z-10 flex flex-col bg-popover text-popover-foreground rounded-t-2xl shadow-2xl border-t border-border overflow-hidden",
          "transition-[height] duration-200 ease-out",
          className
        )}
        style={{
          height,
          maxHeight: "100%",
          transform: `translateY(${Math.max(0, translate)}px)`,
        }}
      >
        <div
          className="shrink-0 flex flex-col items-center pt-2 pb-1 cursor-grab active:cursor-grabbing touch-none"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <div className="w-10 h-1 rounded-full bg-muted-foreground/40" />
          {title && (
            <div className="w-full px-4 pt-2 pb-1 text-sm font-semibold">
              {title}
            </div>
          )}
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-3 pb-[max(12px,env(safe-area-inset-bottom))]">
          {children}
        </div>
      </div>
    </div>
  );
}
