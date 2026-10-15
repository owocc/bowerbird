/**
 * Native drag-out / drop tracing.
 *
 * Purpose: drop-to-another-window is broken on Windows (target apps such as
 * terminals navigate to `about:blank#blocked`), which means the payload leaving
 * the webview is not a real OS file payload. Everything the webview *can*
 * observe about that payload is recorded here, next to the native side trace
 * (see `core/drag_debug.go`, `main.go`).
 *
 * Instrumentation is a single document-level listener set, deliberately not
 * per-component: every drag source in the app (gallery items, thumbnails,
 * folder rows) is covered, including future ones, and the payload is read after
 * React's own dragstart handler has populated the DataTransfer (React attaches
 * its listeners to the root container, so a document listener runs last).
 *
 * Recorded:
 *   - dragstart: item ids, offered formats and their exact values (paths/URIs)
 *   - dragenter (external payloads only): what the OS handed to the app
 *   - drop: in-app drops (target element + payload)
 *   - dragend: dropEffect / effectAllowed, i.e. whether anything accepted it
 *
 * Not observable: what the *target* application does with the payload. A
 * rejected drop surfaces as `dropEffect=none`, and for Windows the diagnostic
 * signal is the offered format list: the shell and terminals need CF_HDROP
 * (native file list), while the webview only offers text/uri-list + text/plain.
 */
import { LogDragTrace } from "../../bindings/bowerbird/core/service";
import { isLinux, isWindows } from "./platform";
import { isMacOS } from "./macos";

const PREFIX = "[DragTrace]";
const MAX_FIELD = 400;
const MAX_LINE = 1800;
const FLUSH_RETRY_MS = 250;
const FLUSH_MAX_ATTEMPTS = 40;

let installed = false;
let dragSeq = 0;
// Label of the drag currently in flight: "drag#N" for our own drags,
// "inbound" for payloads arriving from another application (no dragstart seen).
let currentDrag = "none";
let droppedInsideApp = false;
let inboundAnnounced = false;

interface BufferedTrace {
  phase: string;
  detail: string;
}

// The app can start dragging before the Wails runtime finishes wiring the RPC
// bridge; traces are buffered until the first successful call.
const buffered: BufferedTrace[] = [];
let flushing = false;
let flushAttempts = 0;

function collapse(value: string, limit = MAX_FIELD): string {
  const oneLine = value.replace(/\r\n|\r|\n/g, "\\n");
  return oneLine.length > limit
    ? `${oneLine.slice(0, limit)}…(+${oneLine.length - limit} chars)`
    : oneLine;
}

function clampLine(line: string): string {
  return line.length > MAX_LINE ? `${line.slice(0, MAX_LINE)}…(+${line.length - MAX_LINE} chars)` : line;
}

function platformName(): string {
  if (isMacOS()) return "darwin";
  if (isWindows()) return "windows";
  if (isLinux()) return "linux";
  return "unknown";
}

function pump(): void {
  if (flushing || buffered.length === 0) return;
  flushing = true;
  void (async () => {
    while (buffered.length > 0) {
      const next = buffered[0];
      try {
        await LogDragTrace(next.phase, next.detail);
      } catch (err) {
        flushAttempts += 1;
        if (flushAttempts >= FLUSH_MAX_ATTEMPTS) {
          const dropped = buffered.length;
          buffered.length = 0;
          flushing = false;
          console.warn(`${PREFIX} backend trace sink unavailable, dropped ${dropped} event(s)`, err);
          return;
        }
        window.setTimeout(() => {
          flushing = false;
          pump();
        }, FLUSH_RETRY_MS);
        return;
      }
      flushAttempts = 0;
      buffered.shift();
    }
    flushing = false;
  })();
}

/** Records one drag pipeline event to the webview console and the native trace file. */
export function traceDrag(phase: string, detail: string): void {
  console.log(`${PREFIX}[${phase}] ${detail}`);
  buffered.push({ phase, detail: clampLine(detail) });
  pump();
}

