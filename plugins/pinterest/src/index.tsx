import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  definePlugin,
  type InspectorExtensionProps,
  type PluginContextMenuContext,
  type PluginContextMenuItem,
  type PluginItem,
  type PreviewPlugin,
} from "@bowerbird/plugin-sdk";
import {
  fetchTextViaBackend,
  parsePinterestInput,
  parsePinterestPinUrl,
  pinterestImageCandidates,
  resolveApiBase,
  resolvePinterestResolution,
  type PinterestInput,
} from "./pinterest";

/* -------------------------------------------------------------------------- */
/*                                   saving                                   */
/* -------------------------------------------------------------------------- */

interface SavedItem {
  id?: string;
  name?: string;
  filename?: string;
}

interface SaveApiResponse {
  status?: string;
  data?: SavedItem;
  message?: string;
  code?: string;
}

async function resolveInputCandidates(
  input: PinterestInput,
  item?: PluginItem,
): Promise<{ candidates: string[]; sourceUrl: string }> {
  if (input.kind === "image") {
    return {
      candidates: pinterestImageCandidates(input.url),
      sourceUrl: input.url,
    };
  }

  const apiBaseUrl = resolveApiBase(item);
  const resolution = await resolvePinterestResolution(input.pin.sourceUrl, {
    fetchText: (url, options) => fetchTextViaBackend(apiBaseUrl, url, options),
  });
  if (!resolution) {
    throw new Error("Could not resolve this Pinterest pin. Try the direct image URL instead.");
  }

  const candidates =
    resolution.candidates && resolution.candidates.length > 0
      ? resolution.candidates
      : resolution.url
        ? [resolution.url]
        : [];
  if (candidates.length === 0) {
    throw new Error("Pinterest returned no download candidates");
  }
  return {
    candidates,
    sourceUrl: resolution.sourceUrl || input.pin.sourceUrl,
  };
}

async function savePinterestInput(
  input: PinterestInput,
  item?: PluginItem,
): Promise<SavedItem> {
  const apiBaseUrl = resolveApiBase(item);
  const { candidates, sourceUrl } = await resolveInputCandidates(input, item);

  let lastError: unknown = null;
  for (const candidate of candidates) {
    try {
      const response = await fetch(`${apiBaseUrl}/api/item/addFromURL`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: candidate,
          website: sourceUrl,
          tags: ["pinterest"],
        }),
      });

      let payload: SaveApiResponse | null = null;
      try {
        payload = (await response.json()) as SaveApiResponse;
      } catch {
        // Keep the HTTP status as the failure message.
      }

      if (response.ok && payload?.status === "success" && payload.data) {
        return payload.data;
      }
      lastError = new Error(payload?.message || `Bowerbird returned HTTP ${response.status}`);
    } catch (err) {
      lastError = err;
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError || "Could not save image"));
}

/* -------------------------------------------------------------------------- */
/*                                   theme                                    */
/* -------------------------------------------------------------------------- */

interface Palette {
  text: string;
  muted: string;
  faint: string;
  border: string;
  surface: string;
  surfaceHover: string;
  input: string;
  panel: string;
  shadow: string;
  accent: string;
  accentText: string;
  danger: string;
  success: string;
  backdrop: string;
}

function palette(isDark: boolean): Palette {
  return {
    text: "var(--foreground, #0f172a)",
    muted: "var(--muted-foreground, #64748b)",
    faint: "var(--muted-foreground, #94a3b8)",
    border: "var(--border, rgba(15, 23, 42, 0.14))",
    surface: "var(--muted, rgba(15, 23, 42, 0.05))",
    surfaceHover: isDark ? "rgba(255,255,255,0.08)" : "rgba(15,23,42,0.06)",
    input: "var(--background, #ffffff)",
    panel: "var(--popover, #ffffff)",
    shadow: isDark
      ? "0 24px 64px -18px rgba(0,0,0,0.8)"
      : "0 24px 64px -18px rgba(15,23,42,0.32)",
    accent: "rgba(230, 0, 35, 0.12)",
    accentText: isDark ? "#ff8fa1" : "#c0001d",
    danger: "#ef4444",
    success: "#10b981",
    backdrop: isDark ? "rgba(0,0,0,0.64)" : "rgba(15,23,42,0.38)",
  };
}

