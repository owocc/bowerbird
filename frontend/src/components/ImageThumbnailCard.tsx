import React from "react";
import { default as Star } from "~icons/ri/star-line";
import type { Item } from "../../bindings/bowerbird/core/models";
import { UniversalThumbnail } from "./UniversalThumbnail";
import { formatBytes, formatDate, getFileCategory } from "@/lib/formatters";
import type { GalleryLayoutMode } from "@/lib/workspace-search";
import type { ThumbnailQuality } from "@/lib/gallery-display";

export interface ImageThumbnailCardProps {
  item: Item;
  layoutMode?: GalleryLayoutMode;
  isSelected?: boolean;
  cardWidth?: number;
  cardHeight?: number;
  left?: number;
  top?: number;
  style?: React.CSSProperties;
  onClick?: (e: React.MouseEvent, item: Item) => void;
  onDoubleClick?: (e: React.MouseEvent, item: Item) => void;
  onDragStart?: (e: React.DragEvent, item: Item) => void;
  onContextMenu?: (e: React.MouseEvent, item: Item) => void;
  thumbnailQuality?: ThumbnailQuality;
  showName?: boolean;
  showItemInfo?: boolean;
  showExtension?: boolean;
}

export const ImageThumbnailCard = React.memo(
  function ImageThumbnailCard({
    item,
    layoutMode = "justified",
    isSelected = false,
    cardWidth,
    cardHeight,
    left,
    top,
    style,
    onClick,
    onDoubleClick,
    onDragStart,
    onContextMenu,
    thumbnailQuality = "speed",
    showName = true,
    showItemInfo = true,
    showExtension = true,
  }: ImageThumbnailCardProps) {
    const baseName = item.name || item.filename || "";
    const ext = (item.extension || "").replace(/^\./, "");
    const nameWithoutExt =
      ext && baseName.toLowerCase().endsWith(`.${ext.toLowerCase()}`)
        ? baseName.slice(0, -(ext.length + 1))
        : baseName;
    const displayName = showExtension
      ? item.filename ||
        (ext && !baseName.toLowerCase().endsWith(`.${ext.toLowerCase()}`)
          ? `${baseName}.${ext}`
          : baseName)
      : nameWithoutExt;
    const fullName =
      item.filename ||
      (ext && !baseName.toLowerCase().endsWith(`.${ext.toLowerCase()}`)
        ? `${baseName}.${ext}`
        : baseName);
    const category = getFileCategory(item.extension, item.mimeType);
    const dimensionsLabel =
      item.width && item.height && item.width > 0 && item.height > 0
        ? `${item.width} × ${item.height}`
        : "";
    const infoLabel =
      category === "video" && dimensionsLabel
        ? dimensionsLabel
        : category === "image"
          ? dimensionsLabel
          : formatBytes(item.size || 0);

    const posStyle: React.CSSProperties =
      left !== undefined && top !== undefined
        ? {
            position: "absolute",
            left: `${left}px`,
            top: `${top}px`,
            width: cardWidth ? `${cardWidth}px` : undefined,
            ...style,
          }
        : {
            width: cardWidth ? `${cardWidth}px` : undefined,
            ...style,
          };

    if (layoutMode === "list") {
      const thumbSize = Math.max(28, (cardHeight || 48) - 12);
      const dimensionsLabel =
        item.width && item.height && item.width > 0 && item.height > 0
          ? `${item.width} × ${item.height}`
          : "-";
      const extLabel = (item.extension || "-").toUpperCase();
      const sizeLabel = formatBytes(item.size || 0);
      const dateLabel = formatDate(item.createdAt || item.importedAt || 0);
      const rating = item.rating || 0;

      return (
        <div
          data-asset-id={item.id}
          draggable={true}
          onDragStart={(e) => onDragStart?.(e, item)}
          onClick={(e) => onClick?.(e, item)}
          onDoubleClick={(e) => onDoubleClick?.(e, item)}
          onContextMenu={(e) => onContextMenu?.(e, item)}
          style={{
            ...posStyle,
            width: cardWidth ? `${cardWidth}px` : "100%",
            height: cardHeight ? `${cardHeight}px` : "48px",
          }}
          className={`flex items-center gap-3 px-2.5 rounded-md border transition-colors cursor-pointer select-none draggable-asset-card wails-no-drag ${
            isSelected
              ? "border-primary/80 bg-primary/12 text-foreground shadow-2xs"
              : "border-transparent hover:bg-muted/50 text-foreground"
          }`}
        >
          <div
            style={{ width: `${thumbSize}px`, height: `${thumbSize}px` }}
            className="relative rounded-xs overflow-hidden shrink-0 pointer-events-none"
          >
            <UniversalThumbnail
              item={item}
              width={thumbSize}
              height={thumbSize}
              objectFit="cover"
              draggable={false}
              showFormatBadge={false}
              thumbnailQuality={thumbnailQuality}
              className="w-full h-full"
            />
          </div>

          <div className="min-w-0 flex-1 flex items-center gap-2 pointer-events-none">
            {showName && (
              <span
                className={`text-xs truncate ${
                  isSelected ? "font-medium text-primary" : "font-normal text-foreground"
                }`}
                title={fullName}
              >
                {displayName}
              </span>
            )}
          </div>

          {rating > 0 && (
            <div className="hidden sm:flex items-center gap-0.5 shrink-0 pointer-events-none text-amber-500">
              {Array.from({ length: rating }).map((_, i) => (
                <Star key={i} className="size-3 fill-amber-500 text-amber-500" />
              ))}
            </div>
          )}

          {showItemInfo && (
            <span className="hidden md:inline-block w-24 text-right text-[11px] font-mono text-muted-foreground shrink-0 pointer-events-none">
              {dimensionsLabel || "-"}
            </span>
          )}

          {showExtension && (
            <span className="w-14 text-center text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-muted/70 text-muted-foreground shrink-0 pointer-events-none">
              {extLabel}
            </span>
          )}

          <span className="w-20 text-right text-[11px] font-mono text-muted-foreground shrink-0 pointer-events-none">
            {sizeLabel}
          </span>

          <span className="hidden lg:inline-block w-36 text-right text-[11px] font-mono text-muted-foreground shrink-0 pointer-events-none">
            {dateLabel}
          </span>
        </div>
      );
    }

    return (
      <div
        data-asset-id={item.id}
        draggable={true}
        onDragStart={(e) => onDragStart?.(e, item)}
        onClick={(e) => onClick?.(e, item)}
        onDoubleClick={(e) => onDoubleClick?.(e, item)}
        onContextMenu={(e) => onContextMenu?.(e, item)}
        style={posStyle}
        className="flex flex-col shrink-0 cursor-pointer select-none draggable-asset-card wails-no-drag"
      >
        {/* Thumbnail Container */}
        <div className="relative w-full rounded-sm overflow-hidden">
          <UniversalThumbnail
            item={item}
            height={cardHeight}
            aspectRatio={cardHeight ? undefined : "1 / 1"}
            objectFit="cover"
            draggable={false}
            showFormatBadge={showExtension}
            thumbnailQuality={thumbnailQuality}
            className={`w-full transition-colors ${
              isSelected
                ? "border-primary/80 bg-primary/10"
                : "border-border/60 bg-muted/20"
            }`}
          />
        </div>

        {(showName || showItemInfo) && (
          <div className="w-full mt-1 flex flex-col items-center justify-center pointer-events-none select-none px-0.5 gap-0.5">
            {showName && (
              <span
                className={`text-[11px] truncate max-w-full px-1.5 py-0.5 rounded-sm leading-tight text-center ${
                  isSelected
                    ? "bg-primary text-primary-foreground font-medium shadow-2xs"
                    : "text-foreground font-normal"
                }`}
                title={fullName}
              >
                {displayName}
              </span>
            )}
            {showItemInfo && infoLabel && (
              <span className="text-[10px] font-mono text-muted-foreground leading-tight truncate max-w-full">
                {infoLabel}
              </span>
            )}
          </div>
        )}
      </div>
    );
  },
  (prev, next) =>
    prev.item === next.item &&
    prev.layoutMode === next.layoutMode &&
    prev.isSelected === next.isSelected &&
    prev.cardWidth === next.cardWidth &&
    prev.cardHeight === next.cardHeight &&
    prev.left === next.left &&
    prev.top === next.top &&
    prev.style?.left === next.style?.left &&
    prev.style?.top === next.style?.top &&
    prev.thumbnailQuality === next.thumbnailQuality &&
    prev.showName === next.showName &&
    prev.showItemInfo === next.showItemInfo &&
    prev.showExtension === next.showExtension
);
