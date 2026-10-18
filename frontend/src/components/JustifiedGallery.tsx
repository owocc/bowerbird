import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { Item } from "../../bindings/bowerbird/core/models";
import { ImageThumbnailCard } from "./ImageThumbnailCard";
import { getFileCategory } from "@/lib/formatters";
import { logDiagnostic } from "@/lib/logger";
import type { GalleryLayoutMode } from "@/lib/workspace-search";
export interface GalleryItemsSource {
  items: Item[];
  version: number;
}

export interface JustifiedGalleryProps {
  /** Wrapped or direct items source — wrapping in { items, version } prevents React 19 DEV Profiler from O(N) diffing 37k+ array elements on prop change! */
  items: Item[] | GalleryItemsSource;
  /** Ordered list of selected item IDs (earliest selected first, most recently selected last) */
  selectedOrder: string[];
  /** Active gallery layout mode: justified | waterfall | grid | list */
  layoutMode?: GalleryLayoutMode;
  /** Scroll container element ref from parent workspace */
  scrollElementRef?: React.RefObject<HTMLDivElement | null>;
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

interface MarqueeBox {
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
}

/**
 * Contiguous TypedArray layout buffer for 30,000 to 500,000+ items.
 * Zero per-item JS object allocations during layout calculation!
 */
interface TypedLayoutData {
  count: number;
  unitCount: number;
  totalHeight: number;
  cardLeft: Float32Array;
  cardTop: Float32Array;
  cardWidth: Float32Array;
  cardHeight: Float32Array;
  cardThumbHeight: Float32Array;
  /** For row-based layouts (justified/grid/list), unitStart[u]..unitStart[u]+unitCardCount[u] is the contiguous item index slice */
  unitStart: Int32Array;
  unitCardCount: Int32Array;
  unitTop: Float32Array;
  unitSize: Float32Array;
  /** Only populated in waterfall mode where cards in a Y-band are non-contiguous */
  waterfallBands: number[][] | null;
  /** Lazy ID -> flat index map built only on demand */
  idToIndexRef: { map: Map<string, number> | null };
}

const LABEL_HEIGHT = 28;
const ROW_GAP = 16;
const WATERFALL_BAND_HEIGHT = 320;

export const JustifiedGallery = React.memo(function JustifiedGallery({
  items: rawItemsProp,
  selectedOrder,
  layoutMode = "justified",
  scrollElementRef,
  keyboardNavEnabled = true,
  targetRowHeight = 80,
  gap = 12,
  onSelectionChange,
  onDoubleClickItem,
  onDragStartItem,
  onItemContextMenu,
  onCanvasContextMenu,
}: JustifiedGalleryProps) {
  const items = Array.isArray(rawItemsProp) ? rawItemsProp : rawItemsProp.items;
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState<number>(800);
  const [scrollMargin, setScrollMargin] = useState<number>(0);
  const [marquee, setMarquee] = useState<MarqueeBox | null>(null);
  const [lastClickedItemId, setLastClickedItemId] = useState<string | null>(null);
  const selectedSet = useMemo(() => new Set(selectedOrder), [selectedOrder]);

  // Marquee selection state in refs so listeners stay stable across frames
  const marqueeRef = useRef<MarqueeBox | null>(null);
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
  const onDoubleClickRef = useRef(onDoubleClickItem);
  const onDragStartRef = useRef(onDragStartItem);
  const onItemContextMenuRef = useRef(onItemContextMenu);

  useEffect(() => {
    currentOrderRef.current = selectedOrder;
  }, [selectedOrder]);

  useEffect(() => {
    onSelectionChangeRef.current = onSelectionChange;
    onDoubleClickRef.current = onDoubleClickItem;
    onDragStartRef.current = onDragStartItem;
    onItemContextMenuRef.current = onItemContextMenu;
  }, [onSelectionChange, onDoubleClickItem, onDragStartItem, onItemContextMenu]);

  // Resolve scroll host element (either passed via scrollElementRef or parentElement)
  const getScrollHost = useCallback((): HTMLElement | null => {
    return scrollElementRef?.current ?? containerRef.current?.parentElement ?? null;
  }, [scrollElementRef]);

  // Track previous width & scroll metrics in refs to prevent ResizeObserver feedback loops
  const prevWidthRef = useRef<number>(0);
  const prevWidthBeforeRef = useRef<number>(0);
  const bounceCountRef = useRef<number>(0);
  const lastWidthChangeTsRef = useRef<number>(0);
  const lockedScrollbarPairRef = useRef<{ narrow: number; wide: number } | null>(null);

  // Measure container width and offsetTop responsively with scrollbar-oscillation damping
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let rafId: number | null = null;

    const syncLayoutMetrics = () => {
      rafId = null;
      const el = containerRef.current;
      if (!el) return;

      const rawWidth = Math.floor(el.clientWidth || el.getBoundingClientRect().width);
      if (rawWidth > 0) {
        if (prevWidthRef.current === 0) {
          prevWidthRef.current = rawWidth;
          prevWidthBeforeRef.current = rawWidth;
          setContainerWidth(rawWidth);
        } else {
          const locked = lockedScrollbarPairRef.current;
          if (
            locked &&
            rawWidth !== locked.narrow &&
            rawWidth !== locked.wide
          ) {
            lockedScrollbarPairRef.current = null;
            bounceCountRef.current = 0;
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
            const isStepBounce =
              prevWidthBeforeRef.current > 0 &&
              rawWidth === prevWidthBeforeRef.current &&
              delta > 0 &&
              delta <= 18 &&
              now - lastWidthChangeTsRef.current < 120;

            if (isStepBounce) {
              bounceCountRef.current += 1;
            } else {
              bounceCountRef.current = 0;
            }

            lastWidthChangeTsRef.current = now;

            if (bounceCountRef.current >= 2) {
              const narrow = Math.min(rawWidth, prevWidthRef.current);
              const wide = Math.max(rawWidth, prevWidthRef.current);
              lockedScrollbarPairRef.current = { narrow, wide };
              prevWidthBeforeRef.current = prevWidthRef.current;
              prevWidthRef.current = narrow;
              setContainerWidth(narrow);
            } else {
              prevWidthBeforeRef.current = prevWidthRef.current;
              prevWidthRef.current = rawWidth;
              setContainerWidth(rawWidth);
            }
          }
        }
      }

      const nextOffsetTop = el.offsetTop || 0;
      setScrollMargin((prev) => (prev === nextOffsetTop ? prev : nextOffsetTop));
    };

    syncLayoutMetrics();
    const observer = new ResizeObserver(() => {
      if (rafId !== null) return;
      rafId = requestAnimationFrame(syncLayoutMetrics);
    });
    observer.observe(container);
    const host = getScrollHost();
    if (host) observer.observe(host);
    return () => {
      observer.disconnect();
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, [getScrollHost]);

  // Clear scrollbar bounce lock when items, layoutMode, or targetRowHeight change
  useEffect(() => {
    lockedScrollbarPairRef.current = null;
    bounceCountRef.current = 0;
  }, [items.length, targetRowHeight, layoutMode]);

  // Zero-allocation TypedArray 2D spatial layout engine
  const layoutData = useMemo<TypedLayoutData>(() => {
    const tLayout0 = performance.now();
    const n = items ? items.length : 0;
    if (n === 0) {
      return {
        count: 0,
        unitCount: 0,
        totalHeight: 0,
        cardLeft: new Float32Array(0),
        cardTop: new Float32Array(0),
        cardWidth: new Float32Array(0),
        cardHeight: new Float32Array(0),
        cardThumbHeight: new Float32Array(0),
        unitStart: new Int32Array(0),
        unitCardCount: new Int32Array(0),
        unitTop: new Float32Array(0),
        unitSize: new Float32Array(0),
        waterfallBands: null,
        idToIndexRef: { map: null },
      };
    }

    const safeContainerWidth = Math.max(120, Math.floor(containerWidth));
    const safeTargetHeight = Math.max(40, Math.round(targetRowHeight));

    const cardLeft = new Float32Array(n);
    const cardTop = new Float32Array(n);
    const cardWidth = new Float32Array(n);
    const cardHeight = new Float32Array(n);
    const cardThumbHeight = new Float32Array(n);

    const MIN_RATIO = 0.45;
    const MAX_RATIO = 3.5;

    const getItemRatio = (item: Item): number => {
      const w = item.width;
      const h = item.height;
      if (!w || !h || w <= 0 || h <= 0) return 1.0;
      const category = getFileCategory(item.extension, item.mimeType);
      if (category !== "image" && !(category === "video" && item.hasThumbnail)) {
        return 1.0;
      }
      const rawRatio = w / h;
      return rawRatio < MIN_RATIO ? MIN_RATIO : rawRatio > MAX_RATIO ? MAX_RATIO : rawRatio;
    };

    if (layoutMode === "list") {
      // ================= 1. LIST VIEW =================
      const rowHeight = Math.max(44, Math.min(84, Math.round(safeTargetHeight * 0.56)));
      const listGap = 4;
      const unitStart = new Int32Array(n);
      const unitCardCount = new Int32Array(n);
      const unitTop = new Float32Array(n);
      const unitSize = new Float32Array(n);

      let yCursor = 0;
      for (let i = 0; i < n; i++) {
        const isLast = i === n - 1;
        const uSize = isLast ? rowHeight : rowHeight + listGap;
        cardLeft[i] = 0;
        cardTop[i] = yCursor;
        cardWidth[i] = safeContainerWidth;
        cardHeight[i] = rowHeight;
        cardThumbHeight[i] = rowHeight;

        unitStart[i] = i;
        unitCardCount[i] = 1;
        unitTop[i] = yCursor;
        unitSize[i] = uSize;
        yCursor += uSize;
      }

      return {
        count: n,
        unitCount: n,
        totalHeight: yCursor,
        cardLeft,
        cardTop,
        cardWidth,
        cardHeight,
        cardThumbHeight,
        unitStart,
        unitCardCount,
        unitTop,
        unitSize,
        waterfallBands: null,
        idToIndexRef: { map: null },
      };
    }

    if (layoutMode === "grid") {
      // ================= 2. UNIFORM GRID VIEW =================
      const targetColWidth = Math.max(90, Math.round(safeTargetHeight * 1.45));
      const numCols = Math.max(
        1,
        Math.floor((safeContainerWidth + gap) / (targetColWidth + gap))
      );
      const totalGaps = (numCols - 1) * gap;
      const baseColWidth = Math.max(48, Math.floor((safeContainerWidth - totalGaps) / numCols));
      const remainder = Math.max(0, safeContainerWidth - totalGaps - baseColWidth * numCols);

      const colWidths = new Float32Array(numCols);
      const colLefts = new Float32Array(numCols);
      let xAcc = 0;
      for (let c = 0; c < numCols; c++) {
        const w = c < remainder ? baseColWidth + 1 : baseColWidth;
        colWidths[c] = w;
        colLefts[c] = xAcc;
        xAcc += w + gap;
      }

      const thumbH = baseColWidth;
      const cHeight = thumbH + LABEL_HEIGHT;
      const totalRows = Math.ceil(n / numCols);

      const unitStart = new Int32Array(totalRows);
      const unitCardCount = new Int32Array(totalRows);
      const unitTop = new Float32Array(totalRows);
      const unitSize = new Float32Array(totalRows);

      let yCursor = 0;
      for (let r = 0; r < totalRows; r++) {
        const isLast = r === totalRows - 1;
        const uSize = isLast ? cHeight : cHeight + ROW_GAP;
        const startI = r * numCols;
        const endI = Math.min(n, startI + numCols);
        const rowLen = endI - startI;

        unitStart[r] = startI;
        unitCardCount[r] = rowLen;
        unitTop[r] = yCursor;
        unitSize[r] = uSize;

        for (let i = startI; i < endI; i++) {
          const c = i - startI;
          cardLeft[i] = colLefts[c];
          cardTop[i] = yCursor;
          cardWidth[i] = colWidths[c];
          cardHeight[i] = cHeight;
          cardThumbHeight[i] = thumbH;
        }
        yCursor += uSize;
      }

      return {
        count: n,
        unitCount: totalRows,
        totalHeight: yCursor,
        cardLeft,
        cardTop,
        cardWidth,
        cardHeight,
        cardThumbHeight,
        unitStart,
        unitCardCount,
        unitTop,
        unitSize,
        waterfallBands: null,
        idToIndexRef: { map: null },
      };
    }

    if (layoutMode === "waterfall") {
      // ================= 3. WATERFALL / MASONRY VIEW =================
      const targetColWidth = Math.max(100, Math.round(safeTargetHeight * 1.55));
      const numCols = Math.max(
        1,
        Math.floor((safeContainerWidth + gap) / (targetColWidth + gap))
      );
      const totalGaps = (numCols - 1) * gap;
      const baseColWidth = Math.max(48, Math.floor((safeContainerWidth - totalGaps) / numCols));
      const remainder = Math.max(0, safeContainerWidth - totalGaps - baseColWidth * numCols);

      const colWidths = new Float32Array(numCols);
      const colLefts = new Float32Array(numCols);
      let xAcc = 0;
      for (let c = 0; c < numCols; c++) {
        const w = c < remainder ? baseColWidth + 1 : baseColWidth;
        colWidths[c] = w;
        colLefts[c] = xAcc;
        xAcc += w + gap;
      }

      const colHeights = new Float32Array(numCols);
      const waterfallBands: number[][] = [];

      for (let i = 0; i < n; i++) {
        let minCol = 0;
        let minH = colHeights[0];
        for (let c = 1; c < numCols; c++) {
          if (colHeights[c] < minH) {
            minH = colHeights[c];
            minCol = c;
          }
        }

        const colW = colWidths[minCol];
        const ratio = getItemRatio(items[i]);
        const thumbH = Math.max(48, Math.round(colW / ratio));
        const cHeight = thumbH + LABEL_HEIGHT;
        const top = minH;

        cardLeft[i] = colLefts[minCol];
        cardTop[i] = top;
        cardWidth[i] = colW;
        cardHeight[i] = cHeight;
        cardThumbHeight[i] = thumbH;

        const startBand = Math.max(0, Math.floor(top / WATERFALL_BAND_HEIGHT));
        const endBand = Math.max(startBand, Math.floor((top + cHeight) / WATERFALL_BAND_HEIGHT));
        for (let b = startBand; b <= endBand; b++) {
          let band = waterfallBands[b];
          if (!band) {
            band = [];
            waterfallBands[b] = band;
          }
          band.push(i);
        }

        colHeights[minCol] = top + cHeight + ROW_GAP;
      }

      let maxColH = 0;
      for (let c = 0; c < numCols; c++) {
        if (colHeights[c] > maxColH) maxColH = colHeights[c];
      }
      const totalHeight = maxColH > 0 ? maxColH - ROW_GAP : 0;
      const totalBands = Math.max(1, Math.ceil(totalHeight / WATERFALL_BAND_HEIGHT));

      const unitStart = new Int32Array(totalBands);
      const unitCardCount = new Int32Array(totalBands);
      const unitTop = new Float32Array(totalBands);
      const unitSize = new Float32Array(totalBands);

      for (let b = 0; b < totalBands; b++) {
        const top = b * WATERFALL_BAND_HEIGHT;
        const isLast = b === totalBands - 1;
        const uSize = isLast ? Math.max(1, totalHeight - top) : WATERFALL_BAND_HEIGHT;
        unitTop[b] = top;
        unitSize[b] = uSize;
      }

      return {
        count: n,
        unitCount: totalBands,
        totalHeight,
        cardLeft,
        cardTop,
        cardWidth,
        cardHeight,
        cardThumbHeight,
        unitStart,
        unitCardCount,
        unitTop,
        unitSize,
        waterfallBands,
        idToIndexRef: { map: null },
      };
    }

    // ================= 4. JUSTIFIED VIEW =================
    // Single-pass TypedArray row builder without intermediate per-item objects
    const itemRatios = new Float32Array(n);
    const unitStartTemp = new Int32Array(n);
    const unitCountTemp = new Int32Array(n);
    const unitTopTemp = new Float32Array(n);
    const unitSizeTemp = new Float32Array(n);

    const maxRowHeightCap = Math.round(safeTargetHeight * 1.35);
    let rowStartIdx = 0;
    let currentRatiosSum = 0;
    let uCount = 0;
    let yCursor = 0;

    const commitJustifiedRow = (
      startIdx: number,
      rowLen: number,
      availableWidth: number,
      projectedHeight: number,
      fillWidth: boolean,
      isLastRow: boolean
    ) => {
      const finalThumbHeight = fillWidth
        ? Math.max(40, Math.min(maxRowHeightCap, Math.round(projectedHeight)))
        : safeTargetHeight;

      let currentTotal = 0;
      for (let c = 0; c < rowLen; c++) {
        const idx = startIdx + c;
        const w = fillWidth
          ? Math.max(1, Math.floor(finalThumbHeight * itemRatios[idx]))
          : Math.min(
              availableWidth,
              Math.max(1, Math.round(finalThumbHeight * itemRatios[idx]))
            );
        cardWidth[idx] = w;
        currentTotal += w;
      }

      if (fillWidth && rowLen > 0) {
        const diff = availableWidth - currentTotal;
        if (diff > 0 && projectedHeight <= maxRowHeightCap) {
          for (let k = 0; k < diff; k++) {
            cardWidth[startIdx + (k % rowLen)] += 1;
          }
        } else if (diff < 0) {
          let excess = -diff;
          let guard = 0;
          while (excess > 0 && guard < rowLen * 4) {
            const targetIdx = startIdx + (guard % rowLen);
            if (cardWidth[targetIdx] > 24) {
              cardWidth[targetIdx] -= 1;
              excess -= 1;
            }
            guard++;
          }
        }
      }

      const cHeight = finalThumbHeight + LABEL_HEIGHT;
      const uSize = isLastRow ? cHeight : cHeight + ROW_GAP;
      let xCursor = 0;
      for (let c = 0; c < rowLen; c++) {
        const idx = startIdx + c;
        cardLeft[idx] = xCursor;
        cardTop[idx] = yCursor;
        cardHeight[idx] = cHeight;
        cardThumbHeight[idx] = finalThumbHeight;
        xCursor += cardWidth[idx] + gap;
      }

      unitStartTemp[uCount] = startIdx;
      unitCountTemp[uCount] = rowLen;
      unitTopTemp[uCount] = yCursor;
      unitSizeTemp[uCount] = uSize;
      uCount++;
      yCursor += uSize;
    };

    for (let i = 0; i < n; i++) {
      const ratio = getItemRatio(items[i]);
      itemRatios[i] = ratio;
      currentRatiosSum += ratio;

      const rowLen = i - rowStartIdx + 1;
      const gapsTotal = (rowLen - 1) * gap;
      const availableWidth = Math.max(100, safeContainerWidth - gapsTotal);
      const projectedHeight = availableWidth / currentRatiosSum;

      if (projectedHeight <= safeTargetHeight * 1.25) {
        commitJustifiedRow(
          rowStartIdx,
          rowLen,
          availableWidth,
          projectedHeight,
          true,
          i === n - 1
        );
        rowStartIdx = i + 1;
        currentRatiosSum = 0;
      }
    }

    if (rowStartIdx < n) {
      const rowLen = n - rowStartIdx;
      const gapsTotal = (rowLen - 1) * gap;
      const availableWidth = Math.max(100, safeContainerWidth - gapsTotal);
      const projectedHeight = availableWidth / currentRatiosSum;
      const shouldFill = projectedHeight <= safeTargetHeight * 1.35;
      commitJustifiedRow(
        rowStartIdx,
        rowLen,
        availableWidth,
        projectedHeight,
        shouldFill,
        true
      );
    }

    const layoutDur = performance.now() - tLayout0;
    if (layoutDur >= 12) {
      logDiagnostic(
        "perf",
        "perf",
        "Gallery TypedArray layout computed",
        `mode=${layoutMode} items=${n} units=${uCount} width=${safeContainerWidth}`,
        Math.round(layoutDur)
      );
    }

    return {
      count: n,
      unitCount: uCount,
      totalHeight: yCursor,
      cardLeft,
      cardTop,
      cardWidth,
      cardHeight,
      cardThumbHeight,
      unitStart: unitStartTemp.subarray(0, uCount),
      unitCardCount: unitCountTemp.subarray(0, uCount),
      unitTop: unitTopTemp.subarray(0, uCount),
      unitSize: unitSizeTemp.subarray(0, uCount),
      waterfallBands: null,
      idToIndexRef: { map: null },
    };
  }, [items, containerWidth, targetRowHeight, gap, layoutMode]);

  // Lazy O(1) lookup from item ID to flat index (only built on demand when user clicks/navigates)
  const getFlatIndexById = useCallback(
    (id: string): number => {
      if (!id || items.length === 0) return -1;
      let map = layoutData.idToIndexRef.map;
      if (!map) {
        map = new Map<string, number>();
        for (let i = 0; i < items.length; i++) {
          map.set(items[i].id, i);
        }
        layoutData.idToIndexRef.map = map;
      }
      return map.get(id) ?? -1;
    },
    [items, layoutData]
  );

  // Official @tanstack/react-virtual virtualizer:
  // Uses numeric index keys (default getItemKey) so prepending/deleting an item NEVER
  // invalidates 6,000+ keys in Virtualizer's itemSizeCache, and passes `layoutData` in
  // useMemo deps instead of calling `rowVirtualizer.measure()` in a double-render useEffect!
  const rowVirtualizer = useVirtualizer({
    count: layoutData.unitCount,
    getScrollElement: getScrollHost,
    estimateSize: useCallback(
      (index: number) => layoutData.unitSize[index] ?? 120,
      [layoutData]
    ),
    overscan: layoutMode === "list" ? 14 : 5,
    scrollMargin,
  });

  // Stable card event handlers so React.memo on ImageThumbnailCard skips re-rendering surviving cards
  const handleCardClick = useCallback(
    (e: React.MouseEvent, item: Item) => {
      e.stopPropagation();

      if (suppressClickRef.current) {
        suppressClickRef.current = false;
        return;
      }

      const currentOrder = currentOrderRef.current;
      if (e.metaKey || e.ctrlKey) {
        const exists = currentOrder.includes(item.id);
        const nextOrder = exists
          ? currentOrder.filter((id) => id !== item.id)
          : [...currentOrder, item.id];
        setLastClickedItemId(item.id);
        onSelectionChangeRef.current(nextOrder, exists ? undefined : item);
      } else if (e.shiftKey && lastClickedItemId) {
        const fromIdx = getFlatIndexById(lastClickedItemId);
        const toIdx = getFlatIndexById(item.id);
        if (fromIdx !== -1 && toIdx !== -1) {
          const step = fromIdx <= toIdx ? 1 : -1;
          const nextOrder = [...currentOrder];
          const existing = new Set(nextOrder);
          for (let i = fromIdx; step > 0 ? i <= toIdx : i >= toIdx; i += step) {
            const id = items[i].id;
            if (!existing.has(id)) {
              existing.add(id);
              nextOrder.push(id);
            }
          }
          onSelectionChangeRef.current(nextOrder, item);
        }
      } else {
        setLastClickedItemId(item.id);
        onSelectionChangeRef.current([item.id], item);
      }
    },
    [lastClickedItemId, getFlatIndexById, items]
  );

  const handleCardDoubleClick = useCallback((_e: React.MouseEvent, item: Item) => {
    onDoubleClickRef.current(item);
  }, []);

  const handleCardDragStart = useCallback((e: React.DragEvent, item: Item) => {
    onDragStartRef.current(e, item);
  }, []);

  const handleCardContextMenu = useCallback((e: React.MouseEvent, item: Item) => {
    e.preventDefault();
    e.stopPropagation();
    onItemContextMenuRef.current(e, item);
  }, []);

  // Remember the horizontal anchor X across consecutive ArrowUp / ArrowDown presses
  const verticalAnchorXRef = useRef<number | null>(null);

  useEffect(() => {
    verticalAnchorXRef.current = null;
  }, [lastClickedItemId]);

  // 2D Arrow-key navigation across all 4 layout modes (Justified, Waterfall, Grid, List)
  useEffect(() => {
    if (!keyboardNavEnabled || items.length === 0) return;

    const handleKeyDown = (e: KeyboardEvent) => {
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
      const currentIdx = activeId ? getFlatIndexById(activeId) : -1;

      let nextIdx = -1;

      if (currentIdx === -1) {
        nextIdx =
          code === "ArrowLeft" || code === "ArrowUp"
            ? items.length - 1
            : 0;
        verticalAnchorXRef.current = null;
      } else if (layoutMode === "list") {
        verticalAnchorXRef.current = null;
        const delta = code === "ArrowUp" || code === "ArrowLeft" ? -1 : 1;
        nextIdx = Math.max(0, Math.min(items.length - 1, currentIdx + delta));
      } else if (code === "ArrowLeft") {
        verticalAnchorXRef.current = null;
        nextIdx = Math.max(0, currentIdx - 1);
      } else if (code === "ArrowRight") {
        verticalAnchorXRef.current = null;
        nextIdx = Math.min(items.length - 1, currentIdx + 1);
      } else {
        // ArrowUp or ArrowDown: spatial 2D search around currentIdx
        const curCenterX = layoutData.cardLeft[currentIdx] + layoutData.cardWidth[currentIdx] * 0.5;
        const curTop = layoutData.cardTop[currentIdx];
        const curBottom = curTop + layoutData.cardHeight[currentIdx];
        const curCenterY = curTop + layoutData.cardHeight[currentIdx] * 0.5;

        const anchorX = verticalAnchorXRef.current ?? curCenterX;
        verticalAnchorXRef.current = anchorX;
        const isUp = code === "ArrowUp";

        let bestIdx = -1;
        let bestScore = Infinity;

        // Scan nearby index window (±64 items covers several rows/columns in all layouts)
        const startScan = isUp ? Math.max(0, currentIdx - 80) : currentIdx + 1;
        const endScan = isUp ? currentIdx - 1 : Math.min(items.length - 1, currentIdx + 80);

        for (let i = startScan; i <= endScan; i++) {
          const cTop = layoutData.cardTop[i];
          const cH = layoutData.cardHeight[i];
          const cCenterY = cTop + cH * 0.5;
          if (isUp ? cCenterY >= curTop - 4 : cCenterY <= curBottom + 4) {
            continue;
          }
          const cCenterX = layoutData.cardLeft[i] + layoutData.cardWidth[i] * 0.5;
          const dy = Math.abs(cCenterY - curCenterY);
          const dx = Math.abs(cCenterX - anchorX);
          const score = dy * 2.5 + dx;
          if (score < bestScore) {
            bestScore = score;
            bestIdx = i;
          }
        }

        nextIdx = bestIdx !== -1 ? bestIdx : currentIdx;
      }

      const nextItem = items[nextIdx];
      if (!nextItem) return;

      if (e.shiftKey) {
        const anchorId =
          lastClickedItemId ??
          (currentOrder.length > 0 ? currentOrder[0] : nextItem.id);
        if (!lastClickedItemId) {
          setLastClickedItemId(anchorId);
        }
        const anchorIdx = getFlatIndexById(anchorId);
        if (nextIdx !== -1 && anchorIdx !== -1) {
          const step = anchorIdx <= nextIdx ? 1 : -1;
          const rangeOrder: string[] = [];
          for (
            let i = anchorIdx;
            step > 0 ? i <= nextIdx : i >= nextIdx;
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

      // Scroll newly active card into visible viewport
      const host = getScrollHost();
      if (host && nextIdx >= 0 && nextIdx < layoutData.count) {
        const offsetTop = containerRef.current?.offsetTop || 0;
        const cardAbsTop = offsetTop + layoutData.cardTop[nextIdx];
        const cardAbsBottom = cardAbsTop + layoutData.cardHeight[nextIdx];
        const viewTop = host.scrollTop;
        const viewBottom = viewTop + host.clientHeight;
        if (cardAbsTop < viewTop) {
          host.scrollTop = Math.max(0, cardAbsTop - 16);
        } else if (cardAbsBottom > viewBottom) {
          host.scrollTop = cardAbsBottom - host.clientHeight + 32;
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [keyboardNavEnabled, items, layoutData, lastClickedItemId, layoutMode, getFlatIndexById, getScrollHost]);

  // Convert viewport client coordinates to containerRef-relative coordinates
  const clientToContainerPoint = useCallback(
    (clientX: number, clientY: number) => {
      const container = containerRef.current;
      const host = getScrollHost();
      if (!container || !host) return null;

      const hostRect = host.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();

      const clampedClientX = Math.max(hostRect.left, Math.min(hostRect.right, clientX));
      const clampedClientY = Math.max(hostRect.top, Math.min(hostRect.bottom, clientY));

      return {
        x: clampedClientX - containerRect.left,
        y: clampedClientY - containerRect.top,
      };
    },
    [getScrollHost]
  );

  const cancelLongPress = useCallback(() => {
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  const endMarquee = useCallback(() => {
    cancelLongPress();
    const host = getScrollHost();
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
  }, [cancelLongPress, getScrollHost]);

  const beginMarquee = useCallback(
    (clientX: number, clientY: number) => {
      const container = containerRef.current;
      const pt = clientToContainerPoint(clientX, clientY);
      if (!container || !pt) return;

      const box: MarqueeBox = {
        startX: pt.x,
        startY: pt.y,
        currentX: pt.x,
        currentY: pt.y,
      };

      const pointerId = activePointerIdRef.current;
      const host = getScrollHost();
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
    [clientToContainerPoint, getScrollHost]
  );

  const queueMarqueeMove = useCallback(
    (clientX: number, clientY: number, additive: boolean) => {
      pendingClientRef.current = { clientX, clientY };

      if (frameRef.current !== null) return;
      frameRef.current = requestAnimationFrame(() => {
        frameRef.current = null;
        const rawPt = pendingClientRef.current;
        const current = marqueeRef.current;
        const host = getScrollHost();
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

        const hitSet = new Set<string>();
        const {
          count,
          cardLeft,
          cardTop,
          cardWidth,
          cardHeight,
          waterfallBands,
        } = layoutData;

        if (waterfallBands) {
          const startB = Math.max(0, Math.floor(boxTop / WATERFALL_BAND_HEIGHT));
          const endB = Math.min(
            Math.max(0, waterfallBands.length - 1),
            Math.floor(boxBottom / WATERFALL_BAND_HEIGHT)
          );
          for (let b = startB; b <= endB; b++) {
            const band = waterfallBands[b];
            if (!band) continue;
            for (let k = 0; k < band.length; k++) {
              const i = band[k];
              const l = cardLeft[i];
              const t = cardTop[i];
              const r = l + cardWidth[i];
              const btm = t + cardHeight[i];
              if (!(r < boxLeft || l > boxRight || btm < boxTop || t > boxBottom)) {
                hitSet.add(items[i].id);
              }
            }
          }
        } else {
          // Binary search for first card whose bottom >= boxTop (since cardTop is monotonically non-decreasing)
          let lo = 0;
          let hi = count - 1;
          let startIdx = 0;
          while (lo <= hi) {
            const mid = (lo + hi) >>> 1;
            if (cardTop[mid] + cardHeight[mid] < boxTop) {
              lo = mid + 1;
            } else {
              startIdx = mid;
              hi = mid - 1;
            }
          }
          for (let i = startIdx; i < count; i++) {
            const t = cardTop[i];
            if (t > boxBottom) break;
            const l = cardLeft[i];
            const r = l + cardWidth[i];
            const btm = t + cardHeight[i];
            if (!(r < boxLeft || l > boxRight || btm < boxTop || t > boxBottom)) {
              hitSet.add(items[i].id);
            }
          }
        }

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
    [clientToContainerPoint, getScrollHost, layoutData, items]
  );

  // Attach pointer listeners to the scroll host so pressing ANYWHERE in the canvas triggers marquee selection
  useEffect(() => {
    const host = getScrollHost();
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
  }, [beginMarquee, queueMarqueeMove, cancelLongPress, endMarquee, getScrollHost]);

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

  const virtualItems = rowVirtualizer.getVirtualItems();

  // Extract visible card indices from the active virtual units (typically 30..120 indices)
  const visibleCardIndices = useMemo(() => {
    const out: number[] = [];
    const { waterfallBands, unitStart, unitCardCount, count } = layoutData;
    if (count === 0) return out;

    if (waterfallBands) {
      const seen = new Set<number>();
      for (let i = 0; i < virtualItems.length; i++) {
        const band = waterfallBands[virtualItems[i].index];
        if (!band) continue;
        for (let k = 0; k < band.length; k++) {
          const cardIdx = band[k];
          if (cardIdx < count && !seen.has(cardIdx)) {
            seen.add(cardIdx);
            out.push(cardIdx);
          }
        }
      }
      return out;
    }

    for (let i = 0; i < virtualItems.length; i++) {
      const uIdx = virtualItems[i].index;
      if (uIdx < 0 || uIdx >= unitStart.length) continue;
      const start = unitStart[uIdx];
      const len = unitCardCount[uIdx];
      const end = Math.min(count, start + len);
      for (let idx = start; idx < end; idx++) {
        out.push(idx);
      }
    }
    return out;
  }, [virtualItems, layoutData]);

  const totalVirtualHeight = Math.max(
    rowVirtualizer.getTotalSize(),
    layoutData.totalHeight
  );

  return (
    <div
      ref={containerRef}
      style={{
        height: `${Math.max(240, totalVirtualHeight + 24)}px`,
      }}
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
      className="relative w-full shrink-0 select-none"
    >
      {marqueeStyle && (
        <div
          data-selection-marquee="true"
          style={marqueeStyle}
          className="absolute z-40 border border-primary/70 bg-primary/15 rounded-xs pointer-events-none"
        />
      )}

      {visibleCardIndices.map((idx) => {
        const item = items[idx];
        if (!item) return null;
        return (
          <ImageThumbnailCard
            key={item.id}
            item={item}
            layoutMode={layoutMode}
            cardWidth={layoutData.cardWidth[idx]}
            cardHeight={layoutData.cardThumbHeight[idx]}
            left={layoutData.cardLeft[idx]}
            top={layoutData.cardTop[idx]}
            isSelected={selectedSet.has(item.id)}
            onClick={handleCardClick}
            onDoubleClick={handleCardDoubleClick}
            onDragStart={handleCardDragStart}
            onContextMenu={handleCardContextMenu}
          />
        );
      })}
    </div>
  );
});
