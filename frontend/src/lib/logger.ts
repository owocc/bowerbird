import { AppendFrontendLog } from "../../bindings/bowerbird/core/service";

export type LogLevel = "info" | "warn" | "error" | "perf";
export type LogCategory = "core" | "perf" | "ui" | "drag" | "asset" | "menu";

interface QueuedLog {
  level: LogLevel;
  category: LogCategory;
  message: string;
  detail: string;
  durationMs: number;
}

const queue: QueuedLog[] = [];
let flushing = false;
let monitorInstalled = false;

function pumpQueue(): void {
  if (flushing || queue.length === 0) return;
  flushing = true;
  void (async () => {
    while (queue.length > 0) {
      const item = queue.shift()!;
      try {
        await AppendFrontendLog(
          item.level,
          item.category,
          item.message,
          item.detail,
          Math.round(item.durationMs)
        );
      } catch {
        // Ignore transient RPC startup errors
      }
    }
    flushing = false;
  })();
}

export function logDiagnostic(
  level: LogLevel,
  category: LogCategory,
  message: string,
  detail = "",
  durationMs = 0
): void {
  queue.push({ level, category, message, detail, durationMs });
  pumpQueue();
}

/**
 * Installs lightweight UI diagnostics in the main window:
 * - Long Task observer (PerformanceObserver for "longtask" > 50ms)
 * - Unhandled window errors & promise rejections
 */
export function installDiagnosticsMonitor(): void {
  if (monitorInstalled || typeof window === "undefined") return;
  monitorInstalled = true;

  // Do not install LongTask observer inside the /logs window itself to avoid feedback loops
  if (window.location.hash.startsWith("#/logs")) {
    return;
  }

  window.addEventListener("error", (event) => {
    logDiagnostic(
      "error",
      "ui",
      event.message || "Unhandled UI error",
      `${event.filename || ""}:${event.lineno || 0}:${event.colno || 0}`,
      0
    );
  });

  window.addEventListener("unhandledrejection", (event) => {
    const reason =
      event.reason instanceof Error
        ? `${event.reason.message}\n${event.reason.stack || ""}`
        : String(event.reason);
    logDiagnostic("error", "ui", "Unhandled Promise rejection", reason.slice(0, 600), 0);
  });

  if (typeof PerformanceObserver !== "undefined") {
    try {
      const supported = PerformanceObserver.supportedEntryTypes || [];
      if (supported.includes("longtask")) {
        const observer = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            if (entry.duration >= 60) {
              logDiagnostic(
                "warn",
                "perf",
                "UI main-thread LongTask detected",
                `name=${entry.name} start=${Math.round(entry.startTime)}ms`,
                Math.round(entry.duration)
              );
            }
          }
        });
        observer.observe({ entryTypes: ["longtask"] });
      }
    } catch {
      // PerformanceObserver longtask not supported in this webview engine
    }
  }
}
