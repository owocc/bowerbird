import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  definePlugin,
  type PreviewPlugin,
  type InspectorExtensionProps,
  type PreviewPluginHostAPI,
  type ThemeMode,
} from "@bowerbird/plugin-sdk";

/** Maximum height (px) of the prompt read-out inside the inspector. */
const PREVIEW_MAX_HEIGHT = 120;
/** Maximum height (px) of the inline editor inside the inspector. */
const EDITOR_MAX_HEIGHT = 168;
/** Maximum height of the textarea rendered by the expanded dialog. */
const DIALOG_EDITOR_MAX_HEIGHT = "52vh";
/** The dialog is portaled to <body> and must sit above every host surface. */
const DIALOG_Z_INDEX = 2147483000;
/** How long the "Copied" confirmation stays visible. */
const COPIED_RESET_MS = 1600;

/* ------------------------------------------------------------------ */
/* i18n (the plugin bundle cannot reach the host i18n instance)        */
/* ------------------------------------------------------------------ */

type Locale = "zh" | "en";

interface PromptLabels {
  title: string;
  copy: string;
  copied: string;
  edit: string;
  done: string;
  cancel: string;
  expand: string;
  collapse: string;
  add: string;
  empty: string;
  placeholder: string;
  saveHint: string;
  readonly: string;
  dialogTitle: string;
  close: string;
}

const LABELS: Record<Locale, PromptLabels> = {
  en: {
    title: "AI Prompt",
    copy: "Copy",
    copied: "Copied",
    edit: "Edit",
    done: "Done",
    cancel: "Cancel",
    expand: "Expand",
    collapse: "Collapse",
    add: "Add AI prompt",
    empty: "No prompt",
    placeholder: "Paste or type the AI generation prompt (Midjourney, Stable Diffusion, DALL-E, ...)",
    saveHint: "⌘/Ctrl + Enter to save · Esc to cancel",
    readonly: "Read-only",
    dialogTitle: "AI Prompt",
    close: "Close",
  },
  zh: {
    title: "AI 提示词",
    copy: "复制",
    copied: "已复制",
    edit: "编辑",
    done: "完成",
    cancel: "取消",
    expand: "展开",
    collapse: "收起",
    add: "添加提示词",
    empty: "暂无提示词",
    placeholder: "粘贴或输入 AI 生图提示词（Midjourney、Stable Diffusion、DALL-E…）",
    saveHint: "⌘/Ctrl + Enter 保存 · Esc 取消",
    readonly: "只读",
    dialogTitle: "AI 提示词",
    close: "关闭",
  },
};

function detectLocale(): Locale {
  if (typeof navigator === "undefined") return "en";
  const languages =
    navigator.languages && navigator.languages.length > 0 ? navigator.languages : [navigator.language];
  const primary = (languages[0] || "").toLowerCase();
  return primary.startsWith("zh") ? "zh" : "en";
}

/* ------------------------------------------------------------------ */
/* theme                                                              */
/* ------------------------------------------------------------------ */

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

/**
 * Host design tokens (`--border`, `--foreground`, ...) are preferred so the
 * extension always blends with the host surface; the theme-aware hex values are
 * only fallbacks for hosts that do not define those variables.
 */
interface PromptPalette {
  divider: string;
  text: string;
  textMuted: string;
  textFaint: string;
  accentSoft: string;
  accentText: string;
  surface: string;
  surfaceHover: string;
  inputBackground: string;
  inputBorder: string;
  panel: string;
  panelBorder: string;
  shadow: string;
  success: string;
  backdrop: string;
}

