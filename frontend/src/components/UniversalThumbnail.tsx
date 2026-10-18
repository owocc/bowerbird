import React, { useState } from "react";
import {
  FileImage,
  FileVideo,
  FileAudio,
  FileText,
  FileArchive,
  FileCode,
  FileSpreadsheet,
  File,
} from "lucide-react";
import type { Item } from "../../bindings/bowerbird/core/models";
import { getFileCategory } from "@/lib/formatters";

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
  borderless?: boolean;
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
  borderless = false,
}: UniversalThumbnailProps) {
  const [imageError, setImageError] = useState(false);
  const [iconLoadError, setIconLoadError] = useState(false);
  const category = getFileCategory(item.extension, item.mimeType);
  const isImage = category === "image";

  const serverOrigin = item.originalUrl
    ? item.originalUrl.replace(/\/asset\/item\/.*$/, "")
    : item.thumbnailUrl
    ? item.thumbnailUrl.replace(/\/asset\/item\/.*$/, "")
    : "";

  const systemIconUrl =
    serverOrigin && item.extension
      ? `${serverOrigin}/asset/icon/${encodeURIComponent(item.extension)}?path=${encodeURIComponent(item.filePath || "")}`
      : "";
  const thumbnailSrc =
    item.hasThumbnail && item.thumbnailUrl
      ? item.thumbnailUrl
      : item.originalUrl;

  // Default drag handler: sets raw physical file path and RFC URI list for native OS drag interception
  const defaultDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData("application/x-bowerbird-internal-drag", "true");
    e.dataTransfer.setData("application/x-bowerbird-item-id", item.id);

    const rawPath =
      item.filePath ||
      (item.itemPath ? `${item.itemPath}/${item.filename}` : "");
    let fileUrl = item.fileUrl;
    if (!fileUrl && rawPath) {
      fileUrl = encodeURI(`file://${rawPath.startsWith("/") ? "" : "/"}${rawPath}`);
    } else if (fileUrl && fileUrl.includes(" ")) {
      fileUrl = encodeURI(fileUrl);
    }
    const mime = item.mimeType || "application/octet-stream";

    if (rawPath) {
      e.dataTransfer.setData("text/plain", rawPath);
      e.dataTransfer.setData("application/x-bowerbird-path", rawPath);
      e.dataTransfer.setData("application/x-bowerbird-paths", JSON.stringify([rawPath]));
    }
    if (fileUrl) {
      e.dataTransfer.setData("text/uri-list", fileUrl);
      e.dataTransfer.setData("DownloadURL", `${mime}:${item.filename}:${fileUrl}`);
    }
    e.dataTransfer.effectAllowed = "copyMove";
  };

  const hasVisual = !imageError && (isImage || item.hasThumbnail);
  const normalizedExt = (item.extension || "").trim().toLowerCase();
  const shouldShowFormatBadge =
    showFormatBadge &&
    Boolean(normalizedExt) &&
    normalizedExt !== "jpg" &&
    normalizedExt !== "jpeg" &&
    normalizedExt !== "png";
  return (
    <div
      draggable={draggable}
      onDragStart={onDragStart || defaultDragStart}
      style={{
        width: typeof width === "number" ? `${width}px` : width,
        height: typeof height === "number" ? `${height}px` : height,
        aspectRatio: aspectRatio,
      }}
      className={`relative rounded-sm overflow-hidden ${borderless ? "bg-transparent border-none" : "bg-muted/20 border border-border/80"} flex items-center justify-center select-none draggable-asset-card wails-no-drag ${className}`}
    >

      {hasVisual ? (
        <img
          src={thumbnailSrc}
          alt={item.name}
          loading="lazy"
          decoding="async"
          draggable={false}
          onError={() => setImageError(true)}
          style={{ objectFit }}
          className={`w-full h-full pointer-events-none ${borderless ? "object-contain" : ""}`}
        />
      ) : systemIconUrl && !iconLoadError ? (
        <div className="flex flex-col items-center justify-center p-2.5 w-full h-full pointer-events-none select-none">
          <img
            src={systemIconUrl}
            alt={item.extension || "file"}
            loading="lazy"
            decoding="async"
            draggable={false}
            onError={() => setIconLoadError(true)}
            className="size-14 object-contain pointer-events-none transition-transform group-hover:scale-105"
          />
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center gap-1.5 p-2 pointer-events-none select-none">
          <div className="relative size-12 rounded-sm flex items-center justify-center bg-card border border-border/80 shadow-xs">
            <CategoryIcon category={category} ext={item.extension} className="size-6 stroke-[1.6]" />
          </div>
          <span className="font-mono text-[9px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded-sm bg-muted/80 text-muted-foreground border border-border/40">
            {item.extension || "FILE"}
          </span>
        </div>
      )}

      {shouldShowFormatBadge && (
        <div className="absolute top-1.5 left-1.5 z-10 pointer-events-none">
          <span className="px-1.5 py-0.5 rounded-xs text-[9px] leading-none font-mono uppercase font-bold tracking-wider bg-black/75 text-white border border-white/15">
            {normalizedExt.toUpperCase()}
          </span>
        </div>
      )}
    </div>
  );
}

function CategoryIcon({
  category,
  ext,
  className,
}: {
  category: string;
  ext?: string;
  className?: string;
}) {
  const lowerExt = (ext || "").toLowerCase();
  if (["js", "ts", "jsx", "tsx", "py", "go", "rs", "c", "cpp", "h", "html", "css", "json", "sh", "sql"].includes(lowerExt)) {
    return <FileCode className={`${className} text-emerald-500`} />;
  }
  if (["csv", "xls", "xlsx", "sheet"].includes(lowerExt)) {
    return <FileSpreadsheet className={`${className} text-green-500`} />;
  }
  switch (category) {
    case "image":
      return <FileImage className={`${className} text-rose-500`} />;
    case "video":
      return <FileVideo className={`${className} text-indigo-500`} />;
    case "audio":
      return <FileAudio className={`${className} text-pink-500`} />;
    case "document":
      return <FileText className={`${className} text-sky-500`} />;
    case "archive":
      return <FileArchive className={`${className} text-amber-500`} />;
    default:
      return <File className={`${className} text-muted-foreground`} />;
  }
}
