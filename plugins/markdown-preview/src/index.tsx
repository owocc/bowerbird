import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import {
  definePlugin,
  type PreviewPlugin,
  type PreviewViewportProps,
  type PreviewInspectorProps,
  type PreviewPluginHostAPI,
  type ThemeMode,
} from "@bowerbird/plugin-sdk";

interface Frontmatter {
  title?: string;
  date?: string;
  author?: string;
  description?: string;
  tags?: string[];
  [key: string]: unknown;
}

interface OutlineItem {
  level: number;
  text: string;
  id: string;
}

function parseFrontmatterAndBody(raw: string): { frontmatter: Frontmatter | null; body: string } {
  const trimmed = raw.trimStart();
  if (!trimmed.startsWith("---")) {
    return { frontmatter: null, body: raw };
  }

  const endIdx = trimmed.indexOf("\n---", 3);
  if (endIdx === -1) {
    return { frontmatter: null, body: raw };
  }

  const yamlBlock = trimmed.slice(3, endIdx).trim();
  const body = trimmed.slice(endIdx + 4).trimStart();
  const frontmatter: Frontmatter = {};

  for (const line of yamlBlock.split("\n")) {
    const colon = line.indexOf(":");
    if (colon > 0) {
      const key = line.slice(0, colon).trim();
      let val = line.slice(colon + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (val.startsWith("[") && val.endsWith("]")) {
        frontmatter[key] = val
          .slice(1, -1)
          .split(",")
          .map((s) => s.trim().replace(/^['"]|['"]$/g, ""))
          .filter(Boolean);
      } else {
        frontmatter[key] = val;
      }
    }
  }

  return { frontmatter, body };
}

function extractOutline(text: string): OutlineItem[] {
  const lines = text.split("\n");
  const outline: OutlineItem[] = [];
  let inCode = false;

  for (const line of lines) {
    if (line.trim().startsWith("```")) {
      inCode = !inCode;
      continue;
    }
    if (inCode) continue;

    const match = line.match(/^(#{1,6})\s+(.*)$/);
    if (match) {
      const level = match[1].length;
      const text = match[2].trim().replace(/[#*`_~]/g, "");
      const id = text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      outline.push({ level, text, id });
    }
  }
  return outline;
}

function renderInlineMarkdown(
  text: string,
  onLinkClick?: (url: string) => void,
  isDark: boolean = true
): React.ReactNode[] {
  // Simple inline parser: code, bold, italic, strikethrough, link, image
  const nodes: React.ReactNode[] = [];
  let remaining = text;
  let keyIdx = 0;

  while (remaining.length > 0) {
    // Inline code `code`
    const codeMatch = remaining.match(/^`([^`]+)`/);
    if (codeMatch) {
      nodes.push(
        <code
          key={`code-${keyIdx++}`}
          style={{
            fontFamily: "monospace",
            fontSize: "0.875em",
            padding: "0.15em 0.35em",
            borderRadius: "4px",
            background: isDark ? "rgba(120, 120, 140, 0.15)" : "#f1f5f9",
            border: isDark ? "none" : "1px solid #e2e8f0",
            color: isDark ? "#e06c75" : "#b91c1c",
          }}
        >
          {codeMatch[1]}
        </code>
      );
      remaining = remaining.slice(codeMatch[0].length);
      continue;
    }

    // Bold **text**
    const boldMatch = remaining.match(/^\*\*([^*]+)\*\*/);
    if (boldMatch) {
      nodes.push(
        <strong
          key={`bold-${keyIdx++}`}
          style={{ color: isDark ? "#f8fafc" : "#000000" }}
        >
          {boldMatch[1]}
        </strong>
      );
      remaining = remaining.slice(boldMatch[0].length);
      continue;
    }

    // Italic *text*
    const italicMatch = remaining.match(/^\*([^*]+)\*/);
    if (italicMatch) {
      nodes.push(<em key={`italic-${keyIdx++}`}>{italicMatch[1]}</em>);
      remaining = remaining.slice(italicMatch[0].length);
      continue;
    }

    // Strikethrough ~~text~~
    const strikeMatch = remaining.match(/^~~([^~]+)~~/);
    if (strikeMatch) {
      nodes.push(<del key={`del-${keyIdx++}`}>{strikeMatch[1]}</del>);
      remaining = remaining.slice(strikeMatch[0].length);
      continue;
    }

    // Link [text](url)
    const linkMatch = remaining.match(/^\[([^\]]+)\]\(([^)]+)\)/);
    if (linkMatch) {
      const url = linkMatch[2];
      nodes.push(
        <a
          key={`a-${keyIdx++}`}
          href={url}
          onClick={(e) => {
            e.preventDefault();
            onLinkClick?.(url);
          }}
          style={{
            color: isDark ? "#60a5fa" : "#2563eb",
            textDecoration: "underline",
            textUnderlineOffset: "3px",
            cursor: "pointer",
          }}
        >
          {linkMatch[1]}
        </a>
      );
      remaining = remaining.slice(linkMatch[0].length);
      continue;
    }

    // Normal text chunk up to next special char
    const nextSpecial = remaining.search(/[`*_~\[]/);
    if (nextSpecial === -1) {
      nodes.push(remaining);
      break;
    } else if (nextSpecial === 0) {
      nodes.push(remaining[0]);
      remaining = remaining.slice(1);
    } else {
      nodes.push(remaining.slice(0, nextSpecial));
      remaining = remaining.slice(nextSpecial);
    }
  }

  return nodes;
}

function MarkdownRenderer({
  body,
  onLinkClick,
  isDark = true,
  compact = false,
}: {
  body: string;
  onLinkClick: (url: string) => void;
  isDark?: boolean;
  compact?: boolean;
}) {
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const lines = useMemo(() => body.split("\n"), [body]);
  const elements: React.ReactNode[] = [];

  let i = 0;
  let blockKey = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    // Empty lines
    if (!trimmed) {
      i++;
      continue;
    }

    // Fenced Code Block ```
    if (trimmed.startsWith("```")) {
      const lang = trimmed.slice(3).trim() || "plaintext";
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      if (i < lines.length) i++; // skip closing ```
      const fullCode = codeLines.join("\n");
      const currentIdx = blockKey++;

      elements.push(
        <div
          key={`code-block-${currentIdx}`}
          style={{
            margin: compact ? "0.4rem 0" : "1rem 0",
            borderRadius: "6px",
            overflow: "hidden",
            border: isDark ? "1px solid rgba(255, 255, 255, 0.1)" : "1px solid #e2e8f0",
            background: isDark ? "rgba(18, 18, 22, 0.8)" : "#f8fafc",
          }}
        >
          {!compact && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "0.4rem 0.8rem",
                background: isDark ? "rgba(255, 255, 255, 0.04)" : "#f1f5f9",
                borderBottom: isDark ? "1px solid rgba(255, 255, 255, 0.08)" : "1px solid #e2e8f0",
                fontSize: "0.75rem",
                color: isDark ? "#94a3b8" : "#4b5563",
                fontFamily: "monospace",
              }}
            >
            <span>{lang}</span>
            <button
              onClick={() => {
                navigator.clipboard.writeText(fullCode);
                setCopiedIndex(currentIdx);
                setTimeout(() => setCopiedIndex(null), 1500);
              }}
              style={{
                background: "transparent",
                border: "none",
                color: copiedIndex === currentIdx ? "#10b981" : "#94a3b8",
                cursor: "pointer",
                fontSize: "0.75rem",
                padding: "2px 6px",
                borderRadius: "4px",
              }}
            >
              {copiedIndex === currentIdx ? "Copied!" : "Copy"}
            </button>
            </div>
          )}
          <pre
            style={{
              padding: compact ? "0.4rem 0.6rem" : "0.8rem 1rem",
              margin: 0,
              overflowX: "auto",
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
              fontSize: compact ? "0.75rem" : "0.85rem",
              lineHeight: 1.45,
              color: isDark ? "#e2e8f0" : "#000000",
            }}
          >
            <code>{fullCode}</code>
          </pre>
        </div>
      );
      continue;
    }

    // Headings
    const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const text = headingMatch[2].trim();
      const id = text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      const Tag = (`h${level}`) as "h1" | "h2" | "h3" | "h4" | "h5" | "h6";
      const fontSizes = compact
        ? ["1.05rem", "0.95rem", "0.85rem", "0.8rem", "0.75rem", "0.75rem"]
        : ["1.875rem", "1.5rem", "1.25rem", "1.1rem", "1rem", "0.9rem"];

      elements.push(
        <Tag
          id={id}
          key={`heading-${blockKey++}`}
          style={{
            fontSize: fontSizes[level - 1],
            fontWeight: 700,
            marginTop: compact ? (blockKey === 1 ? "0" : "0.55rem") : (level === 1 ? "1.5rem" : "1.25rem"),
            marginBottom: compact ? "0.25rem" : "0.5rem",
            paddingBottom: !compact && level <= 2 ? "0.3rem" : undefined,
            borderBottom: !compact && level <= 2 ? (isDark ? "1px solid rgba(255, 255, 255, 0.1)" : "1px solid #e2e8f0") : undefined,
            color: isDark ? "#f8fafc" : "#000000",
            scrollMarginTop: "2rem",
            lineHeight: 1.35,
          }}
        >
          {renderInlineMarkdown(text, onLinkClick, isDark)}
        </Tag>
      );
      i++;
      continue;
    }

    // Horizontal Rule
    if (/^(\*{3,}|-{3,}|_{3,})$/.test(trimmed)) {
      elements.push(
        <hr
          key={`hr-${blockKey++}`}
          style={{
            border: "none",
            borderTop: isDark ? "1px solid rgba(255, 255, 255, 0.12)" : "1px solid #e2e8f0",
          }}
        />
      );
      i++;
      continue;
    }

    // Blockquote >
    if (trimmed.startsWith(">")) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith(">")) {
        quoteLines.push(lines[i].trim().slice(1).trim());
        i++;
      }
      elements.push(
        <blockquote
          key={`quote-${blockKey++}`}
          style={{
            margin: "0.75rem 0",
            padding: "0.5rem 1rem",
            borderLeft: `4px solid ${isDark ? "#6366f1" : "#4f46e5"}`,
            background: isDark ? "rgba(99, 102, 241, 0.08)" : "#f8fafc",
            borderRadius: "0 6px 6px 0",
            color: isDark ? "#cbd5e1" : "#000000",
            fontStyle: "italic",
          }}
        >
          {quoteLines.map((ql, qIdx) => (
            <p key={qIdx} style={{ margin: "0.25rem 0", color: isDark ? "#cbd5e1" : "#000000" }}>
              {renderInlineMarkdown(ql, onLinkClick, isDark)}
            </p>
          ))}
        </blockquote>
      );
      continue;
    }

    // Markdown Table
    if (trimmed.includes("|") && trimmed.startsWith("|")) {
      const tableLines: string[] = [];
      while (i < lines.length && lines[i].trim().includes("|") && lines[i].trim().startsWith("|")) {
        tableLines.push(lines[i].trim());
        i++;
      }

      if (tableLines.length >= 2) {
        const headerRow = tableLines[0]
          .slice(1, -1)
          .split("|")
          .map((c) => c.trim());
        const bodyRows = tableLines
          .slice(2)
          .map((r) => r.slice(1, -1).split("|").map((c) => c.trim()));

        elements.push(
          <div
            key={`table-${blockKey++}`}
            style={{
              margin: "1rem 0",
              overflowX: "auto",
              borderRadius: "6px",
              border: isDark ? "1px solid rgba(255, 255, 255, 0.1)" : "1px solid #e2e8f0",
            }}
          >
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: "0.875rem",
                textAlign: "left",
              }}
            >
              <thead>
                <tr style={{ background: isDark ? "rgba(255, 255, 255, 0.05)" : "#f8fafc" }}>
                  {headerRow.map((h, hIdx) => (
                    <th
                      key={hIdx}
                      style={{
                        padding: "0.6rem 0.8rem",
                        borderBottom: isDark ? "1px solid rgba(255, 255, 255, 0.1)" : "1px solid #e2e8f0",
                        fontWeight: 600,
                        color: isDark ? "#f1f5f9" : "#000000",
                      }}
                    >
                      {renderInlineMarkdown(h, onLinkClick, isDark)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {bodyRows.map((row, rIdx) => (
                  <tr
                    key={rIdx}
                    style={{
                      borderBottom: isDark ? "1px solid rgba(255, 255, 255, 0.05)" : "1px solid #f1f5f9",
                      background: rIdx % 2 === 1 ? (isDark ? "rgba(255, 255, 255, 0.02)" : "#f8fafc") : "transparent",
                    }}
                  >
                    {row.map((cell, cIdx) => (
                      <td
                        key={cIdx}
                        style={{
                          padding: "0.5rem 0.8rem",
                          color: isDark ? "#cbd5e1" : "#000000",
                        }}
                      >
                        {renderInlineMarkdown(cell, onLinkClick, isDark)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
        continue;
      }
    }

    // Lists (unordered, task list, ordered)
    if (/^(\*|-|\+|\d+\.)\s+/.test(trimmed)) {
      const listItems: Array<{ isTask?: boolean; checked?: boolean; text: string }> = [];
      const isOrdered = /^\d+\./.test(trimmed);

      while (i < lines.length && /^(\*|-|\+|\d+\.)\s+/.test(lines[i].trim())) {
        const itemLine = lines[i].trim();
        const content = itemLine.replace(/^(\*|-|\+|\d+\.)\s+/, "");
        const taskMatch = content.match(/^\[([ xX])\]\s+(.*)$/);

        if (taskMatch) {
          listItems.push({
            isTask: true,
            checked: taskMatch[1].toLowerCase() === "x",
            text: taskMatch[2],
          });
        } else {
          listItems.push({ text: content });
        }
        i++;
      }

      const ListTag = isOrdered ? "ol" : "ul";
      elements.push(
        <ListTag
          key={`list-${blockKey++}`}
          style={{
            margin: compact ? "0.25rem 0" : "0.5rem 0",
            paddingLeft: compact ? "1.2rem" : "1.5rem",
            color: isDark ? "#e2e8f0" : "#000000",
            lineHeight: compact ? 1.45 : 1.6,
          }}
        >
          {listItems.map((li, liIdx) => (
            <li
              key={liIdx}
              style={{
                listStyleType: li.isTask ? "none" : undefined,
                marginLeft: li.isTask ? "-1.2rem" : undefined,
                display: li.isTask ? "flex" : undefined,
                alignItems: li.isTask ? "center" : undefined,
                gap: li.isTask ? "0.5rem" : undefined,
                color: isDark ? "#e2e8f0" : "#000000",
              }}
            >
              {li.isTask && (
                <input
                  type="checkbox"
                  checked={li.checked}
                  readOnly
                  style={{ accentColor: "#6366f1", cursor: "default" }}
                />
              )}
              <span>{renderInlineMarkdown(li.text, onLinkClick, isDark)}</span>
            </li>
          ))}
        </ListTag>
      );
      continue;
    }

    // Regular Paragraph
    const paraLines: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !lines[i].trim().startsWith("```") &&
      !lines[i].trim().startsWith("#") &&
      !lines[i].trim().startsWith(">") &&
      !/^(\*|-|\+|\d+\.)\s+/.test(lines[i].trim()) &&
      !lines[i].trim().startsWith("|")
    ) {
      paraLines.push(lines[i].trim());
      i++;
    }

    if (paraLines.length > 0) {
      elements.push(
        <p
          key={`p-${blockKey++}`}
          style={{
            margin: compact ? "0.3rem 0" : "0.6rem 0",
            lineHeight: compact ? 1.45 : 1.7,
            color: isDark ? "#e2e8f0" : "#000000",
            fontSize: compact ? "0.825rem" : "0.95rem",
          }}
        >
          {renderInlineMarkdown(paraLines.join(" "), onLinkClick, isDark)}
        </p>
      );
    }
  }

  return <div>{elements}</div>;
}

function MarkdownViewport({
  item,
  scale,
  controllerRef,
  api,
  theme: propTheme,
}: PreviewViewportProps) {
  const theme = usePluginTheme(propTheme, api);
  const isDark = theme === "dark";
  const [text, setText] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);

  // Setup zoom controller
  useEffect(() => {
    controllerRef.current = {
      scale,
      setScale: () => {},
      actualSize: () => {},
      zoomToFit: () => {},
    };
    return () => {
      controllerRef.current = null;
    };
  }, [controllerRef, scale]);

  // Load document content
  useEffect(() => {
    let canceled = false;
    setLoading(true);
    setError(null);

    const loadContent = async () => {
      try {
        const fileHandle = api.getOriginalFile();
        let content = "";
        if (fileHandle.fetchText) {
          content = await fileHandle.fetchText();
        } else {
          const blob = await fileHandle.fetchBlob();
          content = await blob.text();
        }
        if (!canceled) {
          setText(content);
          setLoading(false);
        }
      } catch (err) {
        if (!canceled) {
          setError(err instanceof Error ? err.message : "Failed to load Markdown file");
          setLoading(false);
        }
      }
    };

    loadContent();
    return () => {
      canceled = true;
    };
  }, [item.id, api]);

  const { frontmatter, body } = useMemo(() => parseFrontmatterAndBody(text), [text]);

  const handleLinkClick = useCallback(
    (url: string) => {
      if (url.startsWith("#")) {
        const el = document.getElementById(url.slice(1));
        el?.scrollIntoView({ behavior: "smooth" });
      } else {
        api.openExternalURL(url);
      }
    },
    [api]
  );

  return (
    <div
      ref={containerRef}
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        width: "100%",
        background: isDark ? "#0c0d11" : "#ffffff",
        color: isDark ? "#f1f5f9" : "#000000",
        overflow: "hidden",
        position: "relative",
      }}
    >
      {/* Pure article content */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "2.5rem 2rem",
          display: "flex",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            width: "100%",
            maxWidth: "800px",
            transform: scale !== 1 ? `scale(${scale})` : undefined,
            transformOrigin: "top center",
            transition: "transform 0.1s ease-out",
          }}
        >
          {loading ? (
            <div style={{ textAlign: "center", padding: "4rem 0", color: isDark ? "#94a3b8" : "#64748b" }}>
              Loading Markdown...
            </div>
          ) : error ? (
            <div
              style={{
                padding: "1.5rem",
                borderRadius: "8px",
                background: "rgba(239, 68, 68, 0.1)",
                border: "1px solid rgba(239, 68, 68, 0.3)",
                color: "#f87171",
              }}
            >
              {error}
            </div>
          ) : (
            <>
              {/* Frontmatter card if present */}
              {frontmatter && Object.keys(frontmatter).length > 0 && (
                <div
                  style={{
                    marginBottom: "1.5rem",
                    padding: "1rem",
                    borderRadius: "8px",
                    background: isDark ? "rgba(255, 255, 255, 0.03)" : "#f8fafc",
                    border: isDark ? "1px solid rgba(255, 255, 255, 0.08)" : "1px solid #e2e8f0",
                    fontSize: "0.85rem",
                  }}
                >
                  {frontmatter.title && (
                    <h1 style={{ margin: "0 0 0.5rem 0", fontSize: "1.5rem", color: isDark ? "#f8fafc" : "#000000" }}>
                      {String(frontmatter.title)}
                    </h1>
                  )}
                  {frontmatter.description && (
                    <p style={{ margin: "0 0 0.5rem 0", color: isDark ? "#94a3b8" : "#334155" }}>
                      {String(frontmatter.description)}
                    </p>
                  )}
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", marginTop: "0.5rem" }}>
                    {frontmatter.author && (
                      <span style={{ color: isDark ? "#64748b" : "#4b5563" }}>By {String(frontmatter.author)}</span>
                    )}
                    {frontmatter.date && (
                      <span style={{ color: isDark ? "#64748b" : "#4b5563" }}>• {String(frontmatter.date)}</span>
                    )}
                    {Array.isArray(frontmatter.tags) &&
                      frontmatter.tags.map((t, idx) => (
                        <span
                          key={idx}
                          style={{
                            background: isDark ? "rgba(99, 102, 241, 0.15)" : "#e0e7ff",
                            color: isDark ? "#818cf8" : "#4338ca",
                            borderRadius: "4px",
                            padding: "1px 6px",
                            fontSize: "0.75rem",
                          }}
                        >
                          #{t}
                        </span>
                      ))}
                  </div>
                </div>
              )}

              {/* Markdown rendered body */}
              <MarkdownRenderer body={body} onLinkClick={handleLinkClick} isDark={isDark} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
function usePluginTheme(propTheme?: ThemeMode, api?: PreviewPluginHostAPI): ThemeMode {
  const getResolved = (): ThemeMode => {
    if (propTheme) return propTheme;
    if (api?.getTheme) return api.getTheme();
    if (typeof document !== "undefined") {
      return document.documentElement.classList.contains("dark") ? "dark" : "light";
    }
    return "light";
  };

  const [theme, setTheme] = useState<ThemeMode>(getResolved);

  useEffect(() => {
    setTheme(getResolved());
  }, [propTheme]);

  useEffect(() => {
    if (propTheme) return;
    if (api?.subscribeTheme) {
      return api.subscribeTheme((t: ThemeMode) => setTheme(t));
    }
    if (typeof window !== "undefined" && typeof MutationObserver !== "undefined") {
      const observer = new MutationObserver(() => {
        const isDark = document.documentElement.classList.contains("dark");
        setTheme(isDark ? "dark" : "light");
      });
      observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
      return () => observer.disconnect();
    }
  }, [propTheme, api]);

  return theme;
}

function stripMarkdown(raw: string): string {
  return raw
    .replace(/^---[\s\S]*?---\s*/m, "")
    .replace(/^#+\s+/gm, "")
    .replace(/```[\s\S]*?```/g, "")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/~~([^~]+)~~/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "")
    .replace(/^>\s*/gm, "")
    .replace(/^[-*+]\s+/gm, "")
    .replace(/^\d+\.\s+/gm, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/\n{2,}/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractDocumentTitle(text: string, fallback: string): string {
  const { frontmatter, body } = parseFrontmatterAndBody(text);
  if (frontmatter?.title && typeof frontmatter.title === "string") {
    return frontmatter.title;
  }
  const lines = body.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("# ")) {
      return trimmed.replace(/^#\s+/, "").trim();
    }
    if (trimmed.startsWith("## ")) {
      return trimmed.replace(/^##\s+/, "").trim();
    }
  }
  return fallback;
}

function MarkdownInspectorPreview({
  item,
  api,
  theme: propTheme,
  onOpenPreview,
  onDragStart,
}: PreviewInspectorProps) {
  const theme = usePluginTheme(propTheme, api);
  const isDark = theme === "dark";
  const [content, setContent] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    let active = true;
    const fetchContent = async () => {
      try {
        setLoading(true);
        const fileHandle = api.getOriginalFile();
        const text = fileHandle.fetchText
          ? await fileHandle.fetchText()
          : await (await fileHandle.fetchBlob()).text();
        if (active) {
          const { frontmatter, body } = parseFrontmatterAndBody(text);
          let displayBody = body.trim();
          if (frontmatter?.title && typeof frontmatter.title === "string" && !displayBody.startsWith("#")) {
            displayBody = `# ${frontmatter.title}\n\n${displayBody}`;
          }
          setContent(displayBody);
          setLoading(false);
        }
      } catch {
        if (active) setLoading(false);
      }
    };
    fetchContent();
    return () => {
      active = false;
    };
  }, [item.id, api]);

  // Standard Bowerbird native/internal drag handler
  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData("application/x-bowerbird-internal-drag", "true");
    e.dataTransfer.setData("application/x-bowerbird-item-id", item.id);

    const rawPath = item.filePath || "";
    let fileUrl = item.fileUrl || "";
    if (!fileUrl && rawPath) {
      fileUrl = encodeURI(`file://${rawPath.startsWith("/") ? "" : "/"}${rawPath}`);
    } else if (fileUrl && fileUrl.includes(" ")) {
      fileUrl = encodeURI(fileUrl);
    }
    const mime = item.mimeType || "text/markdown";

    if (rawPath) {
      e.dataTransfer.setData("text/plain", rawPath);
      e.dataTransfer.setData("application/x-bowerbird-path", rawPath);
      e.dataTransfer.setData("application/x-bowerbird-paths", JSON.stringify([rawPath]));
    }
    if (fileUrl) {
      e.dataTransfer.setData("text/uri-list", fileUrl);
      e.dataTransfer.setData("DownloadURL", `${mime}:${item.filename}:${fileUrl}`);
    }
    e.dataTransfer.effectAllowed = "copyMove";

    onDragStart?.(e);
  };

  return (
    <div
      draggable={true}
      onDragStart={handleDragStart}
      onDoubleClick={onOpenPreview}
      className="draggable-asset-card wails-no-drag select-none cursor-grab active:cursor-grabbing"
      style={{
        width: "100%",
        height: "210px",
        maxHeight: "210px",
        borderRadius: "14px",
        background: isDark ? "#18181b" : "#ffffff",
        border: isDark ? "1px solid rgba(255, 255, 255, 0.08)" : "1px solid rgba(0, 0, 0, 0.08)",
        boxShadow: isDark
          ? "0 2px 10px rgba(0, 0, 0, 0.35)"
          : "0 1px 4px rgba(0, 0, 0, 0.06)",
        padding: "1rem 1.15rem",
        overflow: "hidden",
        position: "relative",
        boxSizing: "border-box",
        maskImage: "linear-gradient(to bottom, black 75%, transparent 100%)",
        WebkitMaskImage: "linear-gradient(to bottom, black 75%, transparent 100%)",
      }}
    >
      {loading ? (
        <div style={{ color: isDark ? "#71717a" : "#a1a1aa", fontSize: "0.8rem", paddingTop: "0.5rem" }}>
          Loading...
        </div>
      ) : content ? (
        <div style={{ pointerEvents: "none", userSelect: "none" }}>
          <MarkdownRenderer body={content} onLinkClick={() => {}} isDark={isDark} compact={true} />
        </div>
      ) : (
        <div style={{ color: isDark ? "#71717a" : "#a1a1aa", fontSize: "0.8rem", paddingTop: "0.5rem", fontStyle: "italic" }}>
          (Empty Markdown file)
        </div>
      )}
    </div>
  );
}

const markdownPreviewPlugin: PreviewPlugin = definePlugin({
  id: "official.markdown-preview",
  name: "Markdown Preview",
  version: "1.0.0",
  description: "Rich Markdown preview with syntax highlighting, task lists, and metadata inspection",
  author: "Bowerbird Team",
  kind: "preview",
  priority: 50,
  extensions: ["md", "markdown", "mdown", "mkd", "mdwn", "mdt"],
  mimePrefixes: ["text/markdown", "text/x-markdown"],
  supportsZoom: true,
  Viewport: MarkdownViewport,
  InspectorPreview: MarkdownInspectorPreview,
});

export default markdownPreviewPlugin;
export { markdownPreviewPlugin as plugin };
