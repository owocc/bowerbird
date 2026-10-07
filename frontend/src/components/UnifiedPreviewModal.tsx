import { useState, useEffect, useRef, useCallback } from "react";
import {
  TransformWrapper,
  TransformComponent,
  MiniMap,
  type ReactZoomPanPinchRef,
} from "react-zoom-pan-pinch";
import {
  ArrowLeft,
  X,
  ChevronLeft,
  ChevronRight,
  Compass,
  FileImage,
  FileVideo,
  FileAudio,
  FileText,
  FileArchive,
  File,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ZoomControls } from "@/components/ZoomControls";
import type { Item } from "../../bindings/bowerbird/core/models";
import { getFileCategory, formatBytes } from "@/lib/formatters";

export interface UnifiedPreviewModalProps {
  open: boolean;
  mode: "inline" | "full-window";
  activeItem: Item | null;
  items: Item[];
  onClose: () => void;
  onIndexChange?: (item: Item) => void;
}

/**
 * Unified Preview Component shared by both:
 * 1. Double-click inline preview in main
 * 2. Space key full-window QuickLook modal
 * Zero feedback loops, smooth trackpad zoom, shared core viewer.
 */
export function UnifiedPreviewModal({
  open,
  mode,
  activeItem,
  items,
  onClose,
  onIndexChange,
}: UnifiedPreviewModalProps) {
  const transformRef = useRef<ReactZoomPanPinchRef>(null);
  // Default preview scale is strictly 100% (1.0)
  const [scale, setScale] = useState<number>(1);
  const [iconLoadError, setIconLoadError] = useState(false);
  // Filter to image items for slideshow pagination
  const imageItems = items.filter(
    (i) =>
      i.hasThumbnail ||
      ["png", "jpg", "jpeg", "webp", "gif", "bmp", "svg", "ico"].includes(
        i.extension.toLowerCase()
      )
  );

  const activeId = activeItem?.id;
  const currentIndex = activeId ? imageItems.findIndex((i) => i.id === activeId) : -1;

  // Switch to previous image
  const handlePrev = useCallback(() => {
    if (currentIndex > 0) {
      onIndexChange?.(imageItems[currentIndex - 1]);
    } else if (imageItems.length > 1) {
      onIndexChange?.(imageItems[imageItems.length - 1]);
    }
  }, [currentIndex, imageItems, onIndexChange]);

  // Switch to next image
  const handleNext = useCallback(() => {
    if (currentIndex < imageItems.length - 1) {
      onIndexChange?.(imageItems[currentIndex + 1]);
    } else if (imageItems.length > 1) {
      onIndexChange?.(imageItems[0]);
    }
  }, [currentIndex, imageItems, onIndexChange]);

  // Reset zoom whenever image changes
  useEffect(() => {
    if (!open) return;
    setScale(1);
    transformRef.current?.resetTransform();
    setIconLoadError(false);
  }, [activeId, open]);
  // Keyboard navigation
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === "Space" || e.code === "Escape") {
        e.preventDefault();
        onClose();
      } else if (e.code === "ArrowLeft") {
        e.preventDefault();
        handlePrev();
      } else if (e.code === "ArrowRight") {
        e.preventDefault();
        handleNext();
      } else if (e.key === "0") {
        e.preventDefault();
        transformRef.current?.resetTransform();
        setScale(1);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, handlePrev, handleNext, onClose]);

  // Transform scale updates from wheel/trackpad:
  // ONLY updates UI scale state — NEVER calls setTransform to prevent infinite flicker loops!
  const handleTransform = useCallback(
    (_ref: unknown, state: { scale: number }) => {
      setScale(state.scale);
    },
    []
  );

  // Manual zoom from Slider / Dropdown menu only
  const handleManualScaleChange = useCallback((newScale: number) => {
    setScale(newScale);
    if (transformRef.current) {
      const state = transformRef.current.state;
      transformRef.current.setTransform(state.positionX, state.positionY, newScale, 0);
    }
  }, []);

  const handleActualSize = useCallback(() => {
    if (transformRef.current) {
      const state = transformRef.current.state;
      transformRef.current.setTransform(state.positionX, state.positionY, 1.0, 150);
      setScale(1.0);
    }
  }, []);

  const handleZoomToFit = useCallback(() => {
    transformRef.current?.resetTransform();
    setScale(1.0);
  }, []);

  // ALL HOOKS CALLED UNCONDITIONALLY ABOVE
  if (!open || !activeItem) {
    return null;
  }

  const category = getFileCategory(activeItem.extension);
  const isImage = category === "image";
  const imageSrc = activeItem.originalUrl || activeItem.thumbnailUrl;
  const serverOrigin = activeItem.originalUrl
    ? activeItem.originalUrl.replace(/\/asset\/item\/.*$/, "")
    : activeItem.thumbnailUrl
    ? activeItem.thumbnailUrl.replace(/\/asset\/item\/.*$/, "")
    : "";
  const systemIconUrl =
    serverOrigin && activeItem.extension
      ? `${serverOrigin}/asset/icon/${encodeURIComponent(activeItem.extension)}?path=${encodeURIComponent(activeItem.filePath || "")}`
      : "";

  const isInline = mode === "inline";
  return (
    <div
      role="dialog"
      aria-modal="true"
      className={
        isInline
          ? "absolute inset-0 z-30 flex flex-col bg-background/98 backdrop-blur-md select-none wails-no-drag overflow-hidden"
          : "fixed inset-0 z-50 flex flex-col bg-background/95 text-foreground backdrop-blur-2xl select-none wails-no-drag animate-in fade-in duration-100 overflow-hidden"
      }
    >
      {/* 
        ========================================================================
        MODE 1: INLINE HEADER (Double-click preview inside main column)
        - Left: Return button (icon only) + Turn-page pagination (no filename, no type badge)
        - Center: ZoomControls (Slider + Dropdown)
        - Right: Close button (icon only)
        ========================================================================
      */}
      {isInline ? (
        <header className="h-12 border-b border-border/80 px-4 flex items-center justify-between gap-4 shrink-0 bg-background/90 z-20">
          {/* Left: Return button (icon only) + Turn-page pagination */}
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={onClose}
              className="size-7 rounded-lg text-muted-foreground hover:text-foreground"
              title="返回网格 (Esc / 双击)"
            >
              <ArrowLeft className="size-4" />
            </Button>

            {/* Pagination right next to back button */}
            {imageItems.length > 1 && (
              <div className="flex items-center gap-1 pl-1.5 border-l border-border/60">
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={handlePrev}
                  title="上一张 (←)"
                  className="size-6 text-muted-foreground hover:text-foreground rounded"
                >
                  <ChevronLeft className="size-3.5" />
                </Button>

                <span className="text-[11px] text-muted-foreground font-mono min-w-10 text-center select-none">
                  {currentIndex >= 0 ? currentIndex + 1 : 1} / {imageItems.length}
                </span>

                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={handleNext}
                  title="下一张 (→)"
                  className="size-6 text-muted-foreground hover:text-foreground rounded"
                >
                  <ChevronRight className="size-3.5" />
                </Button>
              </div>
            )}
          </div>

          {/* Center: ZoomControls slider & dropdown */}
          <ZoomControls
            scale={scale}
            onScaleChange={handleManualScaleChange}
            onActualSize={handleActualSize}
            onZoomToFit={handleZoomToFit}
            className="max-w-xs flex-1 justify-center"
          />

          {/* Right: Close button */}
          <div className="flex items-center">
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={onClose}
              title="关闭预览 (Esc)"
              className="size-7 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted"
            >
              <X className="size-3.5" />
            </Button>
          </div>
        </header>
      ) : (
        /* 
          ========================================================================
          MODE 2: FULL-WINDOW POPUP (Space key preview)
          - NO header!
          - Top-right floating close button (icon only)
          ========================================================================
        */
        <div className="absolute top-4 right-4 z-40">
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={onClose}
            title="退出全屏预览 (空格 / Esc)"
            className="size-8 rounded-full bg-background/70 hover:bg-background text-foreground border border-border/60 shadow-lg backdrop-blur-md"
          >
            <X className="size-4" />
          </Button>
        </div>
      )}

      {/* 
        ========================================================================
        SHARED CENTERED IMAGE VIEWPORT:
        Strictly centered, gentle wheel zoom (step 0.02), minimap when scale > 125%
        ========================================================================
      */}
      <div className="flex-1 w-full h-full relative overflow-hidden flex items-center justify-center">
        {/* Subtle checkerboard pattern for transparent PNG / SVG / WebP */}
        <div className="absolute inset-0 opacity-[0.03] bg-[radial-gradient(#000_1px,transparent_1px)] [background-size:16px_16px] dark:opacity-[0.08] dark:bg-[radial-gradient(#fff_1px,transparent_1px)] pointer-events-none" />

        <TransformWrapper
          ref={transformRef}
          initialScale={1}
          minScale={0.05}
          maxScale={8}
          centerOnInit={true}
          centerZoomedOut={true}
          // Gentle wheel step (0.02) to prevent trackpad sudden zoom jumps
          wheel={{
            step: 0.02,
            wheelDisabled: false,
            touchPadDisabled: false,
          }}
          pinch={{
            step: 0.5,
            disabled: false,
          }}
          panning={{ disabled: false, velocityDisabled: false }}
          doubleClick={{ disabled: false, step: 0.5 }}
          onTransform={handleTransform}
        >
          <TransformComponent
            wrapperClass="!w-full !h-full flex items-center justify-center cursor-grab active:cursor-grabbing"
            contentClass="!w-full !h-full flex items-center justify-center"
          >
            <div className="w-full h-full flex items-center justify-center p-4">
              {isImage || activeItem.hasThumbnail ? (
                <img
                  src={imageSrc}
                  alt={activeItem.name}
                  draggable={false}
                  style={{
                    maxWidth: "calc(100% - 2rem)",
                    maxHeight: "calc(100% - 2rem)",
                  }}
                  className="object-contain drop-shadow-xl select-none"
                />
              ) : (
                <div className="p-10 rounded-3xl border border-border/80 bg-card/90 flex flex-col items-center gap-4 text-muted-foreground shadow-xl select-none max-w-sm">
                  {systemIconUrl && !iconLoadError ? (
                    <img
                      src={systemIconUrl}
                      alt={activeItem.extension || "file"}
                      draggable={false}
                      onError={() => setIconLoadError(true)}
                      className="size-32 object-contain pointer-events-none drop-shadow-lg"
                    />
                  ) : (
                    <div className="relative size-24 rounded-2xl flex items-center justify-center bg-muted/60 border border-border/80 shadow-xs">
                      <PreviewCategoryIcon category={category} className="size-12 stroke-[1.5] text-foreground/80" />
                    </div>
                  )}
                  <div className="text-center space-y-1">
                    <p className="text-sm text-foreground font-semibold truncate max-w-xs" title={activeItem.filename || activeItem.name}>
                      {activeItem.filename || activeItem.name}
                    </p>
                    <p className="text-[11px] text-muted-foreground font-mono">
                      {formatBytes(activeItem.size)}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </TransformComponent>

          {/* 
            ====================================================================
            MINIMAP: "缩放大于125%出现", allows visual pan navigation
            ====================================================================
          */}
          {scale > 1.25 && (
            <div className="absolute bottom-6 right-6 z-20 rounded-xl overflow-hidden shadow-2xl border border-border/80 bg-background/90 backdrop-blur-md p-1.5 transition-all animate-in fade-in zoom-in-95 duration-150">
              <div className="flex items-center justify-between px-1 pb-1 text-[9px] font-mono text-muted-foreground font-semibold">
                <span className="flex items-center gap-1">
                  <Compass className="size-2.5 text-primary" />
                  <span>鹰眼导航</span>
                </span>
                <span>{Math.round(scale * 100)}%</span>
              </div>
              <div className="rounded-lg overflow-hidden border border-border/60 bg-muted/40 relative">
                <MiniMap
                  width={150}
                  height={100}
                  borderColor="var(--primary)"
                  previewStyle={{
                    backgroundColor: "oklch(var(--primary) / 0.15)",
                    border: "2px solid var(--primary)",
                    borderRadius: "4px",
                  }}
                >
                  <img
                    src={imageSrc}
                    alt={activeItem.name}
                    className="w-full h-full object-contain pointer-events-none select-none"
                  />
                </MiniMap>
              </div>
            </div>
          )}
        </TransformWrapper>
      </div>

      {/* 
        ========================================================================
        MODE 2: SLIDESHOW NAVIGATION CAPSULE (Floating bottom center in full-window)
        ========================================================================
      */}
      {!isInline && imageItems.length > 1 && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-1.5 bg-background/85 hover:bg-background/95 backdrop-blur-md px-3 py-1 rounded-full border border-border/80 shadow-2xl transition-all">
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={handlePrev}
            title="上一张 (←)"
            className="size-7 rounded-full text-foreground hover:bg-muted"
          >
            <ChevronLeft className="size-4" />
          </Button>

          <span className="text-xs font-mono font-medium text-foreground px-2 min-w-14 text-center select-none">
            {currentIndex >= 0 ? currentIndex + 1 : 1} / {imageItems.length}
          </span>

          <Button
            variant="ghost"
            size="icon-xs"
            onClick={handleNext}
            title="下一张 (→)"
            className="size-7 rounded-full text-foreground hover:bg-muted"
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
      )}
    </div>
  );
}

function PreviewCategoryIcon({ category, className }: { category: string; className?: string }) {
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
