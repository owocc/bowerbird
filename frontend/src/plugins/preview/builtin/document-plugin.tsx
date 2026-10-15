import { useState, useEffect } from "react";
import { UniversalThumbnail } from "@/components/UniversalThumbnail";
import type {
  PreviewPlugin,
  PreviewViewportProps,
  PreviewInspectorProps,
} from "../types";

const TEXT_EXTENSIONS = [
  "txt",
  "md",
  "markdown",
  "json",
  "yaml",
  "yml",
  "toml",
  "xml",
  "csv",
  "log",
  "js",
  "ts",
  "jsx",
  "tsx",
  "go",
  "py",
  "rs",
  "c",
  "cpp",
  "h",
  "css",
  "html",
  "sh",
  "sql",
];

const DOC_EXTENSIONS = ["pdf", ...TEXT_EXTENSIONS];

function DocumentViewport({ item }: PreviewViewportProps) {
  const ext = (item.extension || "").toLowerCase();
  const isPdf = ext === "pdf" || item.mimeType === "application/pdf";
  const [textContent, setTextContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isPdf || !item.originalUrl) {
      setTextContent(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetch(item.originalUrl)
      .then((res) => res.text())
      .then((txt) => {
        if (!cancelled) {
          setTextContent(txt.slice(0, 100_000));
        }
      })
      .catch(() => {
        if (!cancelled) setTextContent(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [item.id, item.originalUrl, isPdf]);

  if (isPdf) {
    return (
      <div className="w-full h-full p-4 flex items-center justify-center">
        <iframe
          src={item.originalUrl}
          title={item.name}
          className="w-full h-full rounded-lg border border-border/60 bg-background"
        />
      </div>
    );
  }

  return (
    <div className="w-full h-full p-6 overflow-hidden flex items-center justify-center">
      <div className="w-full max-w-4xl h-full rounded-xl border border-border/60 bg-card/80 overflow-auto p-5 select-text">
        {loading ? (
          <div className="text-xs text-muted-foreground font-mono">Loading…</div>
        ) : (
          <pre className="text-xs font-mono text-foreground whitespace-pre-wrap break-words leading-relaxed">
            {textContent ?? ""}
          </pre>
        )}
      </div>
    </div>
  );
}

function DocumentInspectorPreview({
  item,
  onOpenPreview,
  onDragStart,
}: PreviewInspectorProps) {
  return (
    <div
      onDoubleClick={onOpenPreview}
      className="w-full flex items-center justify-center py-2 cursor-pointer select-none"
    >
      <UniversalThumbnail
        item={item}
        draggable={true}
        onDragStart={onDragStart}
        objectFit="contain"
        borderless={true}
        className="max-h-44 w-auto max-w-full cursor-grab active:cursor-grabbing"
      />
    </div>
  );
}

export const DocumentPreviewPlugin: PreviewPlugin = {
  id: "builtin.document",
  name: "Document & Code Viewer",
  priority: 70,
  extensions: DOC_EXTENSIONS,
  mimePrefixes: ["text/", "application/pdf", "application/json"],
  supportsZoom: false,
  Viewport: DocumentViewport,
  InspectorPreview: DocumentInspectorPreview,
};
