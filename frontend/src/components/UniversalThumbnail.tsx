import React, { useState } from "react";
import {
  FileImage,
  FileVideo,
  FileAudio,
  FileText,
  FileArchive,
  File,
} from "lucide-react";
import type { Item } from "../../bindings/bowerbird/core/models";
import { getFileCategory, escapePathForShell } from "@/lib/formatters";

export interface UniversalThumbnailProps {
  item: Item;
  width?: number | string;
  height?: number | string;
  aspectRatio?: string;
  objectFit?: "cover" | "contain";
  className?: string;
  draggable?: boolean;
  onDragStart?: (e: React.DragEvent) => void;
  showFormatBadge?: boolean;
}

/**
 * Universal asset thumbnail component used across:
 * 1. Asset cards in the main gallery
 * 2. Single item detail inspector
 * 3. Multi-selection stacked preview in inspector
 * Strictly supports native OS / HTML5 drag-and-drop.
 */
export function UniversalThumbnail({
  item,
  width,
  height,
  aspectRatio,
  objectFit = "cover",
  className = "",
  draggable = true,
  onDragStart,
  showFormatBadge = false,
}: UniversalThumbnailProps) {
  const [imageError, setImageError] = useState(false);
  const category = getFileCategory(item.extension);
  const isImage = category === "image";

  const thumbnailSrc =
    item.hasThumbnail && item.thumbnailUrl
      ? item.thumbnailUrl
      : item.originalUrl;

  // Default drag handler if none provided: sets standard OS and internal drag payloads
  const defaultDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData("application/x-bowerbird-internal-drag", "true");
    e.dataTransfer.setData("application/x-bowerbird-item-id", item.id);

    const rawPath =
      item.filePath ||
      (item.itemPath ? `${item.itemPath}/${item.filename}` : "");
    const shellPath = item.shellPath || escapePathForShell(rawPath);
    let fileUrl = item.fileUrl;
    if (!fileUrl && rawPath) {
      fileUrl = encodeURI(`file://${rawPath.startsWith("/") ? "" : "/"}${rawPath}`);
    } else if (fileUrl && fileUrl.includes(" ")) {
      fileUrl = encodeURI(fileUrl);
    }
    const mime = item.mimeType || "application/octet-stream";

    e.dataTransfer.setData("text/plain", shellPath);
    if (fileUrl) {
      e.dataTransfer.setData("text/uri-list", fileUrl);
      e.dataTransfer.setData("DownloadURL", `${mime}:${item.filename}:${fileUrl}`);
    }
    e.dataTransfer.setData("application/x-bowerbird-path", rawPath);
    e.dataTransfer.effectAllowed = "copyMove";
  };

  const hasVisual = !imageError && (isImage || item.hasThumbnail);

  return (
    <div
      draggable={draggable}
      onDragStart={onDragStart || defaultDragStart}
      style={{
        width: typeof width === "number" ? `${width}px` : width,
        height: typeof height === "number" ? `${height}px` : height,
        aspectRatio: aspectRatio,
      }}
      className={`relative rounded-xl overflow-hidden bg-muted/20 border border-border/80 flex items-center justify-center select-none draggable-asset-card wails-no-drag ${className}`}
    >
      {/* Background pattern */}
      <div className="absolute inset-0 opacity-[0.03] bg-[radial-gradient(#000_1px,transparent_1px)] [background-size:12px_12px] dark:opacity-[0.06] dark:bg-[radial-gradient(#fff_1px,transparent_1px)] pointer-events-none" />

      {hasVisual ? (
        <img
          src={thumbnailSrc}
          alt={item.name}
          loading="lazy"
          draggable={false}
          onError={() => setImageError(true)}
          style={{ objectFit }}
          className="w-full h-full pointer-events-none drop-shadow-2xs"
        />
      ) : (
        <div className="flex flex-col items-center justify-center gap-1 text-muted-foreground p-2 pointer-events-none">
          <CategoryIcon category={category} className="size-8 stroke-[1.5]" />
          <span className="font-mono text-[9px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-muted/80">
            {item.extension || "FILE"}
          </span>
        </div>
      )}

      {showFormatBadge && (
        <div className="absolute bottom-1 right-1 pointer-events-none">
          <span className="px-1.5 py-0.5 rounded text-[9px] font-mono uppercase font-semibold bg-background/85 backdrop-blur-md text-muted-foreground border border-border/40 shadow-2xs">
            {item.extension}
          </span>
        </div>
      )}
    </div>
  );
}

function CategoryIcon({ category, className }: { category: string; className?: string }) {
  switch (category) {
    case "image":
      return <FileImage className={className} />;
    case "video":
      return <FileVideo className={className} />;
    case "audio":
      return <FileAudio className={className} />;
    case "document":
      return <FileText className={className} />;
    case "archive":
      return <FileArchive className={className} />;
    default:
      return <File className={className} />;
  }
}
