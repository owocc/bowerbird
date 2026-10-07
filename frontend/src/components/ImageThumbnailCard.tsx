import React from "react";
import type { Item } from "../../bindings/bowerbird/core/models";
import { formatBytes } from "@/lib/formatters";
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
      {/* 
        Thumbnail Container:
        - Strictly no hover action buttons
        - Strictly no hover zoom / scaling
        - High-contrast selection outline when selected
      */}
      <div
        className={`relative w-full rounded-xl transition-all duration-100 ${
          isSelected
            ? "ring-2 ring-primary ring-offset-2 ring-offset-background shadow-sm"
            : ""
        }`}
      >
        <UniversalThumbnail
          item={item}
          height={cardHeight}
          aspectRatio={cardHeight ? undefined : "1 / 1"}
          objectFit="cover"
          draggable={false}
          showFormatBadge={true}
          className={`w-full transition-colors ${
            isSelected
              ? "border-primary bg-primary/10"
              : "border-border/80 hover:border-primary/40 bg-muted/20"
          }`}
        />

        {/* Selected badge checkmark in top-left */}
        {isSelected && (
          <div className="absolute top-1.5 left-1.5 size-4 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-xs z-10 pointer-events-none">
            <svg className="size-2.5 stroke-[3]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
        )}
      </div>
      {/* File name and format placed OUTSIDE the card container (strictly h-9 height) */}
      <div className="h-9 mt-1.5 px-0.5 flex flex-col justify-between w-full pointer-events-none select-none">
        <p
          className={`text-[11px] truncate leading-tight tracking-tight ${
            isSelected
              ? "text-primary font-semibold"
              : "text-foreground font-medium"
          }`}
          title={item.filename || item.name}
        >
          {item.name}
        </p>

        <div className="flex items-center justify-between text-[10px] text-muted-foreground font-mono leading-none">
          <span>{formatBytes(item.size)}</span>
          <span className="uppercase text-[9px]">{item.extension}</span>
        </div>
      </div>
    </div>
  );
}
