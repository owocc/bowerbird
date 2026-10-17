import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import type { Item } from "../../bindings/bowerbird/core/models";
import { ImageThumbnailCard } from "./ImageThumbnailCard";
import { getFileCategory } from "@/lib/formatters";

export interface JustifiedGalleryProps {
  items: Item[];
  /** Ordered list of selected item IDs (earliest selected first, most recently selected last) */
  selectedOrder: string[];
  /** Whether keyboard arrow navigation is active (disabled when a preview modal or menu is open) */
  keyboardNavEnabled?: boolean;
  targetRowHeight?: number;
  gap?: number;
  onSelectionChange: (orderedIds: string[], lastItem?: Item) => void;
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
  rowTotalHeight: number;
  top: number;
  bottom: number;
}

interface MarqueeBox {
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
}

export function JustifiedGallery({
  items,
  selectedOrder,
  keyboardNavEnabled = true,
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
  const [scrollState, setScrollState] = useState<{
    scrollTop: number;
    viewportHeight: number;
    offsetTop: number;
  }>({
    scrollTop: 0,
    viewportHeight: 900,
    offsetTop: 0,
  });
  const selectedSet = useMemo(() => new Set(selectedOrder), [selectedOrder]);

  // Marquee selection state in refs so listeners stay stable across frames
  const marqueeRef = useRef<MarqueeBox | null>(null);
  // Card boxes in content-relative coordinates (relative to containerRef top-left)
  const cardBoxesRef = useRef<
    { id: string; left: number; right: number; top: number; bottom: number }[]
  >([]);
  const pendingClientRef = useRef<{ clientX: number; clientY: number } | null>(null);
  const frameRef = useRef<number | null>(null);
  const selectionKeyRef = useRef("");
  const baseOrderRef = useRef<string[]>([]);
  const currentOrderRef = useRef<string[]>(selectedOrder);
  const gestureAdditiveRef = useRef(false);
  const longPressTimerRef = useRef<number | null>(null);
  const longPressOriginRef = useRef<{ clientX: number; clientY: number } | null>(null);
  const longPressArmedRef = useRef(false);
  const suppressClickRef = useRef(false);
  const activePointerIdRef = useRef<number | null>(null);
  const onSelectionChangeRef = useRef(onSelectionChange);

  useEffect(() => {
    currentOrderRef.current = selectedOrder;
  }, [selectedOrder]);

  useEffect(() => {
    onSelectionChangeRef.current = onSelectionChange;
  }, [onSelectionChange]);

  // Track previous width & scroll metrics in refs to prevent ResizeObserver feedback loops
  // (e.g. vertical scrollbar toggling between W and W-scrollbarWidth when content height crosses viewportHeight)
  const prevWidthRef = useRef<number>(800);
  const prevWidthBeforeRef = useRef<number>(800);
  const lastOscillationTsRef = useRef<number>(0);
  const lockedScrollbarPairRef = useRef<{ narrow: number; wide: number } | null>(null);

  // Measure container width responsively with scrollbar-oscillation damping
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let rafId: number | null = null;

    const syncLayoutMetrics = () => {
      rafId = null;
      const el = containerRef.current;
      if (!el) return;
      const host = el.parentElement;

      // Prefer clientWidth on container; floor to integer to avoid subpixel jitter
      const rawWidth = Math.floor(el.clientWidth || el.getBoundingClientRect().width);
      if (rawWidth > 0) {
        const locked = lockedScrollbarPairRef.current;
        if (
          locked &&
          rawWidth !== locked.narrow &&
          rawWidth !== locked.wide
        ) {
          // Genuine container resize (window or panel drag): clear scrollbar bounce lock
          lockedScrollbarPairRef.current = null;
        }

        if (lockedScrollbarPairRef.current) {
          const stableWidth = lockedScrollbarPairRef.current.narrow;
          if (prevWidthRef.current !== stableWidth) {
            prevWidthRef.current = stableWidth;
            setContainerWidth(stableWidth);
          }
        } else if (rawWidth !== prevWidthRef.current) {
          const now = performance.now();
          const delta = Math.abs(rawWidth - prevWidthRef.current);
          const isScrollbarBounce =
            rawWidth === prevWidthBeforeRef.current &&
            delta > 0 &&
            delta <= 20 &&
            now - lastOscillationTsRef.current < 400;

          if (isScrollbarBounce) {
            // Break the ResizeObserver <-> scrollbar cycle by locking to the narrower (scrollbar-present) width
            const narrow = Math.min(rawWidth, prevWidthRef.current);
            const wide = Math.max(rawWidth, prevWidthRef.current);
            lockedScrollbarPairRef.current = { narrow, wide };
            prevWidthBeforeRef.current = prevWidthRef.current;
            prevWidthRef.current = narrow;
            setContainerWidth(narrow);
          } else {
            lastOscillationTsRef.current = now;
            prevWidthBeforeRef.current = prevWidthRef.current;
            prevWidthRef.current = rawWidth;
            setContainerWidth(rawWidth);
          }
        }
      }

      if (host) {
        const nextScrollTop = host.scrollTop;
        const nextViewportHeight = host.clientHeight || 900;
        const nextOffsetTop = el.offsetTop || 0;
        setScrollState((prev) => {
          if (
            prev.scrollTop === nextScrollTop &&
            prev.viewportHeight === nextViewportHeight &&
            prev.offsetTop === nextOffsetTop
          ) {
            return prev;
          }
          return {
            scrollTop: nextScrollTop,
            viewportHeight: nextViewportHeight,
            offsetTop: nextOffsetTop,
          };
        });
      }
    };

    syncLayoutMetrics();
    const observer = new ResizeObserver(() => {
      if (rafId !== null) return;
      rafId = requestAnimationFrame(syncLayoutMetrics);
    });
    observer.observe(container);
    const host = container.parentElement;
    if (host) observer.observe(host);
    return () => {
      observer.disconnect();
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, []);

  // Track scroll position on scroll host for row virtualization (rAF throttled)
  useEffect(() => {
    const host = containerRef.current?.parentElement;
    if (!host) return;
    let scrollRaf: number | null = null;
    const syncScroll = () => {
      scrollRaf = null;
      if (!containerRef.current) return;
      const nextScrollTop = host.scrollTop;
      const nextViewportHeight = host.clientHeight || 900;
      const nextOffsetTop = containerRef.current.offsetTop || 0;
      setScrollState((prev) => {
        if (
          prev.scrollTop === nextScrollTop &&
          prev.viewportHeight === nextViewportHeight &&
          prev.offsetTop === nextOffsetTop
        ) {
          return prev;
        }
        return {
          scrollTop: nextScrollTop,
          viewportHeight: nextViewportHeight,
          offsetTop: nextOffsetTop,
        };
      });
    };
    const onScroll = () => {
      if (scrollRaf !== null) return;
      scrollRaf = requestAnimationFrame(syncScroll);
    };
    syncScroll();
    host.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      host.removeEventListener("scroll", onScroll);
      if (scrollRaf !== null) cancelAnimationFrame(scrollRaf);
    };
  }, []);

  // Clear scrollbar bounce lock when items or targetRowHeight change so fresh layouts can use full width if appropriate
  useEffect(() => {
    lockedScrollbarPairRef.current = null;
  }, [items.length, targetRowHeight]);

  // Compute justified rows layout with pixel-perfect row filling
  const rows = useMemo(() => {
    if (!items || items.length === 0) return [];

    const safeContainerWidth = Math.max(100, Math.floor(containerWidth));
    const safeTargetHeight = Math.max(40, Math.round(targetRowHeight));
    const computedRows: LayoutRow[] = [];
    let currentRow: { item: Item; ratio: number }[] = [];
    let currentRatiosSum = 0;

    const MIN_RATIO = 0.45;
    const MAX_RATIO = 3.5;

    const getItemRatio = (item: Item): number => {
      const category = getFileCategory(item.extension, item.mimeType);
      const hasVisualRatio =
        category === "image" || (category === "video" && item.hasThumbnail);

      if (
        !hasVisualRatio ||
        !item.width ||
        !item.height ||
        item.width <= 0 ||
        item.height <= 0
      ) {
        return 1.0;
      }

      const rawRatio = item.width / item.height;
      return Math.max(MIN_RATIO, Math.min(MAX_RATIO, rawRatio));
    };

    const buildFilledRow = (
      rowEntries: { item: Item; ratio: number }[],
      availableWidth: number,
      projectedHeight: number,
      maxHeight: number
    ): LayoutRow => {
      const finalHeight = Math.max(40, Math.min(maxHeight, Math.round(projectedHeight)));
      const widths = rowEntries.map((entry) =>
        Math.max(1, Math.floor(finalHeight * entry.ratio))
      );
      const currentTotal = widths.reduce((a, b) => a + b, 0);
      const diff = availableWidth - currentTotal;

      // Only distribute positive remainder when row was not capped by maxHeight
      if (diff > 0 && projectedHeight <= maxHeight && widths.length > 0) {
        for (let k = 0; k < diff; k++) {
          widths[k % widths.length] += 1;
        }
      } else if (diff < 0 && widths.length > 0) {
        // Never let a row exceed availableWidth and cause horizontal overflow
        let excess = -diff;
        let guard = 0;
        while (excess > 0 && guard < widths.length * 4) {
          const idx = guard % widths.length;
          if (widths[idx] > 24) {
            widths[idx] -= 1;
            excess -= 1;
          }
          guard++;
        }
      }

      const layoutItems: LayoutItem[] = rowEntries.map((entry, idx) => ({
        item: entry.item,
        width: widths[idx],
        height: finalHeight,
      }));

      return {
        items: layoutItems,
        height: finalHeight,
        rowTotalHeight: 0,
        top: 0,
        bottom: 0,
      };
    };

    const maxRowHeightCap = Math.round(safeTargetHeight * 1.35);

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const ratio = getItemRatio(item);

      currentRow.push({ item, ratio });
      currentRatiosSum += ratio;

      const gapsTotal = (currentRow.length - 1) * gap;
      const availableWidth = Math.max(100, safeContainerWidth - gapsTotal);
      const projectedHeight = availableWidth / currentRatiosSum;

      if (projectedHeight <= safeTargetHeight * 1.25) {
        computedRows.push(
          buildFilledRow(currentRow, availableWidth, projectedHeight, maxRowHeightCap)
        );
        currentRow = [];
        currentRatiosSum = 0;
      }
    }

    if (currentRow.length > 0) {
      const gapsTotal = (currentRow.length - 1) * gap;
      const availableWidth = Math.max(100, safeContainerWidth - gapsTotal);
      const projectedHeight = availableWidth / currentRatiosSum;

      if (projectedHeight <= safeTargetHeight * 1.35) {
        computedRows.push(
          buildFilledRow(currentRow, availableWidth, projectedHeight, maxRowHeightCap)
        );
      } else {
        const finalHeight = safeTargetHeight;
        const layoutItems: LayoutItem[] = currentRow.map((entry) => ({
          item: entry.item,
          width: Math.min(availableWidth, Math.max(1, Math.round(finalHeight * entry.ratio))),
          height: finalHeight,
        }));
        computedRows.push({
          items: layoutItems,
          height: finalHeight,
          rowTotalHeight: 0,
          top: 0,
          bottom: 0,
        });
      }
    }
    const LABEL_HEIGHT = 24;
    const ROW_GAP = 16;
    let yCursor = 0;
    for (let r = 0; r < computedRows.length; r++) {
      const rowTotalHeight = computedRows[r].height + LABEL_HEIGHT;
      computedRows[r].rowTotalHeight = rowTotalHeight;
      computedRows[r].top = yCursor;
      computedRows[r].bottom = yCursor + rowTotalHeight;
      yCursor += rowTotalHeight + ROW_GAP;
    }

    return computedRows;
  }, [items, containerWidth, targetRowHeight, gap]);

  // Handle single / Cmd / Shift card selection preserving FIFO selection order
  const handleCardClick = (e: React.MouseEvent, item: Item) => {
    e.stopPropagation();

    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }

    if (e.metaKey || e.ctrlKey) {
      const exists = selectedSet.has(item.id);
      const nextOrder = exists
        ? selectedOrder.filter((id) => id !== item.id)
        : [...selectedOrder, item.id];
      setLastClickedItemId(item.id);
      onSelectionChange(nextOrder, exists ? undefined : item);
    } else if (e.shiftKey && lastClickedItemId) {
      const fromIdx = items.findIndex((i) => i.id === lastClickedItemId);
      const toIdx = items.findIndex((i) => i.id === item.id);
      if (fromIdx !== -1 && toIdx !== -1) {
        const step = fromIdx <= toIdx ? 1 : -1;
        const nextOrder = [...selectedOrder];
        const existing = new Set(nextOrder);
        for (let i = fromIdx; step > 0 ? i <= toIdx : i >= toIdx; i += step) {
          const id = items[i].id;
          if (!existing.has(id)) {
            existing.add(id);
            nextOrder.push(id);
          }
        }
        onSelectionChange(nextOrder, item);
      }
    } else {
      setLastClickedItemId(item.id);
      onSelectionChange([item.id], item);
    }
  };

  // Precompute 2D spatial lookup (row index, item index in row, horizontal center X)
  // so ArrowUp / ArrowDown can jump to the visually aligned card in the adjacent row,
  // while ArrowLeft / ArrowRight step sequentially across items.
  const layoutIndex = useMemo(() => {
    const byId = new Map<
      string,
      { flatIdx: number; rowIdx: number; colIdx: number; centerX: number }
    >();
    const rowCenters: { item: Item; flatIdx: number; centerX: number }[][] = [];
    const boxes: { id: string; left: number; right: number; top: number; bottom: number }[] = [];
    let flatIdx = 0;

    for (let r = 0; r < rows.length; r++) {
      const row = rows[r];
      let xCursor = 0;
      const centers: { item: Item; flatIdx: number; centerX: number }[] = [];
      for (let c = 0; c < row.items.length; c++) {
        const entry = row.items[c];
        const centerX = xCursor + entry.width / 2;
        byId.set(entry.item.id, {
          flatIdx,
          rowIdx: r,
          colIdx: c,
          centerX,
        });
        centers.push({ item: entry.item, flatIdx, centerX });
        boxes.push({
          id: entry.item.id,
          left: xCursor,
          right: xCursor + entry.width,
          top: row.top,
          bottom: row.bottom,
        });
        xCursor += entry.width + gap;
        flatIdx++;
      }
      rowCenters.push(centers);
    }

    return { byId, rowCenters, boxes };
  }, [rows, gap]);

  // Remember the horizontal anchor X across consecutive ArrowUp / ArrowDown presses
  // so navigating through rows with varying card widths doesn't drift horizontally.
  const verticalAnchorXRef = useRef<number | null>(null);

  // Reset vertical anchor X whenever user clicks a card
  useEffect(() => {
    verticalAnchorXRef.current = null;
  }, [lastClickedItemId]);

  // 2D Arrow-key navigation (ArrowLeft, ArrowRight, ArrowUp, ArrowDown)
  useEffect(() => {
    if (!keyboardNavEnabled || items.length === 0) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Do not hijack when modifier keys for browser history (Alt/Cmd/Ctrl + Arrow) are pressed
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable ||
          target.closest("[role='menu'], [role='dialog'], [data-slot='slider']"))
      ) {
        return;
      }

      const { code } = e;
      if (
        code !== "ArrowLeft" &&
        code !== "ArrowRight" &&
        code !== "ArrowUp" &&
        code !== "ArrowDown"
      ) {
        return;
      }

      e.preventDefault();

      const currentOrder = currentOrderRef.current;
      const activeId =
        currentOrder.length > 0
          ? currentOrder[currentOrder.length - 1]
          : lastClickedItemId;
      const currentPos = activeId ? layoutIndex.byId.get(activeId) : undefined;

      let nextItem: Item | undefined;

      if (!currentPos) {
        // Nothing currently selected: pick first item (or last item for ArrowLeft/ArrowUp)
        nextItem =
          code === "ArrowLeft" || code === "ArrowUp"
            ? items[items.length - 1]
            : items[0];
        verticalAnchorXRef.current = null;
      } else if (code === "ArrowLeft") {
        verticalAnchorXRef.current = null;
        const nextFlat = Math.max(0, currentPos.flatIdx - 1);
        nextItem = items[nextFlat];
      } else if (code === "ArrowRight") {
        verticalAnchorXRef.current = null;
        const nextFlat = Math.min(items.length - 1, currentPos.flatIdx + 1);
        nextItem = items[nextFlat];
      } else {
        // ArrowUp or ArrowDown: find card with closest horizontal centerX in target row
        const targetRowIdx =
          code === "ArrowUp" ? currentPos.rowIdx - 1 : currentPos.rowIdx + 1;
        if (targetRowIdx < 0 || targetRowIdx >= layoutIndex.rowCenters.length) {
          // Already on top/bottom row: keep current selection and ensure it is scrolled into view
          nextItem = items[currentPos.flatIdx];
        } else {
          const anchorX = verticalAnchorXRef.current ?? currentPos.centerX;
          verticalAnchorXRef.current = anchorX;
          const targetRow = layoutIndex.rowCenters[targetRowIdx];
          let best = targetRow[0];
          let bestDist = Math.abs(best.centerX - anchorX);
          for (let i = 1; i < targetRow.length; i++) {
            const candidate = targetRow[i];
            const dist = Math.abs(candidate.centerX - anchorX);
            if (dist < bestDist) {
              best = candidate;
              bestDist = dist;
            }
          }
          nextItem = best.item;
        }
      }

      if (!nextItem) return;

      if (e.shiftKey) {
        // Shift + Arrow: extend or move selection in FIFO order
        const anchorId =
          lastClickedItemId ??
          (currentOrder.length > 0 ? currentOrder[0] : nextItem.id);
        if (!lastClickedItemId) {
          setLastClickedItemId(anchorId);
        }
        const nextPos = layoutIndex.byId.get(nextItem.id);
        const anchorPos = layoutIndex.byId.get(anchorId);
        if (nextPos && anchorPos) {
          const step = anchorPos.flatIdx <= nextPos.flatIdx ? 1 : -1;
          const rangeOrder: string[] = [];
          for (
            let i = anchorPos.flatIdx;
            step > 0 ? i <= nextPos.flatIdx : i >= nextPos.flatIdx;
            i += step
          ) {
            rangeOrder.push(items[i].id);
          }
          currentOrderRef.current = rangeOrder;
          onSelectionChangeRef.current(rangeOrder, nextItem);
        } else if (!currentOrder.includes(nextItem.id)) {
          const nextOrder = [...currentOrder, nextItem.id];
          currentOrderRef.current = nextOrder;
          onSelectionChangeRef.current(nextOrder, nextItem);
        }
      } else {
        setLastClickedItemId(nextItem.id);
        const nextOrder = [nextItem.id];
        currentOrderRef.current = nextOrder;
        onSelectionChangeRef.current(nextOrder, nextItem);
      }

      // Scroll the newly active card smoothly into the visible viewport if needed
      const container = containerRef.current;
      const host = container?.parentElement;
      const nextPos = layoutIndex.byId.get(nextItem.id);
      if (host && nextPos && rows[nextPos.rowIdx]) {
        const targetRow = rows[nextPos.rowIdx];
        const viewTop = host.scrollTop;
        const viewBottom = viewTop + host.clientHeight;
        if (targetRow.top < viewTop) {
          host.scrollTop = Math.max(0, targetRow.top - 16);
        } else if (targetRow.bottom > viewBottom) {
          host.scrollTop = targetRow.bottom - host.clientHeight + 32;
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [keyboardNavEnabled, items, layoutIndex, lastClickedItemId]);

  // Convert viewport client coordinates to containerRef-relative coordinates
  // so marquee works identically anywhere in the scroll viewport (including padding & blank space below rows)
  const clientToContainerPoint = useCallback((clientX: number, clientY: number) => {
    const container = containerRef.current;
    const host = container?.parentElement;
    if (!container || !host) return null;

    const hostRect = host.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();

    // Clamp to visible scroll host viewport
    const clampedClientX = Math.max(hostRect.left, Math.min(hostRect.right, clientX));
    const clampedClientY = Math.max(hostRect.top, Math.min(hostRect.bottom, clientY));

    return {
      x: clampedClientX - containerRect.left,
      y: clampedClientY - containerRect.top,
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
    const host = containerRef.current?.parentElement;
    const pointerId = activePointerIdRef.current;
    if (host && pointerId !== null) {
      try {
        if (host.hasPointerCapture(pointerId)) host.releasePointerCapture(pointerId);
      } catch {
        /* pointer already released */
      }
    }
    activePointerIdRef.current = null;
    longPressOriginRef.current = null;
    if (longPressArmedRef.current) suppressClickRef.current = true;
    longPressArmedRef.current = false;
    gestureAdditiveRef.current = false;
    pendingClientRef.current = null;
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
      const pt = clientToContainerPoint(clientX, clientY);
      if (!container || !pt) return;

      // Use precomputed layout boxes so marquee works across all virtualized rows
      cardBoxesRef.current = layoutIndex.boxes;
      const box: MarqueeBox = {
        startX: pt.x,
        startY: pt.y,
        currentX: pt.x,
        currentY: pt.y,
      };

      const pointerId = activePointerIdRef.current;
      const host = container.parentElement;
      if (pointerId !== null && host) {
        try {
          if (!host.hasPointerCapture(pointerId)) host.setPointerCapture(pointerId);
        } catch {
          /* ignore */
        }
      }

      selectionKeyRef.current = "";
      marqueeRef.current = box;
      setMarquee(box);
    },
    [clientToContainerPoint, layoutIndex.boxes]
  );

  const queueMarqueeMove = useCallback(
    (clientX: number, clientY: number, additive: boolean) => {
      pendingClientRef.current = { clientX, clientY };

      if (frameRef.current !== null) return;
      frameRef.current = requestAnimationFrame(() => {
        frameRef.current = null;
        const rawPt = pendingClientRef.current;
        const current = marqueeRef.current;
        const host = containerRef.current?.parentElement;
        if (!rawPt || !current || !host) return;

        // Auto-scroll when dragging near the top or bottom edge of the scroll host
        const hostRect = host.getBoundingClientRect();
        const EDGE_ZONE = 36;
        if (rawPt.clientY < hostRect.top + EDGE_ZONE) {
          host.scrollTop -= Math.ceil((hostRect.top + EDGE_ZONE - rawPt.clientY) * 0.35);
        } else if (rawPt.clientY > hostRect.bottom - EDGE_ZONE) {
          host.scrollTop += Math.ceil((rawPt.clientY - (hostRect.bottom - EDGE_ZONE)) * 0.35);
        }

        const pt = clientToContainerPoint(rawPt.clientX, rawPt.clientY);
        if (!pt) return;

        const next: MarqueeBox = {
          ...current,
          currentX: pt.x,
          currentY: pt.y,
        };
        marqueeRef.current = next;
        setMarquee(next);

        const boxLeft = Math.min(current.startX, pt.x);
        const boxRight = Math.max(current.startX, pt.x);
        const boxTop = Math.min(current.startY, pt.y);
        const boxBottom = Math.max(current.startY, pt.y);

        if (boxRight - boxLeft < 4 && boxBottom - boxTop < 4) return;

        // Collect all currently intersected card IDs
        const hitSet = new Set<string>();
        for (const card of cardBoxesRef.current) {
          const hit = !(
            card.right < boxLeft ||
            card.left > boxRight ||
            card.bottom < boxTop ||
            card.top > boxBottom
          );
          if (hit) hitSet.add(card.id);
        }

        // Preserve FIFO selection order:
        // 1. Keep items from baseOrder (if additive) or currentOrder that are still hit, in their existing order
        // 2. Append newly hit items to the end of the queue
        const prevOrder = currentOrderRef.current;
        const baseSet = new Set(additive ? baseOrderRef.current : []);
        const nextOrder: string[] = [];
        const seen = new Set<string>();

        for (const id of prevOrder) {
          if (hitSet.has(id) || baseSet.has(id)) {
            nextOrder.push(id);
            seen.add(id);
          }
        }
        for (const id of hitSet) {
          if (!seen.has(id)) {
            nextOrder.push(id);
            seen.add(id);
          }
        }

        const key = nextOrder.join("|");
        if (key === selectionKeyRef.current) return;
        selectionKeyRef.current = key;
        currentOrderRef.current = nextOrder;
        onSelectionChangeRef.current(nextOrder);
      });
    },
    [clientToContainerPoint]
  );

  // Attach pointer listeners to the scroll host so pressing ANYWHERE in the canvas
  // (between cards, row-end whitespace, bottom blank space, or padding) triggers marquee selection.
  useEffect(() => {
    const host = containerRef.current?.parentElement;
    if (!host) return;

    const handleDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      activePointerIdRef.current = e.pointerId;
      const target = e.target as HTMLElement | null;
      if (!target) return;
      if (
        target.closest(
          "button, input, textarea, select, [contenteditable='true']"
        )
      ) {
        return;
      }

      const additive = e.shiftKey || e.metaKey || e.ctrlKey;
      gestureAdditiveRef.current = additive;
      baseOrderRef.current = additive ? [...currentOrderRef.current] : [];
      suppressClickRef.current = false;

      if (target.closest("[data-asset-id]")) {
        // Pressed on a card: allow native drag, or convert to marquee on 1s long press
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

      // Pressed on any whitespace (padding, row gap, row-end blank, or below last row):
      // Immediately clear selection (unless additive) and start marquee box!
      if (!additive) {
        currentOrderRef.current = [];
        onSelectionChangeRef.current([]);
        setLastClickedItemId(null);
      }
      beginMarquee(e.clientX, e.clientY);
    };

    const handleMove = (e: PointerEvent) => {
      if (marqueeRef.current && e.buttons === 0) {
        endMarquee();
        return;
      }
      if (longPressOriginRef.current && !longPressArmedRef.current) {
        const origin = longPressOriginRef.current;
        if (
          Math.abs(e.clientX - origin.clientX) > 6 ||
          Math.abs(e.clientY - origin.clientY) > 6
        ) {
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

  // Compute virtualized visible row slice with generous overscan
  const { visibleRows, topSpacerHeight, bottomSpacerHeight } = useMemo(() => {
    if (rows.length <= 24) {
      return { visibleRows: rows, topSpacerHeight: 0, bottomSpacerHeight: 0 };
    }
    const overscan = 600;
    const lastRow = rows[rows.length - 1];
    const totalContentHeight = lastRow ? lastRow.bottom : 0;
    const effectiveViewportHeight = Math.max(600, scrollState.viewportHeight);
    const rawRelativeScrollTop = Math.max(0, scrollState.scrollTop - scrollState.offsetTop);
    // Clamp scrollTop to valid scrollable range so deleting items while scrolled near the bottom
    // never produces an out-of-bounds slice before the browser clamps host.scrollTop
    const maxValidScrollTop = Math.max(0, totalContentHeight - effectiveViewportHeight);
    const relativeScrollTop = Math.min(rawRelativeScrollTop, maxValidScrollTop);
    const minY = Math.max(0, relativeScrollTop - overscan);
    const maxY = relativeScrollTop + effectiveViewportHeight + overscan;
    let startIdx = 0;
    while (startIdx < rows.length && rows[startIdx].bottom < minY) {
      startIdx++;
    }
    let endIdx = startIdx;
    while (endIdx < rows.length && rows[endIdx].top <= maxY) {
      endIdx++;
    }
    startIdx = Math.max(0, startIdx - 1);
    endIdx = Math.min(rows.length, endIdx + 1);

    const topH = startIdx > 0 ? rows[startIdx].top : 0;
    const endRow = endIdx > 0 ? rows[endIdx - 1] : null;
    const bottomH = endRow && endIdx < rows.length ? Math.max(0, lastRow.bottom - endRow.bottom) : 0;

    return {
      visibleRows: rows.slice(startIdx, endIdx),
      topSpacerHeight: topH,
      bottomSpacerHeight: bottomH,
    };
  }, [rows, scrollState.scrollTop, scrollState.viewportHeight, scrollState.offsetTop]);
  return (
    <div
      ref={containerRef}
      onDragStartCapture={(e) => {
        if (longPressArmedRef.current) {
          e.preventDefault();
          e.stopPropagation();
          return;
        }
        endMarquee();
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        onCanvasContextMenu(e);
      }}
      className="relative w-full flex-1 flex flex-col gap-4 select-none overflow-x-hidden"
    >
      {marqueeStyle && (
        <div
          data-selection-marquee="true"
          style={marqueeStyle}
          className="absolute z-40 border border-primary/70 bg-primary/15 rounded-xs pointer-events-none"
        />
      )}

      {topSpacerHeight > 0 && (
        <div style={{ height: `${topSpacerHeight}px`, marginBottom: "-16px" }} className="w-full shrink-0 pointer-events-none" />
      )}

      {visibleRows.map((row) => (
        <div
          key={row.items[0]?.item.id ?? row.top}
          style={{ gap: `${gap}px` }}
          className="flex flex-nowrap items-start w-full shrink-0"
        >
          {row.items.map(({ item, width, height }) => (
            <ImageThumbnailCard
              key={item.id}
              item={item}
              cardWidth={width}
              cardHeight={height}
              isSelected={selectedSet.has(item.id)}
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

      {bottomSpacerHeight > 0 && (
        <div style={{ height: `${bottomSpacerHeight}px`, marginTop: "-16px" }} className="w-full shrink-0 pointer-events-none" />
      )}

      {/* Flexible blank canvas filler at the bottom so clicking/dragging below the last row always hits containerRef */}
      <div className="flex-1 min-h-4 w-full pointer-events-none" />
    </div>
  );
}
