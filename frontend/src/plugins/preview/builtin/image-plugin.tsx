import { useEffect, useRef, useCallback } from "react";
import {
  TransformWrapper,
  TransformComponent,
  MiniMap,
  type ReactZoomPanPinchRef,
} from "react-zoom-pan-pinch";
import { UniversalThumbnail } from "@/components/UniversalThumbnail";
import type {
  PreviewPlugin,
  PreviewViewportProps,
  PreviewInspectorProps,
} from "../types";

const IMAGE_EXTENSIONS = [
  "png",
  "jpg",
  "jpeg",
  "webp",
  "gif",
  "bmp",
  "svg",
  "ico",
  "tiff",
  "tif",
  "avif",
];

// Minimum 25% scale prevents accidentally shrinking the image into an unusable speck
export const MIN_PREVIEW_SCALE = 0.25;
export const MAX_PREVIEW_SCALE = 8.0;

function ImageViewport({
  item,
  scale,
  onScaleChange,
  controllerRef,
}: PreviewViewportProps) {
  const transformRef = useRef<ReactZoomPanPinchRef>(null);
  const viewportHostRef = useRef<HTMLDivElement>(null);
  const imageSrc = item.originalUrl || item.thumbnailUrl;

  // Bind imperative controller for ZoomControls (slider, 100%, fit)
  useEffect(() => {
    controllerRef.current = {
      scale,
      setScale: (nextScale: number) => {
        const clamped = Math.max(
          MIN_PREVIEW_SCALE,
          Math.min(MAX_PREVIEW_SCALE, nextScale)
        );
        onScaleChange(clamped);
        if (transformRef.current) {
          const st = transformRef.current.state;
          transformRef.current.setTransform(st.positionX, st.positionY, clamped, 80);
        }
      },
      actualSize: () => {
        onScaleChange(1.0);
        if (transformRef.current) {
          transformRef.current.centerView(1.0, 120);
        }
      },
      zoomToFit: () => {
        onScaleChange(1.0);
        transformRef.current?.resetTransform(120);
      },
    };
  }, [scale, onScaleChange, controllerRef]);

  // Reset transform when item changes
  useEffect(() => {
    onScaleChange(1);
    transformRef.current?.resetTransform(0);
  }, [item.id, onScaleChange]);

  // Custom trackpad & wheel handler:
  // - Trackpad pinch (ctrlKey/metaKey) or mouse wheel: smooth exponential damped zoom [0.25, 8.0]
  //   with subtle snap around 1.0 (100%)
  // - Two-finger trackpad scroll when zoomed in (scale > 1.02) and !ctrlKey: natural 2D panning
  useEffect(() => {
    const el = viewportHostRef.current;
    if (!el) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const inst = transformRef.current;
      if (!inst) return;

      const { positionX, positionY, scale: currentScale } = inst.state;

      // Detect trackpad 2-finger pan vs pinch/wheel zoom:
      // On macOS/Windows precision trackpads, pinch sets e.ctrlKey = true.
      // Two-finger pan has e.ctrlKey = false and often non-zero deltaX or small integer deltaY.
      const isPinch = e.ctrlKey || e.metaKey;
      const isTrackpadPan =
        !isPinch &&
        e.deltaMode === 0 &&
        (Math.abs(e.deltaX) > 0 || Math.abs(e.deltaY) < 48) &&
        currentScale > 1.01;

      if (isTrackpadPan) {
        const nextX = positionX - e.deltaX;
        const nextY = positionY - e.deltaY;
        inst.setTransform(nextX, nextY, currentScale, 0);
        return;
      }

      // Exponential damped zoom centered on cursor
      const sensitivity = isPinch ? 0.0085 : 0.0018;
      const clampedDelta = Math.max(-120, Math.min(120, e.deltaY));
      let nextScale = currentScale * Math.exp(-clampedDelta * sensitivity);

      // Gentle snap to 100% when crossing 1.0 closely
      if (
        (currentScale < 1.0 && nextScale > 0.985 && nextScale < 1.02) ||
        (currentScale > 1.0 && nextScale < 1.015 && nextScale > 0.98)
      ) {
        nextScale = 1.0;
      }

      nextScale = Math.max(
        MIN_PREVIEW_SCALE,
        Math.min(MAX_PREVIEW_SCALE, nextScale)
      );
      if (Math.abs(nextScale - currentScale) < 0.0005) return;

      const rect = el.getBoundingClientRect();
      const cursorX = e.clientX - rect.left;
      const cursorY = e.clientY - rect.top;

      // Zoom around cursor position
      const ratio = nextScale / currentScale;
      let nextX = cursorX - (cursorX - positionX) * ratio;
      let nextY = cursorY - (cursorY - positionY) * ratio;

      // Re-center smoothly when zooming back to <= 1.0
      if (nextScale <= 1.0) {
        nextX = (rect.width * (1 - nextScale)) / 2;
        nextY = (rect.height * (1 - nextScale)) / 2;
      }

      inst.setTransform(nextX, nextY, nextScale, 0);
      onScaleChange(nextScale);
    };

    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => el.removeEventListener("wheel", handleWheel);
  }, [onScaleChange]);

  const handleTransform = useCallback(
    (_ref: unknown, state: { scale: number }) => {
      onScaleChange(state.scale);
    },
    [onScaleChange]
  );

  return (
    <div
      ref={viewportHostRef}
      className="w-full h-full relative overflow-hidden flex items-center justify-center"
    >
      <TransformWrapper
        ref={transformRef}
        initialScale={1}
        minScale={MIN_PREVIEW_SCALE}
        maxScale={MAX_PREVIEW_SCALE}
        centerOnInit={true}
        centerZoomedOut={true}
        wheel={{
          disabled: true, // Handled by our precision damped wheel/trackpad listener above
        }}
        pinch={{
          step: 5,
          disabled: false,
        }}
        panning={{ disabled: false, velocityDisabled: false }}
        doubleClick={{ disabled: false, mode: "reset" }}
        onTransform={handleTransform}
      >
        <TransformComponent
          wrapperClass="!w-full !h-full flex items-center justify-center cursor-grab active:cursor-grabbing"
          contentClass="!w-full !h-full flex items-center justify-center"
        >
          <div className="w-full h-full flex items-center justify-center p-4">
            <img
              src={imageSrc}
              alt={item.name}
              draggable={false}
              style={{
                maxWidth: "calc(100% - 2rem)",
                maxHeight: "calc(100% - 2rem)",
              }}
              className="object-contain select-none"
            />
          </div>
        </TransformComponent>

        {scale > 1.25 && (
          <div className="absolute bottom-4 right-4 z-30 pointer-events-auto">
            <MiniMap
              width={120}
              height={120}
              className="!relative rounded-xs overflow-hidden shadow-2xl border border-border/80 bg-card/95 backdrop-blur-md select-none transition-all animate-in fade-in zoom-in-95 duration-150"
              borderColor="var(--primary)"
              previewStyle={{
                backgroundColor: "oklch(var(--primary) / 0.18)",
                border: "2px solid var(--primary)",
                borderRadius: "2px",
              }}
            >
              <img
                src={imageSrc}
                alt={item.name}
                className="w-full h-full object-contain pointer-events-none select-none"
              />
            </MiniMap>
          </div>
        )}
      </TransformWrapper>
    </div>
  );
}

function ImageInspectorPreview({
  item,
  onOpenPreview,
  onDragStart,
}: PreviewInspectorProps) {
  return (
    <div
      onDoubleClick={onOpenPreview}
      className="w-full flex items-center justify-center py-1 cursor-pointer select-none"
    >
      <UniversalThumbnail
        item={item}
        draggable={true}
        onDragStart={onDragStart}
        objectFit="contain"
        borderless={true}
        className="max-h-56 w-auto max-w-full cursor-grab active:cursor-grabbing"
      />
    </div>
  );
}

export const ImagePreviewPlugin: PreviewPlugin = {
  id: "builtin.image",
  name: "Image Viewer",
  priority: 100,
  extensions: IMAGE_EXTENSIONS,
  mimePrefixes: ["image/"],
  match: (item) =>
    IMAGE_EXTENSIONS.includes((item.extension || "").toLowerCase()) ||
    (item.mimeType || "").toLowerCase().startsWith("image/"),
  supportsZoom: true,
  Viewport: ImageViewport,
  InspectorPreview: ImageInspectorPreview,
};
