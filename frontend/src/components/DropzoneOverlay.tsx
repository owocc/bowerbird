import { Upload, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import type { DropState } from "@/hooks/useFileDrop";

interface DropzoneOverlayProps {
  state: DropState;
}

export function DropzoneOverlay({ state }: DropzoneOverlayProps) {
  const { status, total, current, filename, message } = state;

  const percent = total > 0 ? Math.min(100, Math.round((current / total) * 100)) : 0;

  return (
    <>
      {/* 1. Dragging Over Overlay: Fullscreen active drop target feedback */}
      {status === "dragging-over" && (
        <div className="absolute inset-0 z-50 bg-background/80 backdrop-blur-md flex flex-col items-center justify-center border-4 border-dashed border-primary transition-all pointer-events-none select-none animate-in fade-in duration-150">
          <div className="size-16 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mb-4 animate-bounce shadow-md">
            <Upload className="size-8" />
          </div>
          <h3 className="text-xl font-bold tracking-tight">Drop files to import into library</h3>
          <p className="text-xs text-muted-foreground mt-1.5 max-w-sm text-center leading-relaxed">
            Drop local files, folders, or web images to import
          </p>
          <div className="flex gap-2 mt-4 text-[11px] text-muted-foreground font-mono">
            <span className="px-2 py-0.5 rounded bg-muted/60 border border-border">Isolated Copy</span>
            <span className="px-2 py-0.5 rounded bg-muted/60 border border-border">Deduplicated</span>
            <span className="px-2 py-0.5 rounded bg-muted/60 border border-border">Thumbnails</span>
          </div>
        </div>
      )}

      {/* 2. Importing Progress Modal: Active background importing feedback */}
      {status === "importing" && (
        <div className="absolute inset-0 z-50 bg-background/70 backdrop-blur-xs flex items-center justify-center p-4 pointer-events-none select-none animate-in fade-in duration-150">
          <div className="w-full max-w-md p-5 rounded-2xl bg-card border border-border shadow-xl space-y-3 pointer-events-auto">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Loader2 className="size-4 text-primary animate-spin" />
                <span className="font-semibold text-xs tracking-tight">Importing assets...</span>
              </div>
              <span className="font-mono text-xs text-muted-foreground">
                {current} / {total || 1} ({percent}%)
              </span>
            </div>

            {/* Progress bar */}
            <div className="w-full h-1.5 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all duration-200 ease-out"
                style={{ width: `${percent}%` }}
              />
            </div>

            <p className="text-[11px] text-muted-foreground truncate font-mono" title={filename}>
              {message || filename || "Processing..."}
            </p>
          </div>
        </div>
      )}

      {/* 3. Floating Success Toast Banner */}
      {status === "success" && message && (
        <div className="absolute bottom-10 right-6 z-40 max-w-md p-3 px-4 rounded-xl bg-card/95 border border-primary/30 shadow-lg backdrop-blur-md flex items-center gap-3 animate-in slide-in-from-bottom-3 duration-200 select-none">
          <CheckCircle2 className="size-4 text-primary shrink-0" />
          <p className="text-xs font-medium text-foreground truncate">{message}</p>
        </div>
      )}

      {/* 4. Floating Error Toast Banner */}
      {status === "error" && message && (
        <div className="absolute bottom-10 right-6 z-40 max-w-md p-3 px-4 rounded-xl bg-destructive/10 border border-destructive/30 shadow-lg backdrop-blur-md flex items-center gap-3 animate-in slide-in-from-bottom-3 duration-200 select-none">
          <AlertCircle className="size-4 text-destructive shrink-0" />
          <p className="text-xs font-medium text-destructive truncate">{message}</p>
        </div>
      )}
    </>
  );
}
