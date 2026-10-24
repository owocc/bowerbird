import { useEffect, useRef } from "react";

interface UseTrackpadZoomOptions {
  /** Target container element ref (e.g. main gallery viewport) */
  containerRef: React.RefObject<HTMLElement | null>;
  /** Minimum row height in px */
  min?: number;
  /** Maximum row height in px */
  max?: number;
  /** Whether zoom gesture is enabled */
  enabled?: boolean;
  /** State updater for rowHeight */
  onChange: React.Dispatch<React.SetStateAction<number>>;
}

/**
 * Enables smooth macOS / Windows precision trackpad pinch-to-zoom on the main gallery view.
 *
 * Handles both:
 * 1. Standard WheelEvent with `ctrlKey === true` (emitted by Chromium/WebKit for 2-finger pinch)
 * 2. Safari / WKWebView native GestureEvent (`gesturestart` / `gesturechange`)
 */
export function useTrackpadZoom({
  containerRef,
  min = 60,
  max = 240,
  enabled = true,
  onChange,
}: UseTrackpadZoomOptions) {
  const floatValueRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const gestureBaseRef = useRef<number>(80);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || !enabled) return;

    const handleWheel = (e: WheelEvent) => {
      // Only intercept pinch-to-zoom (ctrlKey is set by OS trackpad pinch) or explicit Cmd+scroll
      if (!e.ctrlKey && !e.metaKey) return;

      e.preventDefault();
      e.stopPropagation();

      const clampedDelta = Math.max(-80, Math.min(80, e.deltaY));
      const factor = Math.exp(-clampedDelta * 0.0045);

      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }

      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        onChange((prev) => {
          const base =
            floatValueRef.current !== null &&
            Math.abs(floatValueRef.current - prev) < 4
              ? floatValueRef.current
              : prev;
          const nextFloat = Math.max(min, Math.min(max, base * factor));
          floatValueRef.current = nextFloat;
          return Math.round(nextFloat);
        });
      });
    };

    const handleGestureStart = (e: Event) => {
      e.preventDefault();
      onChange((prev) => {
        gestureBaseRef.current = prev;
        floatValueRef.current = prev;
        return prev;
      });
    };

    const handleGestureChange = (e: Event) => {
      e.preventDefault();
      const scale =
        "scale" in e && typeof e.scale === "number" ? e.scale : 1;
      const next = Math.max(
        min,
        Math.min(max, Math.round(gestureBaseRef.current * scale))
      );
      floatValueRef.current = next;
      onChange(next);
    };
    el.addEventListener("wheel", handleWheel, { passive: false });
    el.addEventListener("gesturestart", handleGestureStart, { passive: false });
    el.addEventListener("gesturechange", handleGestureChange, { passive: false });

    return () => {
      el.removeEventListener("wheel", handleWheel);
      el.removeEventListener("gesturestart", handleGestureStart);
      el.removeEventListener("gesturechange", handleGestureChange);
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, [containerRef, min, max, enabled, onChange]);
}
