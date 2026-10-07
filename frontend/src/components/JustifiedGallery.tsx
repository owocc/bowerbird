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

  // Marquee mouse drag handling
  const handleMouseDown = (e: React.MouseEvent) => {
    // Left click only
    if (e.button !== 0) return;

    // If click was on an asset card or button, let card handler deal with it
    const target = e.target as HTMLElement;
    if (target.closest("[data-asset-id]") || target.closest("button") || target.closest("input")) {
      return;
    }

    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const startX = e.clientX - rect.left;
    const startY = e.clientY - rect.top;

    // Clear selection on empty canvas click if no modifier key held
    if (!e.shiftKey && !e.metaKey && !e.ctrlKey) {
      onSelectionChange(new Set());
      setLastClickedItemId(null);
    }

    setMarquee({
      startX,
      startY,
      currentX: startX,
      currentY: startY,
      startClientX: e.clientX,
      startClientY: e.clientY,
      currentClientX: e.clientX,
      currentClientY: e.clientY,
    });
  };

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!marquee || !containerRef.current) return;

      const rect = containerRef.current.getBoundingClientRect();
      const currentX = e.clientX - rect.left;
      const currentY = e.clientY - rect.top;

      setMarquee((prev) =>
        prev
          ? {
              ...prev,
              currentX,
              currentY,
              currentClientX: e.clientX,
              currentClientY: e.clientY,
            }
          : null
      );

      // Compute client coordinates bounding box of marquee selection
      const boxLeft = Math.min(marquee.startClientX, e.clientX);
      const boxRight = Math.max(marquee.startClientX, e.clientX);
      const boxTop = Math.min(marquee.startClientY, e.clientY);
      const boxBottom = Math.max(marquee.startClientY, e.clientY);

      // Only perform intersection if drag has moved more than 4px
      if (Math.abs(boxRight - boxLeft) < 4 && Math.abs(boxBottom - boxTop) < 4) {
        return;
      }

      const cardElements = containerRef.current.querySelectorAll<HTMLElement>("[data-asset-id]");
      const intersectedIds = new Set<string>(
        e.shiftKey || e.metaKey || e.ctrlKey ? selectedItemIds : []
      );

      cardElements.forEach((el) => {
        const id = el.dataset.assetId;
        if (!id) return;
        const cardRect = el.getBoundingClientRect();

        // Standard 2D Axis-Aligned Bounding Box (AABB) intersection check
        const intersects = !(
          cardRect.right < boxLeft ||
          cardRect.left > boxRight ||
          cardRect.bottom < boxTop ||
          cardRect.top > boxBottom
        );

        if (intersects) {
          intersectedIds.add(id);
        }
      });

      onSelectionChange(intersectedIds);
    },
    [marquee, selectedItemIds, onSelectionChange]
  );

  const handleMouseUp = useCallback(() => {
    if (marquee) {
      setMarquee(null);
    }
  }, [marquee]);

  // Global window listeners for drag move & release
  useEffect(() => {
    if (!marquee) return;

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [marquee, handleMouseMove, handleMouseUp]);

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
      onMouseDown={handleMouseDown}
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
          style={marqueeStyle}
          className="absolute z-40 border border-primary/90 bg-primary/15 rounded-md pointer-events-none shadow-xs"
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
