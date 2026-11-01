import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  definePlugin,
  type PreviewInspectorProps,
  type PreviewPlugin,
  type PreviewPluginHostAPI,
  type PreviewViewportProps,
  type ThemeMode,
} from "@bowerbird/plugin-sdk";
import {
  computeFitScale,
  formatBytes,
  parsePsd,
  summaryToText,
  type ParsedPsd,
  type PsdSummary,
} from "./psd";

/**
 * **PSD / PSB 预览插件**。
 *
 * 两个渲染面，各有取舍：
 * - `Viewport`（中间大图 / 全屏 QuickLook）：把文件里存的**合成图**画到 canvas 上，配检查器式的
 *   缩放与拖拽。合成图就是作者在 Photoshop 里拍平后看到的样子，不需要我们复刻图层混合。
 * - `InspectorPreview`（右侧检查器）：优先用文件内嵌的**缩略图**，拿到就立刻显示；没有缩略图
 *   才退回去解析合成图。浏览一屏 PSD 时这个差别很明显。
 */

/* -------------------------------------------------------------------------- */
/*                                  小工具                                     */
/* -------------------------------------------------------------------------- */

function usePluginTheme(propTheme?: ThemeMode, api?: PreviewPluginHostAPI): ThemeMode {
  const getResolved = (): ThemeMode => {
    if (propTheme) return propTheme;
    if (api?.getTheme) return api.getTheme();
    return "dark";
  };
  const [theme, setTheme] = useState<ThemeMode>(getResolved);

  useEffect(() => {
    setTheme(getResolved());
    if (!api?.subscribeTheme || propTheme) return;
    return api.subscribeTheme((next) => setTheme(next));
  }, [api, propTheme]);

  return theme;
}

/** 透明像素的棋盘格背景（用 CSS 渐变画，省一张图片）。 */
function checkerboardStyle(isDark: boolean): React.CSSProperties {
  const a = isDark ? "#1b1b1f" : "#ffffff";
  const b = isDark ? "#24242a" : "#f1f1f4";
  const size = 16;
  return {
    backgroundColor: a,
    backgroundImage: `linear-gradient(45deg, ${b} 25%, transparent 25%, transparent 75%, ${b} 75%), linear-gradient(45deg, ${b} 25%, transparent 25%, transparent 75%, ${b} 75%)`,
    backgroundSize: `${size}px ${size}px`,
    backgroundPosition: `0 0, ${size / 2}px ${size / 2}px`,
  };
}

const MUTED = "#8b8b93";

/* -------------------------------------------------------------------------- */
/*                                  视口                                       */
/* -------------------------------------------------------------------------- */

