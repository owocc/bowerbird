import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import type { Item } from "../../bindings/bowerbird/core/models";
import { ImageThumbnailCard } from "./ImageThumbnailCard";
import { getFileCategory } from "@/lib/formatters";

export interface JustifiedGalleryProps {
  items: Item[];
  selectedItemIds: Set<string>;
  targetRowHeight?: number;
  gap?: number;
  onSelectionChange: (ids: Set<string>, lastItem?: Item) => void;
  onDoubleClickItem: (item: Item) => void;
  onDragStartItem: (e: React.DragEvent, item: Item) => void;
  onItemContextMenu: (e: React.MouseEvent, item: Item) => void;
  onCanvasContextMenu: (e: React.MouseEvent) => void;
}

interface LayoutItem {
  item: Item;
  width: number;
  height: number;
}

interface LayoutRow {
  items: LayoutItem[];
  height: number;
}

interface MarqueeBox {
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
  startClientX: number;
  startClientY: number;
  currentClientX: number;
  currentClientY: number;
}

export function JustifiedGallery({
  items,
  selectedItemIds,
  targetRowHeight = 80,
  gap = 12,
  onSelectionChange,
  onDoubleClickItem,
  onDragStartItem,
  onItemContextMenu,
  onCanvasContextMenu,
}: JustifiedGalleryProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState<number>(800);
  const [marquee, setMarquee] = useState<MarqueeBox | null>(null);
  const [lastClickedItemId, setLastClickedItemId] = useState<string | null>(null);

  // Rubbery-band (marquee) selection internals. Everything the mouse handlers need
  // lives in refs so the listeners can stay attached for the whole session instead
  // of being re-registered on every mousemove.
  const marqueeRef = useRef<MarqueeBox | null>(null);
  const cardBoxesRef = useRef<{ id: string; left: number; right: number; top: number; bottom: number }[]>([]);
  const pendingPointRef = useRef<{ x: number; y: number; clientX: number; clientY: number } | null>(null);
  const frameRef = useRef<number | null>(null);
  const selectionKeyRef = useRef("");
  const baseSelectionRef = useRef<Set<string>>(new Set());
  const gestureAdditiveRef = useRef(false);
  const longPressTimerRef = useRef<number | null>(null);
  const longPressOriginRef = useRef<{ clientX: number; clientY: number } | null>(null);
  const longPressArmedRef = useRef(false);
  const suppressClickRef = useRef(false);
  const activePointerIdRef = useRef<number | null>(null);
  const selectedIdsRef = useRef(selectedItemIds);
  const onSelectionChangeRef = useRef(onSelectionChange);

  useEffect(() => {
    selectedIdsRef.current = selectedItemIds;
  }, [selectedItemIds]);

  useEffect(() => {
    onSelectionChangeRef.current = onSelectionChange;
  }, [onSelectionChange]);

  // Measure container width responsively
  useEffect(() => {
    if (!containerRef.current) return;

    const updateWidth = () => {
      if (containerRef.current) {
        const width = containerRef.current.clientWidth;
        if (width > 0) {
          setContainerWidth(width);
        }
      }
    };

    updateWidth();
    const observer = new ResizeObserver(() => updateWidth());
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);


  // Compute justified rows layout with pixel-perfect row filling
  const rows = useMemo(() => {
    if (!items || items.length === 0) return [];

    const computedRows: LayoutRow[] = [];
    let currentRow: { item: Item; ratio: number }[] = [];
    let currentRatiosSum = 0;

    const MIN_RATIO = 0.45;
    const MAX_RATIO = 3.5;

    const getItemRatio = (item: Item): number => {
      const category = getFileCategory(item.extension);
      const isImage = category === "image";

      if (!isImage || !item.width || !item.height || item.width <= 0 || item.height <= 0) {
        return 1.0; // Non-image is strictly square (1:1 aspect ratio)
      }

      const rawRatio = item.width / item.height;
      return Math.max(MIN_RATIO, Math.min(MAX_RATIO, rawRatio));
    };

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const ratio = getItemRatio(item);

      currentRow.push({ item, ratio });
      currentRatiosSum += ratio;

      const gapsTotal = (currentRow.length - 1) * gap;
      const availableWidth = Math.max(100, containerWidth - gapsTotal);
      const projectedHeight = availableWidth / currentRatiosSum;

      // When row is full enough to achieve the target height
      if (projectedHeight <= targetRowHeight * 1.25) {
        const finalHeight = Math.round(projectedHeight);
        const widths = currentRow.map((entry) => Math.floor(finalHeight * entry.ratio));
        const currentTotal = widths.reduce((a, b) => a + b, 0);
        const diff = availableWidth - currentTotal;

        // Distribute remainder pixel by pixel across items to fill row completely
        for (let k = 0; k < diff; k++) {
          widths[k % widths.length] += 1;
        }

        const layoutItems: LayoutItem[] = currentRow.map((entry, idx) => ({
          item: entry.item,
          width: widths[idx],
          height: finalHeight,
        }));

        computedRows.push({ items: layoutItems, height: finalHeight });
        currentRow = [];
        currentRatiosSum = 0;
      }
    }

    // Handle incomplete trailing row
    if (currentRow.length > 0) {
      const gapsTotal = (currentRow.length - 1) * gap;
      const availableWidth = Math.max(100, containerWidth - gapsTotal);
      const projectedHeight = availableWidth / currentRatiosSum;

      if (projectedHeight <= targetRowHeight * 1.35) {
        // Comfortably fills the row
        const finalHeight = Math.round(projectedHeight);
        const widths = currentRow.map((entry) => Math.floor(finalHeight * entry.ratio));
        const currentTotal = widths.reduce((a, b) => a + b, 0);
        const diff = availableWidth - currentTotal;
        for (let k = 0; k < diff; k++) {
          widths[k % widths.length] += 1;
        }

        const layoutItems: LayoutItem[] = currentRow.map((entry, idx) => ({
          item: entry.item,
          width: widths[idx],
          height: finalHeight,
        }));
        computedRows.push({ items: layoutItems, height: finalHeight });
      } else {
        // Keep target height for a sparse trailing row
        const finalHeight = targetRowHeight;
        const layoutItems: LayoutItem[] = currentRow.map((entry) => ({
          item: entry.item,
          width: Math.round(finalHeight * entry.ratio),
          height: finalHeight,
        }));
        computedRows.push({ items: layoutItems, height: finalHeight });
      }
    }

    return computedRows;
  }, [items, containerWidth, targetRowHeight, gap]);

  // Handle single / Cmd / Shift card selection
  const handleCardClick = (e: React.MouseEvent, item: Item) => {
    e.stopPropagation();

    // The selection was just made by a long-press marquee: keep it.
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }

    if (e.metaKey || e.ctrlKey) {
      // Toggle selection of this item
      const newSelection = new Set(selectedItemIds);
      if (newSelection.has(item.id)) {
        newSelection.delete(item.id);
      } else {
        newSelection.add(item.id);
      }
      setLastClickedItemId(item.id);
      onSelectionChange(newSelection, item);
    } else if (e.shiftKey && lastClickedItemId) {
      // Range selection
      const fromIdx = items.findIndex((i) => i.id === lastClickedItemId);
      const toIdx = items.findIndex((i) => i.id === item.id);
      if (fromIdx !== -1 && toIdx !== -1) {
        const start = Math.min(fromIdx, toIdx);
        const end = Math.max(fromIdx, toIdx);
        const rangeSet = new Set(selectedItemIds);
        for (let i = start; i <= end; i++) {
          rangeSet.add(items[i].id);
        }
        onSelectionChange(rangeSet, item);
      }
    } else {
      // Normal single selection
      setLastClickedItemId(item.id);
      onSelectionChange(new Set([item.id]), item);
    }
  };

  // ---------------------------------------------------------------------------
  // Rubbery-band selection
  // - the gesture may start anywhere in the main canvas, including the scroll
  //   padding; a press that lands on a card keeps its native drag (move / export)
  //   and only switches to a marquee after a one second long press
  // - the box is clamped to the visible canvas, so it can never run off to the
  //   left or grow endlessly to the right
  // ---------------------------------------------------------------------------
  const canvasBounds = useCallback(() => {
    const container = containerRef.current;
    if (!container) return null;
    const box = container.getBoundingClientRect();
    const host = container.parentElement?.getBoundingClientRect();
    return {
      box,
      left: Math.max(box.left, host?.left ?? box.left),
      right: Math.min(box.right, host?.right ?? box.right),
      top: Math.max(box.top, host?.top ?? box.top),
      bottom: Math.min(box.bottom, host?.bottom ?? box.bottom),
    };
  }, []);

  const cancelLongPress = useCallback(() => {
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  const endMarquee = useCallback(() => {
    cancelLongPress();
    // Hand the pointer back so the app behaves normally again.
    const host = containerRef.current?.parentElement;
    const pointerId = activePointerIdRef.current;
    if (host && pointerId !== null) {
      try {
        if (host.hasPointerCapture(pointerId)) host.releasePointerCapture(pointerId);
      } catch {
        /* pointer already gone */
      }
    }
    activePointerIdRef.current = null;
    longPressOriginRef.current = null;
    // A marquee born from a long press owns the gesture: swallow the click that
    // would otherwise reset the selection to the card underneath the cursor.
    if (longPressArmedRef.current) suppressClickRef.current = true;
    longPressArmedRef.current = false;
    gestureAdditiveRef.current = false;
    pendingPointRef.current = null;
    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
    marqueeRef.current = null;
    setMarquee(null);
  }, [cancelLongPress]);

  const beginMarquee = useCallback(
    (clientX: number, clientY: number) => {
      const container = containerRef.current;
      const bounds = canvasBounds();
      if (!container || !bounds) return;

      // Cache the card boxes once per gesture: the layout cannot change mid-drag.
      cardBoxesRef.current = Array.from(
        container.querySelectorAll<HTMLElement>("[data-asset-id]")
      )
        .map((el) => {
          const r = el.getBoundingClientRect();
          return {
            id: el.dataset.assetId ?? "",
            left: r.left,
            right: r.right,
            top: r.top,
            bottom: r.bottom,
          };
        })
        .filter((card) => card.id);

      const cx = Math.min(Math.max(clientX, bounds.left), bounds.right);
      const cy = Math.min(Math.max(clientY, bounds.top), bounds.bottom);
      const box: MarqueeBox = {
        startX: cx - bounds.box.left,
        startY: cy - bounds.box.top,
        currentX: cx - bounds.box.left,
        currentY: cy - bounds.box.top,
        startClientX: cx,
        startClientY: cy,
        currentClientX: cx,
        currentClientY: cy,
      };
      // Capture the pointer: without this a release that happens outside the
      // window (or after the browser tried to start a file drag) never reaches us
      // and the marquee would stay stuck on screen.
      const pointerId = activePointerIdRef.current;
      const host = containerRef.current?.parentElement;
      if (pointerId !== null && host) {
        try {
          if (!host.hasPointerCapture(pointerId)) host.setPointerCapture(pointerId);
        } catch {
          /* capture unavailable — the buttons check below still recovers */
        }
      }

      selectionKeyRef.current = "";
      marqueeRef.current = box;
      setMarquee(box);
    },
    [canvasBounds]
  );

  const queueMarqueeMove = useCallback(
    (clientX: number, clientY: number, additive: boolean) => {
      const bounds = canvasBounds();
      if (!bounds) return;

      const cx = Math.min(Math.max(clientX, bounds.left), bounds.right);
      const cy = Math.min(Math.max(clientY, bounds.top), bounds.bottom);
      pendingPointRef.current = {
        x: cx - bounds.box.left,
        y: cy - bounds.box.top,
        clientX: cx,
        clientY: cy,
      };

      // Coalesce mousemove bursts into one paint per frame.
      if (frameRef.current !== null) return;
      frameRef.current = requestAnimationFrame(() => {
        frameRef.current = null;
        const point = pendingPointRef.current;
        const current = marqueeRef.current;
        if (!point || !current) return;

        const next: MarqueeBox = {
          ...current,
          currentX: point.x,
          currentY: point.y,
          currentClientX: point.clientX,
          currentClientY: point.clientY,
        };
        marqueeRef.current = next;
        setMarquee(next);

        const boxLeft = Math.min(current.startClientX, point.clientX);
        const boxRight = Math.max(current.startClientX, point.clientX);
        const boxTop = Math.min(current.startClientY, point.clientY);
        const boxBottom = Math.max(current.startClientY, point.clientY);
        // Ignore 1-3px jitter so a plain click never selects through the marquee.
        if (boxRight - boxLeft < 4 && boxBottom - boxTop < 4) return;

        const ids = new Set<string>(additive ? baseSelectionRef.current : []);
        for (const card of cardBoxesRef.current) {
          const hit = !(
            card.right < boxLeft ||
            card.left > boxRight ||
            card.bottom < boxTop ||
            card.top > boxBottom
          );
          if (hit) ids.add(card.id);
        }

        // Skip the parent update when the highlighted set did not actually change.
        const key = Array.from(ids).sort().join("|");
        if (key === selectionKeyRef.current) return;
        selectionKeyRef.current = key;
        onSelectionChangeRef.current(ids);
      });
    },
    [canvasBounds]
  );

  // Listeners are attached once; the handlers no-op unless a gesture is running.
  // The scroll host (parent of the gallery) is used as the press surface so the
  // marquee can start anywhere in the pane, padding included.
  useEffect(() => {
    const host = containerRef.current?.parentElement;
    if (!host) return;

    const handleDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      activePointerIdRef.current = e.pointerId;
      const target = e.target as HTMLElement | null;
      if (!target) return;
      // Real controls keep their own behaviour.
      if (target.closest("button, input, textarea, select, [contenteditable='true']")) return;

      const additive = e.shiftKey || e.metaKey || e.ctrlKey;
      gestureAdditiveRef.current = additive;
      baseSelectionRef.current = additive ? new Set(selectedIdsRef.current) : new Set();
      suppressClickRef.current = false;

      if (target.closest("[data-asset-id]")) {
        // Pressed on a card: leave the native drag (move / export) alone. Holding
        // still for a second cancels it and turns this gesture into a marquee.
        cancelLongPress();
        longPressOriginRef.current = { clientX: e.clientX, clientY: e.clientY };
        longPressTimerRef.current = window.setTimeout(() => {
          longPressTimerRef.current = null;
          const origin = longPressOriginRef.current;
          if (!origin) return;
          longPressArmedRef.current = true;
          beginMarquee(origin.clientX, origin.clientY);
        }, 1000);
        return;
      }

      // Empty canvas: start straight away, clearing the old selection unless a
      // modifier asks to keep it.
      if (!additive) {
        onSelectionChangeRef.current(new Set());
        setLastClickedItemId(null);
      }
      beginMarquee(e.clientX, e.clientY);
    };

    const handleMove = (e: PointerEvent) => {
      // Self-healing: if the button is no longer held (its release was swallowed
      // by a native drag or happened outside the window) the marquee must close.
      if (marqueeRef.current && e.buttons === 0) {
        endMarquee();
        return;
      }
      if (longPressOriginRef.current && !longPressArmedRef.current) {
        // Still waiting for the long press: real movement means the user is
        // dragging the card, so the marquee must never start.
        const origin = longPressOriginRef.current;
        if (Math.abs(e.clientX - origin.clientX) > 6 || Math.abs(e.clientY - origin.clientY) > 6) {
          cancelLongPress();
          longPressOriginRef.current = null;
        }
        return;
      }
      if (!marqueeRef.current) return;
      queueMarqueeMove(
        e.clientX,
        e.clientY,
        gestureAdditiveRef.current || e.shiftKey || e.metaKey || e.ctrlKey
      );
    };

    const handleUp = (e: Event) => {
      // Only the left button release finishes the gesture.
      if (e.type === "pointerup" && (e as PointerEvent).button !== 0) return;
      if (longPressOriginRef.current || marqueeRef.current) endMarquee();
      else {
        cancelLongPress();
        activePointerIdRef.current = null;
      }
    };

    host.addEventListener("pointerdown", handleDown);
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    window.addEventListener("pointercancel", handleUp);
    // Losing the capture (window switch, compositor grab, ...) also ends it.
    host.addEventListener("lostpointercapture", handleUp);
    window.addEventListener("blur", handleUp);
    document.addEventListener("visibilitychange", handleUp);
    return () => {
      host.removeEventListener("pointerdown", handleDown);
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      window.removeEventListener("pointercancel", handleUp);
      host.removeEventListener("lostpointercapture", handleUp);
      window.removeEventListener("blur", handleUp);
      document.removeEventListener("visibilitychange", handleUp);
    };
  }, [beginMarquee, queueMarqueeMove, cancelLongPress, endMarquee]);

  // Calculate visual marquee rect styles
  const marqueeStyle = useMemo(() => {
    if (!marquee) return null;
    const left = Math.min(marquee.startX, marquee.currentX);
    const top = Math.min(marquee.startY, marquee.currentY);
    const width = Math.abs(marquee.currentX - marquee.startX);
    const height = Math.abs(marquee.currentY - marquee.startY);

    return {
      left: `${left}px`,
      top: `${top}px`,
      width: `${width}px`,
      height: `${height}px`,
    };
  }, [marquee]);

  return (
    <div
      ref={containerRef}
      onDragStartCapture={(e) => {
        if (longPressArmedRef.current) {
          // The long press took over: don't let the browser hijack it into a file drag.
          e.preventDefault();
          e.stopPropagation();
          return;
        }
        // A real card drag started — drop any pending long press or marquee.
        endMarquee();
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        onCanvasContextMenu(e);
      }}
      className="relative w-full min-h-full flex flex-col gap-4 select-none"
    >
      {/* 
        Marquee Rubber-Band Drag Selection Box 
      */}
      {marqueeStyle && (
        <div
          data-selection-marquee="true"
          style={marqueeStyle}
          className="absolute z-40 border border-border bg-primary/15 rounded-sm pointer-events-none"
        />
      )}

      {/* Rows of cards: Strictly flex-nowrap to ensure zero unexpected wrapping */}
      {rows.map((row, rowIdx) => (
        <div
          key={rowIdx}
          style={{ gap: `${gap}px` }}
          className="flex flex-nowrap items-start w-full"
        >
          {row.items.map(({ item, width, height }) => (
            <ImageThumbnailCard
              key={item.id}
              item={item}
              cardWidth={width}
              cardHeight={height}
              isSelected={selectedItemIds.has(item.id)}
              onClick={(e) => handleCardClick(e, item)}
              onDoubleClick={() => onDoubleClickItem(item)}
              onDragStart={(e) => onDragStartItem(e, item)}
              onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onItemContextMenu(e, item);
              }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