function createPalette(isDark: boolean): PromptPalette {
  const fallbackBorder = isDark ? "rgba(255, 255, 255, 0.10)" : "#e2e8f0";
  const fallbackText = isDark ? "#e8eaf0" : "#0f172a";
  const fallbackMuted = isDark ? "#9aa3b2" : "#64748b";
  const fallbackFaint = isDark ? "#6b7280" : "#94a3b8";
  const fallbackSurface = isDark ? "rgba(255, 255, 255, 0.04)" : "#f8fafc";
  const fallbackInputBg = isDark ? "rgba(0, 0, 0, 0.28)" : "#ffffff";
  const fallbackPanel = isDark ? "#14161a" : "#ffffff";

  return {
    divider: `var(--border, ${fallbackBorder})`,
    text: `var(--foreground, ${fallbackText})`,
    textMuted: `var(--muted-foreground, ${fallbackMuted})`,
    textFaint: `var(--muted-foreground, ${fallbackFaint})`,
    accentSoft: isDark ? "rgba(129, 140, 248, 0.16)" : "rgba(79, 70, 229, 0.10)",
    accentText: isDark ? "#c7d2fe" : "#4338ca",
    surface: `var(--muted, ${fallbackSurface})`,
    surfaceHover: isDark ? "rgba(255, 255, 255, 0.08)" : "rgba(15, 23, 42, 0.06)",
    inputBackground: `var(--background, ${fallbackInputBg})`,
    inputBorder: `var(--border, ${fallbackBorder})`,
    panel: `var(--popover, ${fallbackPanel})`,
    panelBorder: `var(--border, ${fallbackBorder})`,
    shadow: isDark
      ? "0 24px 60px -12px rgba(0, 0, 0, 0.75)"
      : "0 24px 60px -16px rgba(15, 23, 42, 0.30)",
    success: "#10b981",
    backdrop: isDark ? "rgba(0, 0, 0, 0.62)" : "rgba(15, 23, 42, 0.42)",
  };
}

/* ------------------------------------------------------------------ */
/* helpers                                                            */
/* ------------------------------------------------------------------ */

async function copyText(value: string): Promise<boolean> {
  if (!value) return false;
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch {
    // Fall through to the legacy path (insecure context / denied permission).
  }
  try {
    if (typeof document === "undefined") return false;
    const helper = document.createElement("textarea");
    helper.value = value;
    helper.setAttribute("readonly", "");
    helper.style.position = "fixed";
    helper.style.top = "-1000px";
    helper.style.opacity = "0";
    document.body.appendChild(helper);
    helper.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(helper);
    return ok;
  } catch {
    return false;
  }
}

interface ReactDOMBridge {
  createPortal?: (children: React.ReactNode, container: Element) => React.ReactNode;
}

/**
 * Renders into <body> so the dialog escapes the inspector's scroll container.
 * The host exposes ReactDOM on `window` for remote plugins; when that bridge is
 * unavailable we fall back to inline rendering (position: fixed still works).
 */
function renderPortal(node: React.ReactNode): React.ReactNode {
  if (typeof window === "undefined" || typeof document === "undefined") return node;
  const bridge = (window as unknown as { ReactDOM?: ReactDOMBridge }).ReactDOM;
  if (bridge?.createPortal && document.body) {
    try {
      return bridge.createPortal(node, document.body);
    } catch {
      // Ignore and use the inline fallback.
    }
  }
  return node;
}

/* ------------------------------------------------------------------ */
/* icons                                                              */
/* ------------------------------------------------------------------ */

interface IconProps {
  size?: number;
  color?: string;
}

