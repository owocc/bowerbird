import { default as Upload } from "~icons/ri/upload-line";
import { default as Loader2 } from "~icons/ri/loader-4-line";
import { useTranslation } from "react-i18next";
import type { DropState } from "@/hooks/useFileDrop";

interface DropzoneOverlayProps {
  state: DropState;
  targetName?: string;
}

export function DropzoneOverlay({ state, targetName }: DropzoneOverlayProps) {
  const { t } = useTranslation();
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
            {targetName
              ? t("dropzone.releaseToFolder", { name: targetName })
              : t("dropzone.releaseToAll")}
          </h3>
          <p className="text-xs text-muted-foreground mt-1 max-w-sm text-center leading-relaxed">
            {t("dropzone.supportedHint")}
          </p>
          <div className="flex gap-2 mt-3 text-[11px] text-muted-foreground font-mono">
            <span className="px-2 py-0.5 rounded bg-muted/60 border border-border">{t("dropzone.badge.dedupe")}</span>
            <span className="px-2 py-0.5 rounded bg-muted/60 border border-border">{t("dropzone.badge.thumbnail")}</span>
            <span className="px-2 py-0.5 rounded bg-muted/60 border border-border">{t("dropzone.badge.metadata")}</span>
          </div>
        </div>
      )}

      {/* 2. Bottom Background Import Status Bar: Fixed at bottom of main content area, non-blocking */}
      {status === "importing" && (
        <div
          data-import-status-bar="true"
          className="w-full shrink-0 border-t border-border/80 bg-card/95 backdrop-blur-md px-3.5 py-2 flex items-center gap-3 z-30 select-none wails-no-drag animate-in slide-in-from-bottom-2 duration-150"
        >
          <div className="flex items-center gap-2 shrink-0">
            <Loader2 className="size-3.5 text-primary animate-spin shrink-0" />
            <span className="font-semibold text-xs text-foreground tracking-tight">
              {t("dropzone.importing")}
            </span>
          </div>

          <p
            className="text-[11px] text-muted-foreground truncate font-mono flex-1 min-w-0"
            title={filename}
          >
            {message || filename || t("dropzone.processing")}
          </p>

          <div className="flex items-center gap-2.5 shrink-0">
            <div className="w-32 sm:w-44 h-1.5 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all duration-150 ease-out"
                style={{ width: `${percent}%` }}
              />
            </div>
            <span className="font-mono text-[11px] text-muted-foreground tabular-nums min-w-[76px] text-right">
              {current} / {total || 1} ({percent}%)
            </span>
          </div>
        </div>
      )}
    </>
  );
}