function useTheme(api?: InspectorExtensionProps["api"]): boolean {
  const get = () => {
    if (api?.getTheme) return api.getTheme() === "dark";
    if (typeof document !== "undefined") {
      return document.documentElement.classList.contains("dark");
    }
    return false;
  };
  const [isDark, setIsDark] = useState(get);

  useEffect(() => {
    setIsDark(get());
    if (!api?.subscribeTheme) return;
    return api.subscribeTheme((theme) => setIsDark(theme === "dark"));
  }, [api]);

  return isDark;
}

/* -------------------------------------------------------------------------- */
/*                                  buttons                                   */
/* -------------------------------------------------------------------------- */

interface ActionButtonProps {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variant?: "primary" | "outline" | "ghost";
  colors: Palette;
  title?: string;
}

function ActionButton({
  children,
  onClick,
  disabled = false,
  variant = "outline",
  colors,
  title,
}: ActionButtonProps) {
  const [hovered, setHovered] = useState(false);
  const isPrimary = variant === "primary";

  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
        border: `1px solid ${isPrimary ? "transparent" : colors.border}`,
        borderRadius: 7,
        padding: "6px 11px",
        fontSize: 12,
        fontWeight: isPrimary ? 600 : 500,
        lineHeight: 1.2,
        cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.55 : 1,
        color: isPrimary ? "#ffffff" : colors.text,
        background: isPrimary
          ? hovered && !disabled
            ? "#d00020"
            : "#e60023"
          : hovered && !disabled
            ? colors.surfaceHover
            : "transparent",
        transition: "background 0.15s ease, border-color 0.15s ease, opacity 0.15s ease",
        fontFamily: "inherit",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/*                                 save dialog                                */
/* -------------------------------------------------------------------------- */

interface SaveDialogProps {
  initialUrl: string;
  item?: PluginItem;
  onClose: () => void;
}

function SaveDialog({ initialUrl, item, onClose }: SaveDialogProps) {
  const [url, setUrl] = useState(initialUrl);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<SavedItem | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const isDark = useTheme();
  const colors = useMemo(() => palette(isDark), [isDark]);

  const input = useMemo(() => parsePinterestInput(url), [url]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 30);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("keydown", onKeyDown, true);
    };
  }, [busy, onClose]);

  useEffect(() => {
    // Offer the clipboard URL when the menu was opened without a prefilled pin.
    if (initialUrl || typeof navigator === "undefined" || !navigator.clipboard?.readText) return;
    let canceled = false;
    navigator.clipboard
      .readText()
      .then((text) => {
        if (!canceled && text.trim() && parsePinterestInput(text)) {
          setUrl(text.trim());
        }
      })
      .catch(() => {
        // Clipboard access can be denied; the field is editable anyway.
      });
    return () => {
      canceled = true;
    };
  }, [initialUrl]);

  const submit = useCallback(async () => {
    if (!input || busy) {
      if (!input) setError("Paste a Pinterest pin URL (for example https://jp.pinterest.com/pin/…)");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await savePinterestInput(input, item);
      setSaved(result);
      window.setTimeout(onClose, 1100);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [busy, input, item, onClose]);

  const hint = input
    ? input.kind === "pin"
      ? input.pin.id
        ? `Pin ${input.pin.id} · ${input.pin.host}`
        : `Short link · ${input.pin.host}`
      : `Direct image · ${input.url.replace(/^https?:\/\//, "").slice(0, 64)}…`
    : "Pin pages are resolved to their 1200x image automatically.";

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
        background: colors.backdrop,
        backdropFilter: "blur(3px)",
        WebkitBackdropFilter: "blur(3px)",
        fontFamily:
          "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
      }}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Save Pinterest pin"
        style={{
          width: "min(470px, calc(100vw - 40px))",
          borderRadius: 16,
          border: `1px solid ${colors.border}`,
          background: colors.panel,
          color: colors.text,
          boxShadow: colors.shadow,
          overflow: "hidden",
        }}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div style={{ padding: "18px 18px 0" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 32,
                height: 32,
                borderRadius: 16,
                background: colors.accent,
                color: colors.accentText,
                fontWeight: 800,
                fontSize: 17,
                lineHeight: 1,
              }}
            >
              P
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 650, letterSpacing: -0.1 }}>
                Save Pinterest pin
              </div>
              <div style={{ marginTop: 2, fontSize: 11, color: colors.muted }}>
                The original image is saved into your active Bowerbird library.
              </div>
            </div>
          </div>

          <label
            htmlFor="bowerbird-pinterest-url"
            style={{
              display: "block",
              marginTop: 18,
              marginBottom: 6,
              fontSize: 11,
              fontWeight: 600,
              color: colors.muted,
            }}
          >
            Pin URL
          </label>
          <input
            id="bowerbird-pinterest-url"
            ref={inputRef}
            value={url}
            disabled={busy}
            spellCheck={false}
            autoComplete="off"
            placeholder="https://jp.pinterest.com/pin/973692381956656879/"
            onChange={(event) => {
              setUrl(event.target.value);
              setError(null);
              setSaved(null);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void submit();
              }
            }}
            style={{
              width: "100%",
              boxSizing: "border-box",
              height: 36,
              padding: "0 11px",
              borderRadius: 8,
              border: `1px solid ${error ? colors.danger : colors.border}`,
              background: colors.input,
              color: colors.text,
              fontSize: 12,
              outline: "none",
              fontFamily: "inherit",
            }}
          />
          <div
            style={{
              marginTop: 6,
              minHeight: 15,
              fontSize: 10.5,
              lineHeight: 1.4,
              color: input ? colors.faint : colors.muted,
              wordBreak: "break-all",
            }}
          >
            {hint}
          </div>

          {error ? (
            <div
              style={{
                marginTop: 10,
                padding: "7px 9px",
                borderRadius: 7,
                background: "rgba(239,68,68,0.10)",
                color: colors.danger,
                fontSize: 11,
                lineHeight: 1.45,
                wordBreak: "break-word",
              }}
            >
              {error}
            </div>
          ) : null}

          {saved ? (
            <div
              style={{
                marginTop: 10,
                padding: "7px 9px",
                borderRadius: 7,
                background: "rgba(16,185,129,0.12)",
                color: colors.success,
                fontSize: 11,
                lineHeight: 1.45,
              }}
            >
              Saved{saved.name ? ` “${saved.name}”` : " image"} to your library.
            </div>
          ) : null}
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
            gap: 8,
            marginTop: 16,
            padding: "12px 18px",
            borderTop: `1px solid ${colors.border}`,
            background: colors.surface,
          }}
        >
          <ActionButton colors={colors} onClick={onClose} disabled={busy}>
            Cancel
          </ActionButton>
          <ActionButton
            colors={colors}
            variant="primary"
            disabled={!input || busy || Boolean(saved)}
            onClick={() => void submit()}
          >
            {busy ? "Saving…" : saved ? "Saved" : "Save image"}
          </ActionButton>
        </div>
      </div>
    </div>
  );
}

