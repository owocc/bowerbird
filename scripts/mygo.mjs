#!/usr/bin/env node
/**
 * Cross-platform cgo-aware launcher for the mygo CLI.
 *
 * Why this exists: the three native macOS implementations in `core/`
 * (sysicon_darwin.go, videothumb_darwin.go, drag_darwin.go) are gated on
 * `//go:build darwin && !ios` *and* on cgo, because they contain
 * `import "C"`. With CGO_ENABLED=0 Go silently drops those files, and their
 * platform fallbacks (`*_other.go`, gated on `!darwin || ios`) are excluded on
 * darwin too. Every symbol they provide therefore disappears and the build
 * fails with errors like:
 *
 *   core/service.go:238:15: s.mgr.StartDragItems undefined
 *
 * Forcing CGO_ENABLED=1 keeps the native implementations in the build.
 *
 * Usage: node scripts/mygo.mjs <dev|build> [...args]
 */
import { spawn } from "node:child_process";

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error("usage: node scripts/mygo.mjs <dev|build> [...args]");
  process.exit(1);
}

const child = spawn("go", ["tool", "mygo", ...args], {
  stdio: "inherit",
  env: { ...process.env, CGO_ENABLED: "1" },
});

child.on("error", (err) => {
  console.error("failed to start `go tool mygo`:", err.message);
  process.exit(1);
});

// Forward termination signals so Ctrl-C tears down the dev server cleanly.
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => child.kill(signal));
}

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});
