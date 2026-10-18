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
import { MacTrafficLightSpacer } from "@/components/MacTrafficLightSpacer";
import {
  previewRegistry,
  usePreviewPlugins,
  createPreviewPluginHostAPI,
  type PreviewZoomController,
} from "@/plugins/preview/registry";
import { PluginErrorBoundary } from "@/components/PluginErrorBoundary";
export interface UnifiedPreviewModalProps {
  open: boolean;
  mode: "inline" | "full-window";
  activeItem: Item | null;
  items: Item[] | { items: Item[]; version: number };
  onClose: () => void;
  onIndexChange?: (item: Item) => void;
  sidebarOpen?: boolean;
  onToggleSidebar?: () => void;
  onItemUpdated?: (updated: Item) => void;
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
  items: rawItemsProp,
  onClose,
  onIndexChange,
  sidebarOpen = true,
  onToggleSidebar,
  onItemUpdated,
}: UnifiedPreviewModalProps) {
  const items = Array.isArray(rawItemsProp) ? rawItemsProp : rawItemsProp.items;
  const { t } = useTranslation();
  usePreviewPlugins();
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
      if (e.defaultPrevented) return;
      const target = e.target as HTMLElement | null;
      const inMediaControl = Boolean(
        target?.closest(".plyr, input, button, select, textarea, [data-video-interactive]")
      );
      if (e.code === "Escape") {
        e.preventDefault();
        onClose();
      } else if (e.code === "Space" && !inMediaControl) {
        e.preventDefault();
        onClose();
      } else if (e.code === "ArrowLeft" && !inMediaControl) {
        e.preventDefault();
        handlePrev();
      } else if (e.code === "ArrowRight" && !inMediaControl) {
        e.preventDefault();
        handleNext();
      } else if (e.key === "0" && !inMediaControl) {
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

  const hostApi = createPreviewPluginHostAPI(activeItem, onItemUpdated);
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
              size="icon-sm"
              onClick={onClose}
              title={t("preview.backTooltip")}
            >
              <ArrowLeft />
            </Button>

            {items.length > 1 && (
              <div className="flex items-center gap-1 pl-1.5 border-l border-border/60 header-interactive-container wails-no-drag">
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={handlePrev}
                  title={t("preview.previousTooltip")}
                >
                  <ChevronLeft />
                </Button>

                <span className="text-[11px] text-muted-foreground font-mono min-w-10 text-center select-none">
                  {currentIndex >= 0 ? currentIndex + 1 : 1} / {items.length}
                </span>

                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={handleNext}
                  title={t("preview.nextTooltip")}
                >
                  <ChevronRight />
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
              size="icon-sm"
              onClick={onClose}
              title={t("preview.closePreviewTooltip")}
            >
              <X />
            </Button>
          </div>
        </header>
      ) : (
        <header className="h-(--titlebar-height) px-3 flex items-center justify-between gap-4 shrink-0 bg-background/95 z-20 wails-no-drag">
          <MacTrafficLightSpacer className="w-[80px] h-(--titlebar-height) shrink-0" />

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
              size="icon"
              onClick={onClose}
              title={t("preview.exitFullscreenTooltip")}
            >
              <X />
            </Button>
          </div>
        </header>
      )}

      <div className="flex-1 min-h-0 w-full relative overflow-hidden flex items-center justify-center">
        {PluginViewport && (
          <PluginErrorBoundary pluginId={plugin.id} pluginName={plugin.name}>
            <PluginViewport
              item={activeItem}
              mode={mode}
              scale={scale}
              onScaleChange={setScale}
              controllerRef={controllerRef}
              api={hostApi}
            />
          </PluginErrorBoundary>
        )}
      </div>

      {!isInline && items.length > 1 && (
        <footer className="w-full py-2 px-4 flex items-center justify-center shrink-0 z-20 wails-no-drag">
          <div className="flex items-center gap-1.5 header-interactive-container wails-no-drag">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={handlePrev}
              title={t("preview.previousTooltip")}
            >
              <ChevronLeft />
            </Button>

            <span className="text-xs font-mono font-medium text-muted-foreground px-2 min-w-14 text-center select-none">
              {currentIndex >= 0 ? currentIndex + 1 : 1} / {items.length}
            </span>

            <Button
              variant="ghost"
              size="icon-sm"
              onClick={handleNext}
              title={t("preview.nextTooltip")}
            >
              <ChevronRight />
            </Button>
          </div>
        </footer>
      )}
    </div>
  );
}
