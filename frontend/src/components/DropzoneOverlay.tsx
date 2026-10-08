import { Upload, Loader2 } from "lucide-react";
import type { DropState } from "@/hooks/useFileDrop";

interface DropzoneOverlayProps {
  state: DropState;
  targetName?: string;
}

export function DropzoneOverlay({ state, targetName }: DropzoneOverlayProps) {
  const { status, total, current, filename, message } = state;

  const percent = total > 0 ? Math.min(100, Math.round((current / total) * 100)) : 0;

  return (
    <>
      {/* 1. Dragging Over Overlay: Fullscreen active drop target feedback */}
      {status === "dragging-over" && (
        <div className="absolute inset-0 z-50 bg-background/85 backdrop-blur-md flex flex-col items-center justify-center border-4 border-dashed border-primary transition-all pointer-events-none select-none animate-in fade-in duration-150">
          <div className="size-16 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mb-3 animate-bounce shadow-md">
            <Upload className="size-8" />
          </div>
          <h3 className="text-lg font-bold tracking-tight text-foreground">
            {targetName ? `松开以导入至目录「${targetName}」` : "松开以导入至全部资产"}
          </h3>
          <p className="text-xs text-muted-foreground mt-1 max-w-sm text-center leading-relaxed">
            支持外部文件与文件夹 · 文件夹将自动递归提取子素材扁平归属
          </p>
          <div className="flex gap-2 mt-3 text-[11px] text-muted-foreground font-mono">
            <span className="px-2 py-0.5 rounded bg-muted/60 border border-border">自动排重</span>
            <span className="px-2 py-0.5 rounded bg-muted/60 border border-border">生成缩略图</span>
            <span className="px-2 py-0.5 rounded bg-muted/60 border border-border">元数据提取</span>
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
    </>
  );
}
