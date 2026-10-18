import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import {
  definePlugin,
  type PreviewPlugin,
  type PreviewViewportProps,
  type PreviewInspectorProps,
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
  onLinkClick?: (url: string) => void
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
            background: "rgba(120, 120, 140, 0.15)",
            color: "#e06c75",
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
      nodes.push(<strong key={`bold-${keyIdx++}`}>{boldMatch[1]}</strong>);
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
            color: "#60a5fa",
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
}: {
  body: string;
  onLinkClick: (url: string) => void;
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
            margin: "1rem 0",
            borderRadius: "8px",
            overflow: "hidden",
            border: "1px solid rgba(255, 255, 255, 0.1)",
            background: "rgba(18, 18, 22, 0.8)",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "0.4rem 0.8rem",
              background: "rgba(255, 255, 255, 0.04)",
              borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
              fontSize: "0.75rem",
              color: "#94a3b8",
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
          <pre
            style={{
              padding: "0.8rem 1rem",
              margin: 0,
              overflowX: "auto",
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
              fontSize: "0.85rem",
              lineHeight: 1.5,
              color: "#e2e8f0",
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
      const fontSizes = ["1.875rem", "1.5rem", "1.25rem", "1.1rem", "1rem", "0.9rem"];

      elements.push(
        <Tag
          id={id}
          key={`heading-${blockKey++}`}
          style={{
            fontSize: fontSizes[level - 1],
            fontWeight: 700,
            marginTop: level === 1 ? "1.5rem" : "1.25rem",
            marginBottom: "0.5rem",
            paddingBottom: level <= 2 ? "0.3rem" : undefined,
            borderBottom: level <= 2 ? "1px solid rgba(255, 255, 255, 0.1)" : undefined,
            color: "#f8fafc",
            scrollMarginTop: "2rem",
          }}
        >
          {renderInlineMarkdown(text, onLinkClick)}
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
            borderTop: "1px solid rgba(255, 255, 255, 0.12)",
            margin: "1.5rem 0",
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
            borderLeft: "4px solid #6366f1",
            background: "rgba(99, 102, 241, 0.08)",
            borderRadius: "0 6px 6px 0",
            color: "#cbd5e1",
            fontStyle: "italic",
          }}
        >
          {quoteLines.map((ql, qIdx) => (
            <p key={qIdx} style={{ margin: "0.25rem 0" }}>
              {renderInlineMarkdown(ql, onLinkClick)}
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
              border: "1px solid rgba(255, 255, 255, 0.1)",
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
                <tr style={{ background: "rgba(255, 255, 255, 0.05)" }}>
                  {headerRow.map((h, hIdx) => (
                    <th
                      key={hIdx}
                      style={{
                        padding: "0.6rem 0.8rem",
                        borderBottom: "1px solid rgba(255, 255, 255, 0.1)",
                        fontWeight: 600,
                        color: "#f1f5f9",
                      }}
                    >
                      {renderInlineMarkdown(h, onLinkClick)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {bodyRows.map((row, rIdx) => (
                  <tr
                    key={rIdx}
                    style={{
                      borderBottom: "1px solid rgba(255, 255, 255, 0.05)",
                      background: rIdx % 2 === 1 ? "rgba(255, 255, 255, 0.02)" : "transparent",
                    }}
                  >
                    {row.map((cell, cIdx) => (
                      <td
                        key={cIdx}
                        style={{
                          padding: "0.5rem 0.8rem",
                          color: "#cbd5e1",
                        }}
                      >
                        {renderInlineMarkdown(cell, onLinkClick)}
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
            margin: "0.5rem 0",
            paddingLeft: "1.5rem",
            color: "#e2e8f0",
            lineHeight: 1.6,
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
              <span>{renderInlineMarkdown(li.text, onLinkClick)}</span>
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
            margin: "0.6rem 0",
            lineHeight: 1.7,
            color: "#e2e8f0",
            fontSize: "0.95rem",
          }}
        >
          {renderInlineMarkdown(paraLines.join(" "), onLinkClick)}
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
}: PreviewViewportProps) {
  const [text, setText] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [showOutline, setShowOutline] = useState<boolean>(false);
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
  const outline = useMemo(() => extractOutline(body), [body]);

  const stats = useMemo(() => {
    const words = body.trim().split(/\s+/).filter(Boolean).length;
    const chars = body.length;
    const readTimeMinutes = Math.max(1, Math.ceil(words / 200));
    return { words, chars, readTimeMinutes };
  }, [body]);

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
        background: "#0c0d11",
        color: "#f1f5f9",
        overflow: "hidden",
        position: "relative",
      }}
    >
      {/* Header bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0.5rem 1rem",
          background: "rgba(255, 255, 255, 0.03)",
          borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
          fontSize: "0.75rem",
          color: "#94a3b8",
          userSelect: "none",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <span style={{ fontWeight: 600, color: "#f8fafc" }}>{item.name}</span>
          <span>•</span>
          <span>{stats.words.toLocaleString()} words</span>
          <span>•</span>
          <span>~{stats.readTimeMinutes} min read</span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          {outline.length > 0 && (
            <button
              onClick={() => setShowOutline(!showOutline)}
              style={{
                background: showOutline ? "rgba(99, 102, 241, 0.2)" : "rgba(255, 255, 255, 0.06)",
                border: "1px solid rgba(255, 255, 255, 0.1)",
                color: showOutline ? "#a5b4fc" : "#cbd5e1",
                padding: "3px 8px",
                borderRadius: "5px",
                cursor: "pointer",
                fontSize: "0.75rem",
              }}
            >
              Outline ({outline.length})
            </button>
          )}
          <button
            onClick={() => api.openWithDefaultApp()}
            style={{
              background: "rgba(255, 255, 255, 0.06)",
              border: "1px solid rgba(255, 255, 255, 0.1)",
              color: "#cbd5e1",
              padding: "3px 8px",
              borderRadius: "5px",
              cursor: "pointer",
              fontSize: "0.75rem",
            }}
          >
            Open in Editor
          </button>
          <button
            onClick={() => api.revealInFinder()}
            style={{
              background: "rgba(255, 255, 255, 0.06)",
              border: "1px solid rgba(255, 255, 255, 0.1)",
              color: "#cbd5e1",
              padding: "3px 8px",
              borderRadius: "5px",
              cursor: "pointer",
              fontSize: "0.75rem",
            }}
          >
            Reveal
          </button>
        </div>
      </div>

      {/* Main content body with outline side-panel */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        {/* Table of contents outline */}
        {showOutline && outline.length > 0 && (
          <div
            style={{
              width: "240px",
              borderRight: "1px solid rgba(255, 255, 255, 0.08)",
              background: "rgba(15, 17, 23, 0.95)",
              overflowY: "auto",
              padding: "1rem",
              fontSize: "0.8rem",
            }}
          >
            <div
              style={{
                fontWeight: 600,
                color: "#94a3b8",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                marginBottom: "0.75rem",
                fontSize: "0.7rem",
              }}
            >
              Document Outline
            </div>
            {outline.map((o, idx) => (
              <a
                key={idx}
                href={`#${o.id}`}
                onClick={(e) => {
                  e.preventDefault();
                  handleLinkClick(`#${o.id}`);
                }}
                style={{
                  display: "block",
                  padding: "0.25rem 0",
                  paddingLeft: `${(o.level - 1) * 0.75}rem`,
                  color: "#cbd5e1",
                  textDecoration: "none",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {o.text}
              </a>
            ))}
          </div>
        )}

        {/* Article scrollable container */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "2rem",
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
              <div style={{ textAlign: "center", padding: "4rem 0", color: "#94a3b8" }}>
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
                {/* Frontmatter card */}
                {frontmatter && Object.keys(frontmatter).length > 0 && (
                  <div
                    style={{
                      marginBottom: "1.5rem",
                      padding: "1rem",
                      borderRadius: "8px",
                      background: "rgba(255, 255, 255, 0.03)",
                      border: "1px solid rgba(255, 255, 255, 0.08)",
                      fontSize: "0.85rem",
                    }}
                  >
                    {frontmatter.title && (
                      <h1 style={{ margin: "0 0 0.5rem 0", fontSize: "1.5rem", color: "#f8fafc" }}>
                        {String(frontmatter.title)}
                      </h1>
                    )}
                    {frontmatter.description && (
                      <p style={{ margin: "0 0 0.5rem 0", color: "#94a3b8" }}>
                        {String(frontmatter.description)}
                      </p>
                    )}
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", marginTop: "0.5rem" }}>
                      {frontmatter.author && (
                        <span style={{ color: "#64748b" }}>By {String(frontmatter.author)}</span>
                      )}
                      {frontmatter.date && (
                        <span style={{ color: "#64748b" }}>• {String(frontmatter.date)}</span>
                      )}
                      {Array.isArray(frontmatter.tags) &&
                        frontmatter.tags.map((t, idx) => (
                          <span
                            key={idx}
                            style={{
                              background: "rgba(99, 102, 241, 0.15)",
                              color: "#818cf8",
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
                <MarkdownRenderer body={body} onLinkClick={handleLinkClick} />
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function MarkdownInspectorPreview({ item, api }: PreviewInspectorProps) {
  const [snippet, setSnippet] = useState<string>("");
  const [stats, setStats] = useState<{ words: number; lines: number }>({ words: 0, lines: 0 });

  useEffect(() => {
    let active = true;
    const fetchSnippet = async () => {
      try {
        const fileHandle = api.getOriginalFile();
        const text = fileHandle.fetchText
          ? await fileHandle.fetchText()
          : await (await fileHandle.fetchBlob()).text();
        if (active) {
          const lines = text.split("\n");
          const words = text.trim().split(/\s+/).filter(Boolean).length;
          setStats({ words, lines: lines.length });
          setSnippet(lines.slice(0, 8).join("\n"));
        }
      } catch {
        // Fallback silently in inspector preview
      }
    };
    fetchSnippet();
    return () => {
      active = false;
    };
  }, [item.id, api]);

  return (
    <div
      style={{
        padding: "0.85rem",
        background: "rgba(255, 255, 255, 0.02)",
        borderRadius: "8px",
        border: "1px solid rgba(255, 255, 255, 0.08)",
        fontSize: "0.8rem",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "0.5rem",
        }}
      >
        <span
          style={{
            fontWeight: 600,
            textTransform: "uppercase",
            fontSize: "0.7rem",
            color: "#818cf8",
            letterSpacing: "0.05em",
          }}
        >
          Markdown Document
        </span>
        <span style={{ color: "#64748b", fontSize: "0.75rem" }}>
          {stats.words} words • {stats.lines} lines
        </span>
      </div>

      <pre
        style={{
          margin: "0.5rem 0",
          padding: "0.6rem",
          background: "rgba(0, 0, 0, 0.3)",
          borderRadius: "6px",
          color: "#94a3b8",
          fontSize: "0.75rem",
          fontFamily: "monospace",
          overflow: "hidden",
          lineHeight: 1.4,
          maxHeight: "130px",
          maskImage: "linear-gradient(to bottom, black 70%, transparent 100%)",
          WebkitMaskImage: "linear-gradient(to bottom, black 70%, transparent 100%)",
        }}
      >
        {snippet || "Loading preview..."}
      </pre>

      <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.75rem" }}>
        <button
          onClick={() => api.openWithDefaultApp()}
          style={{
            flex: 1,
            padding: "0.35rem 0.5rem",
            background: "rgba(255, 255, 255, 0.06)",
            border: "1px solid rgba(255, 255, 255, 0.1)",
            borderRadius: "5px",
            color: "#e2e8f0",
            fontSize: "0.75rem",
            cursor: "pointer",
          }}
        >
          Edit
        </button>
        <button
          onClick={() => api.revealInFinder()}
          style={{
            flex: 1,
            padding: "0.35rem 0.5rem",
            background: "rgba(255, 255, 255, 0.06)",
            border: "1px solid rgba(255, 255, 255, 0.1)",
            borderRadius: "5px",
            color: "#e2e8f0",
            fontSize: "0.75rem",
            cursor: "pointer",
          }}
        >
          Reveal
        </button>
      </div>
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