function CopyIcon({ size = 12, color = "currentColor" }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function CheckIcon({ size = 12, color = "currentColor" }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function ChevronIcon({
  size = 14,
  color = "currentColor",
  collapsed = false,
}: IconProps & { collapsed?: boolean }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{ transform: collapsed ? "rotate(0deg)" : "rotate(180deg)", transition: "transform 0.18s ease" }}
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

function ExpandIcon({ size = 12, color = "currentColor" }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="15 3 21 3 21 9" />
      <polyline points="9 21 3 21 3 15" />
      <line x1="21" y1="3" x2="14" y2="10" />
      <line x1="3" y1="21" x2="10" y2="14" />
    </svg>
  );
}

function EditIcon({ size = 12, color = "currentColor" }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}

function CloseIcon({ size = 14, color = "currentColor" }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* ActionButton                                                       */
/* ------------------------------------------------------------------ */

interface ActionButtonProps {
  palette: PromptPalette;
  children: React.ReactNode;
  onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void;
  onMouseDown?: (event: React.MouseEvent<HTMLButtonElement>) => void;
  disabled?: boolean;
  title?: string;
  ariaLabel?: string;
  color?: string;
  variant?: "ghost" | "primary" | "outline";
}

function ActionButton({
  palette,
  children,
  onClick,
  onMouseDown,
  disabled = false,
  title,
  ariaLabel,
  color,
  variant = "ghost",
}: ActionButtonProps) {
  const [hovered, setHovered] = useState(false);

  const base: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "4px",
    borderRadius: "5px",
    fontSize: "0.68rem",
    lineHeight: 1.15,
    fontFamily: "inherit",
    whiteSpace: "nowrap",
    transition: "background 0.15s ease, color 0.15s ease, border-color 0.15s ease",
    cursor: disabled ? "default" : "pointer",
    opacity: disabled ? 0.5 : 1,
    padding: variant === "primary" ? "4px 10px" : "3px 6px",
    border:
      variant === "ghost"
        ? "1px solid transparent"
        : `1px solid ${palette.inputBorder}`,
    fontWeight: variant === "primary" ? 600 : 400,
  };

  const variantStyle: React.CSSProperties =
    variant === "primary"
      ? { background: palette.accentSoft, color: palette.accentText }
      : {
          background: hovered && !disabled ? palette.surfaceHover : "transparent",
          color: color || (hovered && !disabled ? palette.text : palette.textMuted),
        };

  return (
    <button
      type="button"
      onClick={onClick}
      onMouseDown={onMouseDown}
      disabled={disabled}
      title={title}
      aria-label={ariaLabel || title}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ ...base, ...variantStyle }}
    >
      {children}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Expanded dialog                                                    */
/*                                                                    */
/* The host does not expose a public Dialog registry today, so the    */
/* plugin ships a self-contained overlay (portal + focus + Esc).      */
/* ------------------------------------------------------------------ */

interface PromptDialogProps {
  open: boolean;
  labels: PromptLabels;
  palette: PromptPalette;
  value: string;
  readOnly: boolean;
  copied: boolean;
  onChange: (next: string) => void;
  onCopy: () => void;
  onClose: () => void;
}

function PromptDialog({
  open,
  labels,
  palette,
  value,
  readOnly,
  copied,
  onChange,
  onCopy,
  onClose,
}: PromptDialogProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const closeRef = useRef(onClose);

  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        closeRef.current();
      }
    };
    document.addEventListener("keydown", handleKeyDown, true);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusTimer = window.setTimeout(() => {
      const element = textareaRef.current;
      if (!element) return;
      element.focus();
      if (readOnly) return;
      element.setSelectionRange(element.value.length, element.value.length);
    }, 30);

    return () => {
      document.removeEventListener("keydown", handleKeyDown, true);
      document.body.style.overflow = previousOverflow;
      window.clearTimeout(focusTimer);
    };
  }, [open, readOnly]);

  if (!open) return null;

  const backdropStyle: React.CSSProperties = {
    position: "fixed",
    inset: 0,
    zIndex: DIALOG_Z_INDEX,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "24px",
    background: palette.backdrop,
    backdropFilter: "blur(3px)",
    WebkitBackdropFilter: "blur(3px)",
  };

  const panelStyle: React.CSSProperties = {
    display: "flex",
    flexDirection: "column",
    width: "min(760px, 94vw)",
    maxHeight: "82vh",
    borderRadius: "12px",
    border: `1px solid ${palette.panelBorder}`,
    background: palette.panel,
    boxShadow: palette.shadow,
    overflow: "hidden",
  };

  return (
    <>
      {renderPortal(
        <div
          style={backdropStyle}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) onClose();
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={labels.dialogTitle}
            style={panelStyle}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "0.75rem",
                padding: "0.7rem 0.9rem",
                borderBottom: `1px solid ${palette.divider}`,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", minWidth: 0 }}>
                <span style={{ fontSize: "0.82rem", fontWeight: 650, color: palette.text }}>
                  {labels.dialogTitle}
                </span>
                {readOnly && (
                  <span style={{ fontSize: "0.65rem", color: palette.textFaint }}>{labels.readonly}</span>
                )}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
                <ActionButton
                  palette={palette}
                  variant="outline"
                  onClick={onCopy}
                  disabled={!value.trim()}
                  title={copied ? labels.copied : labels.copy}
                  color={copied ? palette.success : undefined}
                >
                  {copied ? <CheckIcon color={palette.success} /> : <CopyIcon />}
                </ActionButton>
                <ActionButton palette={palette} onClick={onClose} title={labels.close} ariaLabel={labels.close}>
                  <CloseIcon />
                </ActionButton>
              </div>
            </div>

            <div style={{ padding: "0.7rem 0.9rem", overflow: "hidden", display: "flex", flex: 1, minHeight: 0 }}>
              <textarea
                ref={textareaRef}
                value={value}
                readOnly={readOnly}
                onChange={(event) => onChange(event.target.value)}
                onKeyDown={(event) => {
                  if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                    event.preventDefault();
                    onClose();
                  }
                }}
                placeholder={labels.placeholder}
                spellCheck={false}
                style={{
                  flex: 1,
                  width: "100%",
                  boxSizing: "border-box",
                  minHeight: "220px",
                  maxHeight: DIALOG_EDITOR_MAX_HEIGHT,
                  borderRadius: "8px",
                  border: `1px solid ${palette.inputBorder}`,
                  background: palette.surface,
                  color: palette.text,
                  padding: "0.65rem 0.75rem",
                  fontSize: "0.76rem",
                  lineHeight: 1.55,
                  resize: "none",
                  outline: "none",
                  overflowY: "auto",
                  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                }}
              />
            </div>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "0.75rem",
                padding: "0.55rem 0.9rem",
                borderTop: `1px solid ${palette.divider}`,
                background: palette.surface,
              }}
            >
              <span style={{ fontSize: "0.65rem", color: palette.textFaint }}>
                {readOnly ? labels.readonly : labels.saveHint}
              </span>
              <ActionButton palette={palette} variant="primary" onClick={onClose}>
                {labels.done}
              </ActionButton>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Inspector extension                                                */
