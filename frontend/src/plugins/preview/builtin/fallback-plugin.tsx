import { useState, useEffect } from "react";
import { default as FileImage } from "~icons/ri/file-image-line";
import { default as FileVideo } from "~icons/ri/file-video-line";
import { default as FileAudio } from "~icons/ri/file-music-line";
import { default as FileText } from "~icons/ri/file-text-line";
import { default as FileArchive } from "~icons/ri/file-zip-line";
import { default as File } from "~icons/ri/file-line";
import { useTranslation } from "react-i18next";
import { UniversalThumbnail } from "@/components/UniversalThumbnail";
import { getFileCategory, formatBytes } from "@/lib/formatters";
import type {
  PreviewPlugin,
  PreviewViewportProps,
  PreviewInspectorProps,
} from "../types";

function FallbackViewport({ item }: PreviewViewportProps) {
  const { t } = useTranslation();
  const [iconLoadError, setIconLoadError] = useState(false);

  useEffect(() => {
    setIconLoadError(false);
  }, [item.id]);

  const category = getFileCategory(item.extension, item.mimeType);
  const serverOrigin = item.originalUrl
    ? item.originalUrl.replace(/\/asset\/item\/.*$/, "")
    : item.thumbnailUrl
    ? item.thumbnailUrl.replace(/\/asset\/item\/.*$/, "")
    : "";
  const systemIconUrl =
    serverOrigin && item.extension
      ? `${serverOrigin}/asset/icon/${encodeURIComponent(item.extension)}?path=${encodeURIComponent(item.filePath || "")}`
      : "";

  return (
    <div className="w-full h-full flex items-center justify-center p-6">
      <div className="p-8 flex flex-col items-center gap-4 text-muted-foreground select-none max-w-sm">
        {systemIconUrl && !iconLoadError ? (
          <img
            src={systemIconUrl}
            alt={item.extension || t("preview.fileAlt")}
            draggable={false}
            onError={() => setIconLoadError(true)}
            className="size-32 object-contain pointer-events-none drop-shadow-lg"
          />
        ) : (
          <div className="relative size-24 rounded-2xl flex items-center justify-center bg-muted/40">
            <PreviewCategoryIcon
              category={category}
              className="size-12 stroke-[1.5] text-foreground/80"
            />
          </div>
        )}
        <div className="text-center space-y-1">
          <p
            className="text-sm text-foreground font-semibold truncate max-w-xs"
            title={item.filename || item.name}
          >
            {item.filename || item.name}
          </p>
          <p className="text-[11px] text-muted-foreground font-mono">
            {formatBytes(item.size)}
          </p>
        </div>
      </div>
    </div>
  );
}

function FallbackInspectorPreview({
  item,
  onOpenPreview,
  onDragStart,
}: PreviewInspectorProps) {
  return (
    <div
      onDoubleClick={onOpenPreview}
      className="w-full flex items-center justify-center py-2 cursor-pointer select-none"
    >
      <UniversalThumbnail
        item={item}
        draggable={true}
        onDragStart={onDragStart}
        objectFit="contain"
        borderless={true}
        className="max-h-44 w-auto max-w-full cursor-grab active:cursor-grabbing"
      />
    </div>
  );
}

function PreviewCategoryIcon({
  category,
  className,
}: {
  category: string;
  className?: string;
}) {
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

export const FallbackPreviewPlugin: PreviewPlugin = {
  id: "builtin.fallback",
  name: "System File Icon Fallback",
  version: "1.0.0",
  author: "Bowerbird",
  builtin: true,
  canDisable: false,
  internal: true,
  priority: 0,
  match: () => true,
  supportsZoom: false,
  Viewport: FallbackViewport,
  InspectorPreview: FallbackInspectorPreview,
};
