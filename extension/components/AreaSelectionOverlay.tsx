import React, { useState, useEffect, useRef } from "react";
import { Check, X, Crop, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export interface AreaSelectionOverlayProps {
  onConfirm: (box: { x: number; y: number; width: number; height: number; dpr: number }) => Promise<void>;
  onCancel: () => void;
}

export function AreaSelectionOverlay({ onConfirm, onCancel }: AreaSelectionOverlayProps) {
  const [startPos, setStartPos] = useState<{ x: number; y: number } | null>(null);
  const [currentPos, setCurrentPos] = useState<{ x: number; y: number } | null>(null);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const toolbarRef = useRef<HTMLDivElement>(null);

  const left = startPos && currentPos ? Math.min(startPos.x, currentPos.x) : 0;
  const top = startPos && currentPos ? Math.min(startPos.y, currentPos.y) : 0;
  const width = startPos && currentPos ? Math.abs(currentPos.x - startPos.x) : 0;
  const height = startPos && currentPos ? Math.abs(currentPos.y - startPos.y) : 0;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onCancel();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onCancel]);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (toolbarRef.current && toolbarRef.current.contains(e.target as Node)) {
      return;
    }
    setIsDragging(true);
    setStartPos({ x: e.clientX, y: e.clientY });
    setCurrentPos({ x: e.clientX, y: e.clientY });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setCurrentPos({ x: e.clientX, y: e.clientY });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleSave = async () => {
    if (width < 10 || height < 10) return;
    setIsSaving(true);
    await onConfirm({
      x: left,
      y: top,
      width,
      height,
      dpr: window.devicePixelRatio || 1,
    });
    setIsSaving(false);
  };

  return (
    <div
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      className="fixed inset-0 z-[2147483647] cursor-crosshair select-none bg-black/40 font-sans"
    >
      {/* Selection Box */}
      {startPos && currentPos && width > 4 && height > 4 && (
        <div
          style={{
            position: "absolute",
            left: `${left}px`,
            top: `${top}px`,
            width: `${width}px`,
            height: `${height}px`,
          }}
          className="border-2 border-primary bg-primary/10 shadow-[0_0_0_9999px_rgba(0,0,0,0.5)] pointer-events-none"
        >
          {/* Dimension Tag */}
          <div className="absolute -top-7 left-0 pointer-events-none">
            <Badge variant="indigo" className="font-mono text-[10px] px-2 py-0.5 shadow-sm">
              {Math.round(width)} × {Math.round(height)} px
            </Badge>
          </div>

          {/* Floating Actions Toolbar */}
          {!isDragging && width > 20 && height > 20 && (
            <div
              ref={toolbarRef}
              className="absolute -bottom-11 right-0 pointer-events-auto flex items-center gap-1.5 p-1 rounded-xl bg-card/95 border border-border/80 backdrop-blur-md shadow-xl animate-in fade-in zoom-in-95 duration-150"
            >
              <Button
                variant="secondary"
                size="xs"
                onClick={onCancel}
                className="h-6 px-2 text-xs gap-1"
              >
                <X className="size-3" />
                <span>Cancel</span>
              </Button>
              <Button
                variant="default"
                size="xs"
                onClick={handleSave}
                disabled={isSaving}
                className="h-6 px-2.5 text-xs gap-1"
              >
                {isSaving ? (
                  <Loader2 className="size-3 animate-spin" />
                ) : (
                  <Check className="size-3" />
                )}
                <span>Save Area</span>
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