/* ------------------------------------------------------------------ */

function PromptInspectorExtension({ item, isTrashView, api, theme: propTheme }: InspectorExtensionProps) {
  const theme = usePluginTheme(propTheme, api);
  const palette = useMemo(() => createPalette(theme === "dark"), [theme]);
  const labels = useMemo(() => LABELS[detectLocale()], []);

  const readOnly = Boolean(isTrashView);
  const [promptValue, setPromptValue] = useState<string>(item.prompt || "");
  const [expanded, setExpanded] = useState<boolean>(true);
  const [editing, setEditing] = useState<boolean>(false);
  const [dialogOpen, setDialogOpen] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);
  const [overflowing, setOverflowing] = useState<boolean>(false);
  const [headerHovered, setHeaderHovered] = useState<boolean>(false);

  const previewRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<HTMLTextAreaElement | null>(null);
  const copiedTimerRef = useRef<number | null>(null);

  useEffect(() => {
    setPromptValue(item.prompt || "");
  }, [item.id, item.prompt]);

  // Close transient UI when the host switches to another item.
  useEffect(() => {
    setEditing(false);
    setDialogOpen(false);
  }, [item.id]);

  useEffect(() => {
    return () => {
      if (copiedTimerRef.current !== null) {
        window.clearTimeout(copiedTimerRef.current);
      }
    };
  }, []);

  const commitPrompt = useCallback(
    async (next?: string) => {
      const value = next ?? promptValue;
      if (readOnly) return;
      if (value === (item.prompt || "")) return;
      try {
        await api.updateItemDetails({ prompt: value });
      } catch (err) {
        console.error("[PromptPlugin] Failed to save prompt:", err);
      }
    },
    [api, item.prompt, promptValue, readOnly],
  );

  // Last-chance save: the inspector unmounts when the detail panel closes and a
  // focused textarea does not fire `blur` in that case.
  const pendingRef = useRef({ itemId: item.id, value: promptValue, saved: item.prompt || "" });
  pendingRef.current = { itemId: item.id, value: promptValue, saved: item.prompt || "" };
  const updateDetailsRef = useRef(api.updateItemDetails);
  updateDetailsRef.current = api.updateItemDetails;

  useEffect(() => {
    const mountedItemId = item.id;
    return () => {
      const pending = pendingRef.current;
      if (pending.itemId !== mountedItemId) return;
      if (pending.value === pending.saved) return;
      void updateDetailsRef.current({ prompt: pending.value });
    };
  }, [item.id]);

  const handleCopy = useCallback(async () => {
    if (!promptValue.trim()) return;
    const ok = await copyText(promptValue);
    if (!ok) {
      console.warn("[PromptPlugin] Failed to copy prompt to clipboard");
      return;
    }
    setCopied(true);
    if (copiedTimerRef.current !== null) {
      window.clearTimeout(copiedTimerRef.current);
    }
    copiedTimerRef.current = window.setTimeout(() => {
      setCopied(false);
      copiedTimerRef.current = null;
    }, COPIED_RESET_MS);
  }, [promptValue]);

  // Only advertise "Expand" when the read-out is actually clipped.
  useEffect(() => {
    if (!expanded || editing) {
      setOverflowing(false);
      return;
    }
    const element = previewRef.current;
    if (!element) return;
    const measure = () => setOverflowing(element.scrollHeight - element.clientHeight > 2);
    measure();
    if (typeof ResizeObserver !== "undefined") {
      const observer = new ResizeObserver(measure);
      observer.observe(element);
      return () => observer.disconnect();
    }
    return undefined;
  }, [expanded, editing, promptValue]);

  const startEditing = useCallback(() => {
    if (readOnly) return;
    setEditing(true);
    window.setTimeout(() => {
      const element = editorRef.current;
      if (!element) return;
      element.focus();
      element.setSelectionRange(element.value.length, element.value.length);
    }, 20);
  }, [readOnly]);

  const stopEditing = useCallback(() => {
    setEditing(false);
    void commitPrompt();
  }, [commitPrompt]);

  const cancelEditing = useCallback(() => {
    setPromptValue(item.prompt || "");
    setEditing(false);
  }, [item.prompt]);

  const openDialog = useCallback(() => setDialogOpen(true), []);

  const closeDialog = useCallback(() => {
    setDialogOpen(false);
    void commitPrompt();
  }, [commitPrompt]);

  const hasPrompt = promptValue.trim().length > 0;

  // Sidebar is narrow: no hint text, actions only, right aligned.
  const footerStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: "0.3rem",
    minHeight: "22px",
  };

  const editorStyle: React.CSSProperties = {
    width: "100%",
    boxSizing: "border-box",
    minHeight: "72px",
    maxHeight: `${EDITOR_MAX_HEIGHT}px`,
    borderRadius: "6px",
    border: `1px solid ${palette.inputBorder}`,
    background: palette.inputBackground,
    color: palette.text,
    padding: "0.45rem 0.55rem",
    fontSize: "0.72rem",
    lineHeight: 1.5,
    resize: "none",
    outline: "none",
    overflowY: "auto",
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
  };

  return (
    // No local dividers: the host accordion container already draws `divide-y`,
    // so the extension only mirrors its vertical rhythm (`py-1`).
    <div style={{ padding: "0.25rem 0" }}>
      {/* Header: label only (no leading icon), actions on the right. */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "0.5rem",
          padding: "0.375rem 0",
          cursor: "pointer",
          userSelect: "none",
        }}
        onClick={() => setExpanded((prev) => !prev)}
        onMouseEnter={() => setHeaderHovered(true)}
        onMouseLeave={() => setHeaderHovered(false)}
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            setExpanded((prev) => !prev);
          }
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", minWidth: 0 }}>
          <span
            style={{
              fontSize: "0.625rem",
              fontWeight: 600,
              letterSpacing: "0.05em",
              textTransform: "uppercase",
              color: headerHovered ? palette.text : palette.textMuted,
              whiteSpace: "nowrap",
              transition: "color 0.15s ease",
            }}
          >
            {labels.title}
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "0.15rem" }}>
          <ActionButton
            palette={palette}
            onClick={(event) => {
              event.stopPropagation();
              void handleCopy();
            }}
            disabled={!hasPrompt}
            title={copied ? labels.copied : labels.copy}
            color={copied ? palette.success : undefined}
          >
            {copied ? <CheckIcon color={palette.success} /> : <CopyIcon />}
          </ActionButton>

          {hasPrompt && expanded && (
            <ActionButton
              palette={palette}
              onClick={(event) => {
                event.stopPropagation();
                openDialog();
              }}
              title={labels.expand}
            >
              <ExpandIcon />
            </ActionButton>
          )}

          <ActionButton
            palette={palette}
            onClick={(event) => {
              event.stopPropagation();
              setExpanded((prev) => !prev);
            }}
            title={expanded ? labels.collapse : labels.expand}
          >
            <ChevronIcon collapsed={!expanded} color={palette.textFaint} />
          </ActionButton>
        </div>
      </div>

      {expanded && (
        <div style={{ padding: "0 0 0.625rem 0", display: "flex", flexDirection: "column", gap: "0.45rem" }}>
          {editing ? (
            <>
              <textarea
                ref={editorRef}
                value={promptValue}
                onChange={(event) => setPromptValue(event.target.value)}
                onBlur={stopEditing}
                onKeyDown={(event) => {
                  if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                    event.preventDefault();
                    stopEditing();
                  } else if (event.key === "Escape") {
                    event.preventDefault();
                    cancelEditing();
                  }
                }}
                placeholder={labels.placeholder}
                spellCheck={false}
                style={editorStyle}
              />
              <div style={footerStyle}>
                  <ActionButton
                    palette={palette}
                    onClick={(event) => {
                      event.preventDefault();
                      cancelEditing();
                    }}
                    onMouseDown={(event) => {
                      // Keep focus so the textarea blur handler cannot save the edit.
                      event.preventDefault();
                      cancelEditing();
                    }}
                  >
                    {labels.cancel}
                  </ActionButton>
                  <ActionButton
                    palette={palette}
                    variant="primary"
                    onClick={(event) => {
                      event.preventDefault();
                      stopEditing();
                    }}
                    onMouseDown={(event) => {
                      event.preventDefault();
                      stopEditing();
                    }}
                  >
                    {labels.done}
                  </ActionButton>
              </div>
            </>
          ) : hasPrompt ? (
            <>
              <div
                ref={previewRef}
                onDoubleClick={openDialog}
                style={{
                  maxHeight: `${PREVIEW_MAX_HEIGHT}px`,
                  overflowY: "auto",
                  overscrollBehavior: "contain",
                  borderRadius: "6px",
                  border: `1px solid ${palette.inputBorder}`,
                  background: palette.surface,
                  padding: "0.45rem 0.55rem",
                  fontSize: "0.72rem",
                  lineHeight: 1.5,
                  color: palette.text,
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                }}
              >
                {promptValue}
              </div>
              {(overflowing || !readOnly) && (
                <div style={footerStyle}>
                  {overflowing && (
                    <ActionButton palette={palette} onClick={openDialog}>
                      <ExpandIcon />
                      <span>{labels.expand}</span>
                    </ActionButton>
                  )}
                  {!readOnly && (
                    <ActionButton palette={palette} onClick={startEditing}>
                      <EditIcon />
                      <span>{labels.edit}</span>
                    </ActionButton>
                  )}
                </div>
              )}
            </>
          ) : (
            <button
              type="button"
              onClick={readOnly ? undefined : startEditing}
              disabled={readOnly}
              style={{
                width: "100%",
                boxSizing: "border-box",
                padding: "0.6rem 0.55rem",
                borderRadius: "6px",
                border: `1px dashed ${palette.inputBorder}`,
                background: "transparent",
                color: palette.textFaint,
                fontSize: "0.72rem",
                textAlign: "left",
                cursor: readOnly ? "default" : "pointer",
                fontFamily: "inherit",
              }}
            >
              {readOnly ? labels.empty : labels.add}
            </button>
          )}
        </div>
      )}

      <PromptDialog
        open={dialogOpen}
        labels={labels}
        palette={palette}
        value={promptValue}
        readOnly={readOnly}
        copied={copied}
        onChange={setPromptValue}
        onCopy={() => void handleCopy()}
        onClose={closeDialog}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* plugin definition                                                  */
/* ------------------------------------------------------------------ */

export const PLUGIN_VERSION = "1.0.1";

const promptMetadataPlugin: PreviewPlugin = definePlugin({
  id: "official.prompt-metadata",
  name: "AI Prompt Metadata",
  version: PLUGIN_VERSION,
  description:
    "Extends asset metadata with a dedicated Prompt field for recording and searching AI generation prompts.",
  author: "Bowerbird Team",
  kind: "metadata",
  priority: 50,
  InspectorExtension: PromptInspectorExtension,
});

export default promptMetadataPlugin;
export { promptMetadataPlugin as plugin };