interface CreateRootLike {
  render: (node: React.ReactNode) => void;
  unmount: () => void;
}

interface ReactDOMLike {
  createRoot?: (container: Element) => CreateRootLike;
}

/** Opens the self-contained save dialog in a body-level shadow root. */
function openSaveDialog(options: { initialUrl?: string; item?: PluginItem }) {
  if (typeof document === "undefined") return;
  const reactDOM = (window as unknown as { ReactDOM?: ReactDOMLike }).ReactDOM;
  if (!reactDOM?.createRoot) {
    console.warn("[PinterestPlugin] Host ReactDOM bridge is unavailable");
    return;
  }

  const host = document.createElement("div");
  host.style.cssText =
    "position:fixed;inset:0;z-index:2147483000;pointer-events:auto;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;";
  document.body.appendChild(host);

  const shadow = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = ":host{all:initial}*,*::before,*::after{box-sizing:border-box}";
  shadow.appendChild(style);

  const mount = document.createElement("div");
  shadow.appendChild(mount);

  const root = reactDOM.createRoot(mount);
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    try {
      root.unmount();
    } finally {
      host.remove();
    }
  };

  root.render(
    <SaveDialog
      initialUrl={options.initialUrl || ""}
      item={options.item}
      onClose={close}
    />,
  );
}

