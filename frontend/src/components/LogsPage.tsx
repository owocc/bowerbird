import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { default as Terminal } from "~icons/ri/terminal-line";
import { default as Search } from "~icons/ri/search-line";
import { default as Trash2 } from "~icons/ri/delete-bin-line";
import { default as Copy } from "~icons/ri/file-copy-line";
import { default as Check } from "~icons/ri/check-line";
import { default as FolderOpen } from "~icons/ri/folder-open-line";
import { default as Pause } from "~icons/ri/pause-line";
import { default as Play } from "~icons/ri/play-line";
import { default as RefreshCw } from "~icons/ri/refresh-line";
import { default as X } from "~icons/ri/close-line";
import { default as AlertTriangle } from "~icons/ri/alert-line";
import { default as AlertCircle } from "~icons/ri/error-warning-line";
import { default as Info } from "~icons/ri/information-line";
import { default as Gauge } from "~icons/ri/speed-line";
import { useTranslation } from "react-i18next";
import { Events } from "@/lib/host-runtime";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { MacTrafficLightSpacer } from "@/components/MacTrafficLightSpacer";
import {
  GetLogs,
  ClearLogs,
  GetLogFilePath,
  RevealLogFile,
} from "../../bindings/bowerbird/core/service";
import type { LogEntry } from "../../bindings/bowerbird/core/models";
import { copyTextToClipboard } from "@/lib/clipboard";
import { cn } from "@/lib/utils";
import { notifySuccess } from "@/lib/notify";
import { SuccessCodes } from "@/lib/error-codes";

type LevelFilter = "all" | "info" | "perf" | "warn" | "error";

function extractEventEntry(event: unknown): LogEntry | null {
  if (!event || typeof event !== "object") return null;
  if ("data" in event && event.data && typeof event.data === "object") {
    return event.data as LogEntry;
  }
  if ("id" in event && "message" in event) {
    return event as LogEntry;
  }
  return null;
}

