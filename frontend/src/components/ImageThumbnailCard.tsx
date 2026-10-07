import React from "react";
import type { Item } from "../../bindings/bowerbird/core/models";
import { UniversalThumbnail } from "./UniversalThumbnail";

export interface ImageThumbnailCardProps {
  item: Item;
  isSelected?: boolean;
  cardWidth?: number;
  cardHeight?: number;
  onClick?: (e: React.MouseEvent) => void;
  onDoubleClick?: (e: React.MouseEvent) => void;
  onDragStart?: (e: React.DragEvent) => void;
  onContextMenu?: (e: React.MouseEvent) => void;
}

export function ImageThumbnailCard({
  item,
  isSelected = false,
  cardWidth,
  cardHeight,
  onClick,
  onDoubleClick,
  onDragStart,
  onContextMenu,
}: ImageThumbnailCardProps) {
  const fullName =
    item.filename ||
    (item.extension && !item.name.toLowerCase().endsWith(`.${item.extension.toLowerCase()}`)
      ? `${item.name}.${item.extension}`
      : item.name);

  return (
    <div
      data-asset-id={item.id}
      draggable={true}
      onDragStart={onDragStart}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
      style={cardWidth ? { width: `${cardWidth}px` } : undefined}
      className="flex flex-col cursor-pointer select-none draggable-asset-card wails-no-drag"
    >
      {/* Thumbnail Container */}
      <div className="relative w-full rounded-xl overflow-hidden">
        <UniversalThumbnail
          item={item}
          height={cardHeight}
          aspectRatio={cardHeight ? undefined : "1 / 1"}
          objectFit="cover"
          draggable={false}
          showFormatBadge={false}
          className={`w-full transition-colors ${
            isSelected
              ? "border-primary/80 bg-primary/10"
              : "border-border/60 bg-muted/20"
          }`}
        />
      </div>

      {/* Full File Name (Centered with selection text background highlight) */}
      <div className="w-full mt-1.5 flex justify-center pointer-events-none select-none px-0.5">
        <span
          className={`text-[11px] truncate max-w-full px-1.5 py-0.5 rounded-md leading-tight text-center ${
            isSelected
              ? "bg-primary text-primary-foreground font-medium shadow-2xs"
              : "text-foreground font-normal"
          }`}
          title={fullName}
        >
          {fullName}
        </span>
      </div>
    </div>
  );
}