/** Describes a drag target element compactly: tag, id, key drag attributes. */
function describeTarget(target: EventTarget | null): string {
  if (!(target instanceof Element)) return "unknown";
  const parts = [`<${target.tagName.toLowerCase()}`];
  if (target.id) parts.push(`#${target.id}`);
  if (typeof target.className === "string" && target.className) {
    parts.push(`.${target.className.trim().split(/\s+/).slice(0, 3).join(".")}`);
  }
  for (const name of ["data-item-id", "data-folder-id", "data-file-drop-target"]) {
    const value = target.getAttribute(name);
    if (value) parts.push(` ${name}=${value}`);
  }
  parts.push(">");
  return parts.join("");
}

/** Dumps every readable format of a DataTransfer, including its exact values. */
function describeDataTransfer(dt: DataTransfer | null): string {
  if (!dt) return "dataTransfer=null";

  const types = Array.from(dt.types ?? []);
  const fields: string[] = [];

  for (const type of types) {
    if (type === "Files") continue;
    let value = "";
    try {
      value = dt.getData(type);
    } catch {
      continue;
    }
    if (!value) continue;
    fields.push(`${type}=${JSON.stringify(collapse(value))}`);
  }

  if (dt.files && dt.files.length > 0) {
    const names = Array.from(dt.files).map((f) => `${f.name}(${f.size}B,${f.type || "application/octet-stream"})`);
    fields.push(`files=[${collapse(names.join(", "))}]`);
  }

  const line = `types=[${types.join(", ")}] effectAllowed=${dt.effectAllowed} values={${fields.join(" ")}}`;
  return clampLine(line);
}

/** Window flag set by the drag sources while an in-app drag is in flight. */
interface DragFlagWindow extends Window {
  __isInternalDragging?: boolean;
}

function isInternalDrag(dt: DataTransfer | null): boolean {
  if (document.body.hasAttribute("data-internal-dragging")) return true;
  // The flag is our own global, written by LibraryWorkspace's dragstart handler.
  const dragWindow = window as DragFlagWindow;
  if (dragWindow.__isInternalDragging === true) return true;
  const types = Array.from(dt?.types ?? []);
  return types.some((t) => t.startsWith("application/x-bowerbird"));
}

function handleDragStart(e: DragEvent): void {
  dragSeq += 1;
  currentDrag = `drag#${dragSeq}`;
  droppedInsideApp = false;
  inboundAnnounced = false;
  traceDrag(
    "dragstart",
    `${currentDrag} internal=${isInternalDrag(e.dataTransfer)} target=${describeTarget(e.target)} ${describeDataTransfer(e.dataTransfer)}`
  );
}

function handleDragEnter(e: DragEvent): void {
  if (inboundAnnounced) return;
  const dt = e.dataTransfer;
  if (!dt) return;
  const types = Array.from(dt.types ?? []);
  // Only external (Explorer / Finder) inbound drags are interesting here; the
  // app's own drags are already traced at dragstart.
  if (!types.includes("Files") || isInternalDrag(dt)) return;
  inboundAnnounced = true;
  currentDrag = "inbound";
  traceDrag("dragenter-external", `${currentDrag} target=${describeTarget(e.target)} types=[${types.join(", ")}]`);
}

function handleDrop(e: DragEvent): void {
  droppedInsideApp = true;
  traceDrag(
    "drop-in-app",
    `${currentDrag} internal=${isInternalDrag(e.dataTransfer)} target=${describeTarget(e.target)} ${describeDataTransfer(e.dataTransfer)}`
  );
}

function handleDragEnd(e: DragEvent): void {
  const dt = e.dataTransfer;
  const types = Array.from(dt?.types ?? []);
  traceDrag(
    "dragend",
    `${currentDrag} dropEffect=${dt?.dropEffect ?? "?"} effectAllowed=${dt?.effectAllowed ?? "?"} landedInsideApp=${droppedInsideApp} types=[${types.join(", ")}]`
  );
}

/** Installs the document-level drag trace listeners. Idempotent. */
export function installDragTrace(): void {
  if (installed) return;
  installed = true;

  document.addEventListener("dragstart", handleDragStart);
  document.addEventListener("dragenter", handleDragEnter);
  document.addEventListener("drop", handleDrop);
  document.addEventListener("dragend", handleDragEnd);

  traceDrag("webview-ready", `platform=${platformName()} href=${location.href} ua=${collapse(navigator.userAgent)}`);
}