export function LogsPage() {
  const { t } = useTranslation();
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [logFilePath, setLogFilePath] = useState<string>("");
  const [search, setSearch] = useState("");
  const [levelFilter, setLevelFilter] = useState<LevelFilter>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [autoScroll, setAutoScroll] = useState(true);
  const [paused, setPaused] = useState(false);
  const [copied, setCopied] = useState(false);

  const pausedRef = useRef(paused);
  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const fetchLogs = useCallback(async () => {
    try {
      const [entries, filePath] = await Promise.all([
        GetLogs(),
        GetLogFilePath(),
      ]);
      setLogs(entries ?? []);
      if (filePath) setLogFilePath(filePath);
    } catch (err) {
      console.error("Failed to fetch logs:", err);
    }
  }, []);

  useEffect(() => {
    void fetchLogs();

    const unsubEntry = Events.On("app-log-entry", (event: unknown) => {
      if (pausedRef.current) return;
      const entry = extractEventEntry(event);
      if (!entry) return;
      setLogs((prev) => {
        if (prev.length > 0 && prev[prev.length - 1].id === entry.id) {
          return prev;
        }
        const next = [...prev, entry];
        return next.length > 1000 ? next.slice(next.length - 800) : next;
      });
    });

    const unsubCleared = Events.On("app-logs-cleared", () => {
      setLogs([]);
    });

    return () => {
      unsubEntry();
      unsubCleared();
    };
  }, [fetchLogs]);

  const categories = useMemo(() => {
    const seen: Record<string, true> = { core: true, perf: true, ui: true, drag: true };
    for (const entry of logs) {
      if (entry.category) seen[entry.category] = true;
    }
    return ["all", ...Object.keys(seen)];
  }, [logs]);

  const filteredLogs = useMemo(() => {
    const q = search.trim().toLowerCase();
    return logs.filter((entry) => {
      if (levelFilter !== "all" && entry.level !== levelFilter) {
        return false;
      }
      if (categoryFilter !== "all" && entry.category !== categoryFilter) {
        return false;
      }
      if (q) {
        const hay = `${entry.message} ${entry.detail || ""} ${entry.category} ${entry.level}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [logs, levelFilter, categoryFilter, search]);

  useEffect(() => {
    if (!autoScroll || paused) return;
    const el = scrollContainerRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [filteredLogs.length, autoScroll, paused]);

  const counts = useMemo(() => {
    let info = 0;
    let perf = 0;
    let warn = 0;
    let error = 0;
    for (const l of logs) {
      if (l.level === "perf") perf++;
      else if (l.level === "warn") warn++;
      else if (l.level === "error") error++;
      else info++;
    }
    return { all: logs.length, info, perf, warn, error };
  }, [logs]);

  const handleCopyAll = async () => {
    const lines = filteredLogs.map((l) => {
      const dur = l.durationMs && l.durationMs > 0 ? ` (${l.durationMs}ms)` : "";
      const det = l.detail ? ` — ${l.detail}` : "";
      return `${l.timestamp} [${l.level.toUpperCase()}][${l.category}] ${l.message}${dur}${det}`;
    });
    const ok = await copyTextToClipboard(lines.join("\n"));
    if (ok) {
      setCopied(true);
      notifySuccess(SuccessCodes.COPIED_LOGS, { count: filteredLogs.length });
      window.setTimeout(() => setCopied(false), 1500);
    }
  };

  const handleClear = async () => {
    try {
      await ClearLogs();
      await fetchLogs();
    } catch (err) {
      console.error("Failed to clear logs:", err);
    }
  };

  const handleRevealFile = async () => {
    try {
      await RevealLogFile();
    } catch (err) {
      console.error("Failed to reveal log file:", err);
    }
  };

  const renderLevelBadge = (level: string) => {
    switch (level) {
      case "error":
        return (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold uppercase bg-destructive/15 text-destructive border border-destructive/30">
            <AlertCircle className="size-2.5" />
            ERR
          </span>
        );
      case "warn":
        return (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold uppercase bg-amber-500/15 text-amber-500 border border-amber-500/30">
            <AlertTriangle className="size-2.5" />
            WARN
          </span>
        );
      case "perf":
        return (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold uppercase bg-emerald-500/15 text-emerald-500 border border-emerald-500/30">
            <Gauge className="size-2.5" />
            PERF
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold uppercase bg-sky-500/15 text-sky-500 border border-sky-500/30">
            <Info className="size-2.5" />
            INFO
          </span>
        );
    }
  };

  return (
    <div
      data-slot="page-root"
      className="h-screen w-screen overflow-hidden flex flex-col text-foreground antialiased select-none"
    >
      {/* Top Window Titlebar */}
      <header className="h-(--titlebar-height) px-3 border-b border-border/60 bg-sidebar flex items-center justify-between gap-2 shrink-0 wails-no-drag">
        <div className="flex items-center gap-2 min-w-0 header-interactive-container wails-no-drag">
          <MacTrafficLightSpacer className="w-[72px] h-(--titlebar-height) shrink-0" />
          <div className="flex items-center gap-2">
            <div className="size-6 rounded-md bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <Terminal className="size-3.5" />
            </div>
            <span className="text-xs font-semibold tracking-tight text-foreground truncate">
              {t("logs.title")}
            </span>
            <Badge
              variant="secondary"
              className="text-[10px] font-mono px-1.5 py-0 h-4"
            >
              {filteredLogs.length} / {logs.length}
            </Badge>
          </div>
        </div>

        <div className="flex-1 h-full min-w-4 wails-drag" />

        {/* Right Controls */}
        <div className="flex items-center gap-1.5 shrink-0 header-interactive-container wails-no-drag">
          <Button
            type="button"
            variant="outline"
            size="xs"
            onClick={() => setPaused((v) => !v)}
            className={cn(
              "h-7 text-xs gap-1 cursor-pointer",
              paused && "border-amber-500/50 text-amber-500 bg-amber-500/10"
            )}
          >
            {paused ? <Play className="size-3" /> : <Pause className="size-3" />}
            <span>{paused ? t("logs.resume") : t("logs.pause")}</span>
          </Button>

          <Button
            type="button"
            variant="outline"
            size="xs"
            onClick={() => void fetchLogs()}
            title={t("logs.refresh")}
            className="h-7 text-xs gap-1 cursor-pointer"
          >
            <RefreshCw className="size-3" />
            <span>{t("logs.refresh")}</span>
          </Button>

          <Button
            type="button"
            variant="outline"
            size="xs"
            onClick={handleCopyAll}
            disabled={filteredLogs.length === 0}
            className="h-7 text-xs gap-1 cursor-pointer"
          >
            {copied ? (
              <Check className="size-3 text-emerald-500" />
            ) : (
              <Copy className="size-3" />
            )}
            <span>{t("logs.copy")}</span>
          </Button>

          <Button
            type="button"
            variant="outline"
            size="xs"
            onClick={handleRevealFile}
            title={logFilePath || t("logs.revealFile")}
            className="h-7 text-xs gap-1 cursor-pointer"
          >
            <FolderOpen className="size-3" />
            <span>{t("logs.revealFile")}</span>
          </Button>

          <Button
            type="button"
            variant="outline"
            size="xs"
            onClick={handleClear}
            className="h-7 text-xs gap-1 text-destructive hover:text-destructive cursor-pointer"
          >
            <Trash2 className="size-3" />
            <span>{t("logs.clear")}</span>
          </Button>
        </div>
      </header>

      {/* Filter & Search Bar */}
      <div className="px-3 py-2 border-b border-border/50 bg-muted/20 flex items-center justify-between gap-3 flex-wrap shrink-0 wails-no-drag">
        <div className="flex items-center gap-1.5 flex-wrap">
          {(
            [
              { id: "all", label: t("logs.levels.all"), count: counts.all },
              { id: "perf", label: t("logs.levels.perf"), count: counts.perf },
              { id: "info", label: t("logs.levels.info"), count: counts.info },
              { id: "warn", label: t("logs.levels.warn"), count: counts.warn },
              { id: "error", label: t("logs.levels.error"), count: counts.error },
            ] as { id: LevelFilter; label: string; count: number }[]
          ).map((lv) => {
            const active = levelFilter === lv.id;
            return (
              <button
                key={lv.id}
                type="button"
                onClick={() => setLevelFilter(lv.id)}
                className={cn(
                  "h-6 px-2 rounded-md text-[11px] font-medium inline-flex items-center gap-1.5 transition-colors cursor-pointer border",
                  active
                    ? "border-primary/40 bg-primary/10 text-primary font-semibold"
                    : "border-border/60 bg-background/60 text-muted-foreground hover:text-foreground"
                )}
              >
                <span>{lv.label}</span>
                <span className="text-[10px] font-mono opacity-75">
                  {lv.count}
                </span>
              </button>
            );
          })}

          <div className="h-4 w-px bg-border/60 mx-1" />

          {categories.map((cat) => {
            const active = categoryFilter === cat;
            return (
              <button
                key={cat}
                type="button"
                onClick={() => setCategoryFilter(cat)}
                className={cn(
                  "h-6 px-2 rounded-md text-[11px] font-mono transition-colors cursor-pointer border",
                  active
                    ? "border-primary/40 bg-primary/10 text-primary font-semibold"
                    : "border-border/60 bg-background/60 text-muted-foreground hover:text-foreground"
                )}
              >
                {cat === "all" ? t("logs.allCategories") : `#${cat}`}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-2.5">
          <label className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground cursor-pointer">
            <input
              type="checkbox"
              checked={autoScroll}
              onChange={(e) => setAutoScroll(e.target.checked)}
              className="size-3.5 rounded border-border accent-primary cursor-pointer"
            />
            <span>{t("logs.autoScroll")}</span>
          </label>

          <div className="relative w-56">
            <Search className="size-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("logs.searchPlaceholder")}
              className="pl-8 pr-7 h-7 text-xs bg-background border-border/60 rounded-lg"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer"
              >
                <X className="size-3" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Log Entries Table */}
      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto font-mono text-xs divide-y divide-border/40 select-text"
      >
        {filteredLogs.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-muted-foreground text-xs gap-2 p-8 select-none">
            <Terminal className="size-8 opacity-40" />
            <p>{t("logs.empty")}</p>
          </div>
        ) : (
          filteredLogs.map((entry) => (
            <div
              key={entry.id}
              className={cn(
                "px-3 py-1.5 flex items-start gap-2.5 hover:bg-muted/30 transition-colors leading-relaxed",
                entry.level === "error" && "bg-destructive/5",
                entry.level === "warn" && "bg-amber-500/5"
              )}
            >
              <span className="text-[11px] text-muted-foreground shrink-0 pt-0.5 tabular-nums">
                {entry.timestamp}
              </span>

              <div className="shrink-0 pt-0.5">
                {renderLevelBadge(entry.level)}
              </div>

              <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted/70 text-muted-foreground shrink-0 mt-0.5">
                {entry.category}
              </span>

              <div className="flex-1 min-w-0 break-all">
                <span className="text-foreground font-medium">
                  {entry.message}
                </span>
                {entry.durationMs !== undefined && entry.durationMs > 0 && (
                  <span
                    className={cn(
                      "ml-2 px-1.5 py-0.2 rounded text-[10px] font-semibold",
                      entry.durationMs >= 100
                        ? "bg-amber-500/20 text-amber-500"
                        : "bg-emerald-500/15 text-emerald-500"
                    )}
                  >
                    {entry.durationMs}ms
                  </span>
                )}
                {entry.detail && (
                  <span className="ml-2 text-muted-foreground text-[11px]">
                    {entry.detail}
                  </span>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Footer with on-disk log path */}
      <footer className="h-7 px-3 border-t border-border/50 bg-sidebar/60 flex items-center justify-between text-[11px] text-muted-foreground shrink-0">
        <div className="truncate font-mono select-text">
          {logFilePath ? `${t("logs.logFile")}: ${logFilePath}` : ""}
        </div>
        <div className="shrink-0 font-mono text-[10px]">
          {paused ? t("logs.statusPaused") : t("logs.statusLive")}
        </div>
      </footer>
    </div>
  );
}
