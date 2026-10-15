import { useState, useEffect, useRef, useCallback } from "react";
import { useTranslation } from "react-i18next";
import {
  ArrowLeft,
  X,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ZoomControls } from "@/components/ZoomControls";
import type { Item } from "../../bindings/bowerbird/core/models";
import { MainHeaderSafePrefix } from "@/components/MainHeaderSafePrefix";
import {
  previewRegistry,
  type PreviewZoomController,
} from "@/plugins/preview/registry";

export interface UnifiedPreviewModalProps {
  open: boolean;
  mode: "inline" | "full-window";
  activeItem: Item | null;
  items: Item[];
  onClose: () => void;
  onIndexChange?: (item: Item) => void;
  sidebarOpen?: boolean;
  onToggleSidebar?: () => void;
}

/**
 * Unified Preview Host powered by PreviewPluginRegistry.
 * Supports:
 * 1. Double-click inline preview in main column
 * 2. Space key full-window QuickLook modal
 * Delegates actual rendering & zoom/pan/media controls to the resolved PreviewPlugin.
 */
export function UnifiedPreviewModal({
  open,
  mode,
  activeItem,
  items,
  onClose,
  onIndexChange,
  sidebarOpen = true,
  onToggleSidebar,
}: UnifiedPreviewModalProps) {
  const { t } = useTranslation();
  const controllerRef = useRef<PreviewZoomController | null>(null);
  const [scale, setScale] = useState<number>(1);

  const activeId = activeItem?.id;
  const currentIndex = activeId ? items.findIndex((i) => i.id === activeId) : -1;

  // Switch to previous item in the current filtered list
  const handlePrev = useCallback(() => {
    if (currentIndex > 0) {
      onIndexChange?.(items[currentIndex - 1]);
    } else if (items.length > 1) {
      onIndexChange?.(items[items.length - 1]);
    }
  }, [currentIndex, items, onIndexChange]);

  // Switch to next item in the current filtered list
  const handleNext = useCallback(() => {
    if (currentIndex < items.length - 1) {
      onIndexChange?.(items[currentIndex + 1]);
    } else if (items.length > 1) {
      onIndexChange?.(items[0]);
    }
  }, [currentIndex, items, onIndexChange]);

  // Reset scale when item changes
  useEffect(() => {
    if (!open) return;
    setScale(1);
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
        controllerRef.current?.zoomToFit();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, handlePrev, handleNext, onClose]);

  const handleManualScaleChange = useCallback((newScale: number) => {
    if (controllerRef.current) {
      controllerRef.current.setScale(newScale);
    } else {
      setScale(newScale);
    }
  }, []);

  const handleActualSize = useCallback(() => {
    controllerRef.current?.actualSize();
  }, []);

  const handleZoomToFit = useCallback(() => {
    controllerRef.current?.zoomToFit();
  }, []);

  if (!open || !activeItem) {
    return null;
  }

  const plugin = previewRegistry.resolve(activeItem);
  const PluginViewport = plugin.Viewport;
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
      {isInline ? (
        <header className="h-(--titlebar-height) border-b-0 px-3 flex items-center justify-between gap-4 shrink-0 bg-background/95 z-20 wails-no-drag">
          <MainHeaderSafePrefix
            sidebarOpen={sidebarOpen}
            onToggleSidebar={onToggleSidebar}
          >
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={onClose}
              className="size-7 rounded-lg text-muted-foreground hover:text-foreground shrink-0 wails-no-drag"
              title={t("preview.backTooltip")}
            >
              <ArrowLeft className="size-4" />
            </Button>

            {items.length > 1 && (
              <div className="flex items-center gap-1 pl-1.5 border-l border-border/60 header-interactive-container wails-no-drag">
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={handlePrev}
                  title={t("preview.previousTooltip")}
                  className="size-6 text-muted-foreground hover:text-foreground rounded wails-no-drag"
                >
                  <ChevronLeft className="size-3.5" />
                </Button>

                <span className="text-[11px] text-muted-foreground font-mono min-w-10 text-center select-none">
                  {currentIndex >= 0 ? currentIndex + 1 : 1} / {items.length}
                </span>

                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={handleNext}
                  title={t("preview.nextTooltip")}
                  className="size-6 text-muted-foreground hover:text-foreground rounded wails-no-drag"
                >
                  <ChevronRight className="size-3.5" />
                </Button>
              </div>
            )}
          </MainHeaderSafePrefix>

          <div className="flex-1 h-full min-w-4 wails-drag" />

          {plugin.supportsZoom && (
            <ZoomControls
              scale={scale}
              onScaleChange={handleManualScaleChange}
              onActualSize={handleActualSize}
              onZoomToFit={handleZoomToFit}
              className="max-w-xs justify-center header-interactive-container wails-no-drag"
            />
          )}

          <div className="flex-1 h-full min-w-4 wails-drag" />

          <div className="flex items-center header-interactive-container wails-no-drag">
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={onClose}
              title={t("preview.closePreviewTooltip")}
              className="size-7 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted wails-no-drag"
            >
              <X className="size-3.5" />
            </Button>
          </div>
        </header>
      ) : (
        <div className="absolute top-4 right-4 z-40 header-interactive-container wails-no-drag">
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={onClose}
            title={t("preview.exitFullscreenTooltip")}
            className="size-8 rounded-full bg-background/70 hover:bg-background text-foreground border border-border/60 shadow-lg backdrop-blur-md wails-no-drag"
          >
            <X className="size-4" />
          </Button>
        </div>
      )}

      <div className="flex-1 w-full h-full relative overflow-hidden flex items-center justify-center">
        <PluginViewport
          item={activeItem}
          mode={mode}
          scale={scale}
          onScaleChange={setScale}
          controllerRef={controllerRef}
        />
      </div>

      {!isInline && items.length > 1 && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-1.5 bg-background/85 hover:bg-background/95 backdrop-blur-md px-3 py-1 rounded-full border border-border/80 shadow-2xl transition-all header-interactive-container wails-no-drag">
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={handlePrev}
            title={t("preview.previousTooltip")}
            className="size-7 rounded-full text-foreground hover:bg-muted"
          >
            <ChevronLeft className="size-4" />
          </Button>

          <span className="text-xs font-mono font-medium text-foreground px-2 min-w-14 text-center select-none">
            {currentIndex >= 0 ? currentIndex + 1 : 1} / {items.length}
          </span>

          <Button
            variant="ghost"
            size="icon-xs"
            onClick={handleNext}
            title={t("preview.nextTooltip")}
            className="size-7 rounded-full text-foreground hover:bg-muted"
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