/* -------------------------------------------------------------------------- */
/*                              inspector panel                               */
/* -------------------------------------------------------------------------- */

function PinterestInspectorExtension({ item, isTrashView, api }: InspectorExtensionProps) {
  const isDark = useTheme(api);
  const colors = useMemo(() => palette(isDark), [isDark]);
  const pin = useMemo(() => parsePinterestPinUrl(item.url || ""), [item.url]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);

  useEffect(() => {
    setMessage(null);
  }, [item.id]);

  if (!pin) return null;

  const handleSave = async () => {
    const input = parsePinterestInput(item.url || "");
    if (!input) return;
    setBusy(true);
    setMessage(null);
    try {
      const saved = await savePinterestInput(input, item);
      setMessage({ text: saved.name ? `Saved “${saved.name}”` : "Image saved" });
    } catch (err) {
      setMessage({ text: err instanceof Error ? err.message : String(err), error: true });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ padding: "0.25rem 0" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
          padding: "0.375rem 0",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 7, minWidth: 0 }}>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: 18,
              height: 18,
              borderRadius: 9,
              background: colors.accent,
              color: colors.accentText,
              fontSize: 10,
              fontWeight: 800,
            }}
          >
            P
          </span>
          <span
            style={{
              fontSize: "0.625rem",
              fontWeight: 600,
              letterSpacing: "0.05em",
              textTransform: "uppercase",
              color: colors.muted,
            }}
          >
            Pinterest
          </span>
        </div>
        <span style={{ fontSize: 10, color: colors.faint }}>
          {pin.id ? `#${pin.id}` : "short link"}
        </span>
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 8,
          paddingBottom: 10,
        }}
      >
        <div style={{ display: "flex", gap: 6 }}>
          <ActionButton
            colors={colors}
            disabled={busy || Boolean(isTrashView)}
            onClick={() => void handleSave()}
            title="Download the Pinterest image into this library"
          >
            {busy ? "Saving…" : "Save image"}
          </ActionButton>
          <ActionButton
            colors={colors}
            variant="ghost"
            onClick={() => void api.openExternalURL(item.url)}
            title="Open this pin in your browser"
          >
            Open pin
          </ActionButton>
        </div>
        {isTrashView ? (
          <div style={{ fontSize: 10.5, color: colors.faint }}>Restore this item to save its pin image.</div>
        ) : null}
        {message ? (
          <div
            style={{
              fontSize: 10.5,
              lineHeight: 1.45,
              color: message.error ? colors.danger : colors.success,
              wordBreak: "break-word",
            }}
          >
            {message.text}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                                context menu                                */
/* -------------------------------------------------------------------------- */

function firstPinterestItem(ctx: PluginContextMenuContext): PluginItem | undefined {
  return (ctx.items || []).find((entry) => parsePinterestPinUrl(entry.url || ""));
}

const contextMenus: PluginContextMenuItem[] = [
  {
    id: "pinterest-save-url",
    label: "Save Pinterest Pin…",
    target: "general",
    icon: "pin",
    onClick: () => {
      openSaveDialog({});
    },
  },
  {
    id: "pinterest-save-from-item",
    label: "Save Pinterest Pin Image",
    target: "file",
    icon: "pin",
    hidden: (ctx) => !firstPinterestItem(ctx),
    onClick: (ctx) => {
      const item = firstPinterestItem(ctx);
      if (!item) return;
      openSaveDialog({ initialUrl: item.url || "", item });
    },
  },
];

/* -------------------------------------------------------------------------- */
/*                                plugin export                               */
/* -------------------------------------------------------------------------- */

const pinterestPlugin: PreviewPlugin = definePlugin({
  id: "official.pinterest",
  name: "Pinterest",
  version: "1.0.0",
  description:
    "Parse Pinterest pin URLs and save the original image into your Bowerbird library.",
  author: "Bowerbird Team",
  kind: "metadata",
  priority: 55,
  extensions: [],
  InspectorExtension: PinterestInspectorExtension,
  resolveUrl: (url, context) => resolvePinterestResolution(url, context),
  contextMenus,
});

export default pinterestPlugin;
export { pinterestPlugin as plugin };