function PsdViewport({ item, mode, scale, onScaleChange, controllerRef, api, theme }: PreviewViewportProps) {
  const resolvedTheme = usePluginTheme(theme, api);
  const isDark = resolvedTheme === "dark";

  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [parsed, setParsed] = useState<ParsedPsd | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{ x: number; y: number; startX: number; startY: number } | null>(null);

  const summary = parsed?.summary;

  // 载入 + 解析
  useEffect(() => {
    let canceled = false;
    setLoading(true);
    setError(null);
    setParsed(null);
    setOffset({ x: 0, y: 0 });

    const run = async () => {
      try {
        const file = api.getOriginalFile();
        const buffer = await file.fetchArrayBuffer();
        if (canceled) return;
        const result = parsePsd(buffer, { withComposite: true });
        if (canceled) return;
        setParsed(result);
      } catch (err) {
        if (!canceled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      } finally {
        if (!canceled) setLoading(false);
      }
    };

    void run();
    return () => {
      canceled = true;
    };
  }, [api, item.filePath, item.id]);

  // 画合成图（按 devicePixelRatio 放大，避免高分屏发虚）
  useEffect(() => {
    const canvas = canvasRef.current;
    const composite = parsed?.composite;
    if (!canvas || !composite) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const displayWidth = Math.max(1, Math.round(composite.width * scale));
    const displayHeight = Math.max(1, Math.round(composite.height * scale));
    canvas.width = Math.round(displayWidth * dpr);
    canvas.height = Math.round(displayHeight * dpr);
    canvas.style.width = `${displayWidth}px`;
    canvas.style.height = `${displayHeight}px`;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, displayWidth, displayHeight);
    ctx.imageSmoothingEnabled = scale < 1;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(composite, 0, 0, displayWidth, displayHeight);
  }, [parsed, scale]);

  // 缩放控制器交给宿主（缩放按钮 / 快捷键走这里）
  useEffect(() => {
    controllerRef.current = {
      scale,
      setScale: (next: number) => onScaleChange(clampScale(next)),
      actualSize: () => onScaleChange(1),
      zoomToFit: () => {
        const container = containerRef.current;
        if (!container || !summary) return onScaleChange(1);
        onScaleChange(
          computeFitScale(summary.width, summary.height, container.clientWidth, container.clientHeight),
        );
      },
    };
    return () => {
      controllerRef.current = null;
    };
  }, [controllerRef, scale, onScaleChange, summary]);

  // 首次拿到尺寸后自动适应窗口
  const didFitRef = useRef(false);
  useEffect(() => {
    didFitRef.current = false;
  }, [item.id]);
  useEffect(() => {
    if (didFitRef.current || !summary || !containerRef.current) return;
    const container = containerRef.current;
    onScaleChange(
      computeFitScale(summary.width, summary.height, container.clientWidth, container.clientHeight),
    );
    didFitRef.current = true;
  }, [summary, onScaleChange]);

  const onWheel = useCallback(
    (event: React.WheelEvent) => {
      if (!summary) return;
      if (event.ctrlKey || event.metaKey) {
        event.preventDefault();
        onScaleChange(clampScale(scale * (event.deltaY > 0 ? 0.9 : 1.1)));
        return;
      }
      // 放大后可拖动：滚轮直接平移，符合看图习惯
      if (scale > 1) {
        event.preventDefault();
        setOffset((prev) => ({ x: prev.x - event.deltaX, y: prev.y - event.deltaY }));
      }
    },
    [onScaleChange, scale, summary],
  );

  const onPointerDown = (event: React.PointerEvent) => {
    if (scale <= 1) return;
    dragRef.current = { x: event.clientX, y: event.clientY, startX: offset.x, startY: offset.y };
    (event.target as HTMLElement).setPointerCapture?.(event.pointerId);
  };

  const onPointerMove = (event: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    setOffset({
      x: drag.startX + (event.clientX - drag.x),
      y: drag.startY + (event.clientY - drag.y),
    });
  };

  const onPointerUp = () => {
    dragRef.current = null;
  };

  if (loading) {
    return (
      <div style={{ display: "flex", height: "100%", alignItems: "center", justifyContent: "center", color: MUTED }}>
        Reading Photoshop document…
      </div>
    );
  }

  if (error) {
    return (
      <div
        style={{
          display: "flex",
          height: "100%",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 12,
          padding: 24,
          textAlign: "center",
        }}
      >
        <div style={{ fontSize: 14, fontWeight: 600 }}>This PSD could not be read</div>
        <div style={{ maxWidth: 460, fontSize: 12, lineHeight: 1.6, color: MUTED }}>{error}</div>
        <button
          type="button"
          onClick={() => void api.openWithDefaultApp()}
          style={buttonStyle(isDark)}
        >
          Open with default app
        </button>
      </div>
    );
  }

  if (!parsed?.composite) {
    return (
      <div
        style={{
          display: "flex",
          height: "100%",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 10,
          padding: 24,
          textAlign: "center",
          color: MUTED,
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 600, color: isDark ? "#e6e6ea" : "#1a1a1e" }}>
          No flattened composite in this file
        </div>
        <div style={{ maxWidth: 420, fontSize: 12, lineHeight: 1.6 }}>
          Photoshop can save a document without a composite image. Re-save with “Maximize Compatibility”
          enabled to get a preview here.
        </div>
        <button type="button" onClick={() => void api.openWithDefaultApp()} style={buttonStyle(isDark)}>
          Open with default app
        </button>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      onWheel={onWheel}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      style={{
        position: "relative",
        display: "flex",
        height: "100%",
        width: "100%",
        alignItems: mode === "full-window" ? "center" : "flex-start",
        justifyContent: "center",
        overflow: "hidden",
        cursor: scale > 1 ? (dragRef.current ? "grabbing" : "grab") : "default",
        ...checkerboardStyle(isDark),
      }}
    >
      <canvas
        ref={canvasRef}
        style={{
          transform: `translate(${offset.x}px, ${offset.y}px)`,
          transformOrigin: "center center",
          boxShadow: isDark ? "0 8px 32px rgba(0,0,0,.55)" : "0 8px 32px rgba(0,0,0,.14)",
        }}
      />

      {summary ? (
        <div
          style={{
            position: "absolute",
            left: 12,
            bottom: 12,
            display: "flex",
            gap: 8,
            padding: "4px 8px",
            borderRadius: 6,
            background: isDark ? "rgba(20,20,24,.82)" : "rgba(255,255,255,.9)",
            color: isDark ? "#c9c9d1" : "#3a3a42",
            fontSize: 11,
            fontVariantNumeric: "tabular-nums",
            pointerEvents: "none",
          }}
        >
          <span>
            {summary.width} × {summary.height}
          </span>
          <span style={{ opacity: 0.5 }}>|</span>
          <span>{summary.colorMode}</span>
          {summary.bitsPerChannel ? (
            <>
              <span style={{ opacity: 0.5 }}>|</span>
              <span>{summary.bitsPerChannel}-bit</span>
            </>
          ) : null}
          <span style={{ opacity: 0.5 }}>|</span>
          <span>{Math.round(scale * 100)}%</span>
        </div>
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                                 检查器预览                                   */
/* -------------------------------------------------------------------------- */

function PsdInspectorPreview({ item, api, theme, onOpenPreview }: PreviewInspectorProps) {
  const resolvedTheme = usePluginTheme(theme, api);
  const isDark = resolvedTheme === "dark";

  const [summary, setSummary] = useState<PsdSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const thumbnailUrl = useRef<string | null>(null);
  const [thumb, setThumb] = useState<string | null>(null);

  useEffect(() => {
    let canceled = false;
    setError(null);
    setSummary(null);
    setThumb(null);

    const run = async () => {
      try {
        const buffer = await api.getOriginalFile().fetchArrayBuffer();
        if (canceled) return;
        // 检查器不需要合成图（缩略图优先），省一次大内存分配
        const parsed = parsePsd(buffer, { withComposite: false });
        if (canceled) return;
        setSummary(parsed.summary);
        if (parsed.summary.thumbnail) {
          thumbnailUrl.current = parsed.summary.thumbnail.toDataURL("image/jpeg", 0.85);
          setThumb(thumbnailUrl.current);
        }
      } catch (err) {
        if (!canceled) setError(err instanceof Error ? err.message : String(err));
      }
    };

    void run();
    return () => {
      canceled = true;
      thumbnailUrl.current = null;
    };
  }, [api, item.filePath, item.id]);

  const fileSize = useMemo(() => formatBytes(api.getOriginalFile().size), [api]);

  if (error) {
    return (
      <div style={{ padding: 16, fontSize: 12, lineHeight: 1.6, color: MUTED }}>
        <div style={{ fontWeight: 600, color: isDark ? "#e6e6ea" : "#1a1a1e", marginBottom: 6 }}>
          Could not read this PSD
        </div>
        {error}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: 12 }}>
      <div
        onDoubleClick={onOpenPreview}
        style={{
          position: "relative",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: 140,
          borderRadius: 8,
          overflow: "hidden",
          ...checkerboardStyle(isDark),
        }}
      >
        {thumb ? (
          <img src={thumb} alt={item.filename} style={{ maxWidth: "100%", maxHeight: 200, display: "block" }} />
        ) : summary ? (
          <span style={{ padding: 12, fontSize: 11, color: MUTED, textAlign: "center", lineHeight: 1.5 }}>
            {summary.hasComposite ? "Open the preview to render this document" : "No embedded thumbnail"}
          </span>
        ) : (
          <span style={{ padding: 12, fontSize: 11, color: MUTED }}>Reading PSD…</span>
        )}
      </div>

      {summary ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12 }}>
          <Row label="Dimensions" value={`${summary.width} × ${summary.height}`} isDark={isDark} />
          <Row label="Color mode" value={summary.colorMode} isDark={isDark} />
          <Row
            label="Bit depth"
            value={summary.bitsPerChannel ? `${summary.bitsPerChannel}-bit` : "unknown"}
            isDark={isDark}
          />
          <Row
            label="Layers"
            value={
              summary.layers.total > 0
                ? `${summary.layers.total}${summary.layers.hidden > 0 ? ` · ${summary.layers.hidden} hidden` : ""}`
                : "flattened"
            }
            isDark={isDark}
          />
          <Row label="Alpha" value={summary.hasAlpha ? "yes" : "no"} isDark={isDark} />
          <Row label="File size" value={fileSize} isDark={isDark} />
        </div>
      ) : null}
    </div>
  );
}

function Row({ label, value, isDark }: { label: string; value: string; isDark: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
      <span style={{ color: MUTED }}>{label}</span>
      <span style={{ color: isDark ? "#e6e6ea" : "#1a1a1e", fontVariantNumeric: "tabular-nums" }}>
        {value}
      </span>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                                  样式常量                                    */
/* -------------------------------------------------------------------------- */

function clampScale(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.min(8, Math.max(0.05, value));
}

function buttonStyle(isDark: boolean): React.CSSProperties {
  return {
    padding: "6px 12px",
    fontSize: 12,
    borderRadius: 6,
    border: `1px solid ${isDark ? "#3a3a42" : "#d9d9e0"}`,
    background: isDark ? "#22222a" : "#ffffff",
    color: isDark ? "#e6e6ea" : "#1a1a1e",
    cursor: "pointer",
  };
}

/* -------------------------------------------------------------------------- */
/*                                插件定义                                     */
/* -------------------------------------------------------------------------- */

const PSD_EXTENSIONS = ["psd", "psb"];

const psdPreviewPlugin: PreviewPlugin = definePlugin({
  id: "official.psd-preview",
  name: "PSD Preview",
  version: "1.0.0",
  description: "Preview Photoshop documents (composite, layer info, document properties)",
  author: "Bowerbird Team",
  kind: "preview",
  priority: 95,
  extensions: PSD_EXTENSIONS,
  mimePrefixes: [
    "image/vnd.adobe.photoshop",
    "image/x-photoshop",
    "image/photoshop",
    "image/psd",
    "application/x-photoshop",
  ],
  // PS 文档常在文件名上不写扩展名或用了大写，扩展名与 MIME 两条都判一次
  match: (entry) => {
    const ext = (entry.extension || "").toLowerCase();
    if (PSD_EXTENSIONS.includes(ext)) return true;
    const mime = (entry.mimeType || "").toLowerCase();
    return mime.includes("photoshop") || mime === "image/psd";
  },
  supportsZoom: true,
  Viewport: PsdViewport,
  InspectorPreview: PsdInspectorPreview,
  contextMenus: [
    {
      id: "psd-copy-summary",
      label: "Copy PSD Summary",
      target: "file",
      extensions: ["psd", "psb"],
      onClick: async (ctx) => {
        const entry = ctx.items?.[0];
        if (!entry) return;
        try {
          const buffer = await ctx.api.getOriginalFile().fetchArrayBuffer();
          const { summary } = parsePsd(buffer, { withComposite: false });
          await navigator.clipboard.writeText(`${entry.filename}: ${summaryToText(summary)}`);
        } catch (err) {
          console.error("[PSDPlugin] Copy summary failed:", err);
        }
      },
    },
  ],
});

export default psdPreviewPlugin;
