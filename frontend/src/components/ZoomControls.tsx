import { useState, useRef, useEffect } from "react";
import { Slider } from "@/components/ui/slider";
import { Check, ChevronDown } from "lucide-react";

export interface ZoomControlsProps {
  scale: number;
  onScaleChange: (newScale: number) => void;
  onActualSize: () => void;
  onZoomToFit: () => void;
  className?: string;
}

const PRESET_ZOOM_LEVELS = [5, 10, 25, 50, 100, 125, 150, 200, 300, 400, 800];

export function ZoomControls({
  scale,
  onScaleChange,
  onActualSize,
  onZoomToFit,
  className = "",
}: ZoomControlsProps) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const currentPercent = Math.round(scale * 100);

  // Close dropdown on click outside
  useEffect(() => {
    if (!dropdownOpen) return;

    const handlePointerDown = (e: PointerEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };

    window.addEventListener("pointerdown", handlePointerDown);
    return () => window.removeEventListener("pointerdown", handlePointerDown);
  }, [dropdownOpen]);

  const handleSliderChange = (value: number | number[]) => {
    const val = Array.isArray(value) ? value[0] : value;
    onScaleChange(val / 100);
  };

  const handleSelectPreset = (percent: number) => {
    onScaleChange(percent / 100);
    setDropdownOpen(false);
  };

  return (
    <div ref={containerRef} className={`relative flex items-center gap-3 ${className}`}>
      {/* Zoom Slider (Range 5% to 800%) */}
      <div className="w-32 sm:w-44">
        <Slider
          min={5}
          max={800}
          step={5}
          value={currentPercent}
          onValueChange={handleSliderChange}
        />
      </div>

      {/* Percentage Pill Button */}
      <button
        type="button"
        onClick={() => setDropdownOpen((prev) => !prev)}
        title="点击选择预设缩放比例"
        className="flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-mono font-medium bg-muted/70 hover:bg-muted text-foreground border border-border/60 transition-colors shadow-2xs select-none"
      >
        <span>{currentPercent}%</span>
        <ChevronDown className="size-3 text-muted-foreground" />
      </button>

      {/* Preset Dropdown Menu */}
      {dropdownOpen && (
        <div
          role="menu"
          className="absolute left-1/2 -translate-x-1/2 top-full mt-2 z-50 w-36 rounded-xl border border-border/80 bg-popover/95 text-popover-foreground shadow-2xl backdrop-blur-md p-1 text-xs select-none animate-in fade-in zoom-in-95 duration-100"
        >
          <div className="space-y-0.5">
            {PRESET_ZOOM_LEVELS.map((preset) => {
              const isSelected = currentPercent === preset;
              return (
                <button
                  key={preset}
                  type="button"
                  onClick={() => handleSelectPreset(preset)}
                  className={`w-full flex items-center justify-between px-2 py-1 rounded-md text-left transition-colors font-mono ${
                    isSelected
                      ? "bg-primary/10 text-primary font-semibold"
                      : "hover:bg-muted text-foreground"
                  }`}
                >
                  <span>{preset}%</span>
                  {isSelected && <Check className="size-3 text-primary" />}
                </button>
              );
            })}
          </div>

          <div className="my-1 border-t border-border/60" />

          {/* Actual Size & Zoom to Fit actions */}
          <div className="space-y-0.5">
            <button
              type="button"
              onClick={() => {
                onActualSize();
                setDropdownOpen(false);
              }}
              className="w-full flex items-center px-2 py-1 rounded-md text-left hover:bg-muted text-foreground transition-colors"
            >
              <span>实际大小 (100%)</span>
            </button>

            <button
              type="button"
              onClick={() => {
                onZoomToFit();
                setDropdownOpen(false);
              }}
              className="w-full flex items-center px-2 py-1 rounded-md text-left hover:bg-muted text-foreground transition-colors"
            >
              <span>适应窗口 (Fit)</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
