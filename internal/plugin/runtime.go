package plugin

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

// workerJS runs one hook and writes its result as JSON to stdout. It is
// embedded so an installed app needs no extra files beyond a JS runtime.
const workerJS = `
import { pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";
import path from "node:path";

const [dir, main, hook, argsJSON, networkJSON, processJSON, settingsJSON] = process.argv.slice(2);
const net = JSON.parse(networkJSON || "[]") || [];
const allowedProcess = JSON.parse(processJSON || "[]") || [];
const settings = JSON.parse(settingsJSON || "{}");
const args = JSON.parse(argsJSON || "{}");

function hostAllowed(host) {
  host = String(host || "").toLowerCase();
  if (!host) return false;
  for (const rule of net) {
    const r = String(rule).toLowerCase().trim();
    if (!r) continue;
    if (r === host) return true;
    if (r.startsWith("*.") && (host === r.slice(2) || host.endsWith(r.slice(1)))) return true;
  }
  return false;
}
const realFetch = globalThis.fetch;
globalThis.fetch = async function (input, init) {
  const raw = typeof input === "string" ? input : input?.url;
  let host = "";
  try { host = new URL(raw).hostname; } catch { throw new Error("invalid URL"); }
  if (!hostAllowed(host)) throw new Error("network permission denied for " + host);
  return realFetch(input, init);
};
globalThis.host = {
  fetch: globalThis.fetch,
  settings: { get: (key) => settings[key] ?? "" },
  spawn(command, args = []) {
    const exe = path.basename(String(command));
    if (!allowedProcess.includes(exe) && !allowedProcess.includes(String(command))) {
      throw new Error("process permission denied for " + exe);
    }
    return execFileSync(command, args, { encoding: "utf8", timeout: 20000, maxBuffer: 16 << 20 });
  },
};

let mod;
try {
  mod = await import(pathToFileURL(path.join(dir, main)).href + "?t=" + Date.now());
} catch (err) {
  console.error(JSON.stringify({ error: String(err?.stack || err) }));
  process.exit(2);
}
const fn = mod[hook] || (mod.default && mod.default[hook]);
if (typeof fn !== "function") {
  process.stdout.write(JSON.stringify(null));
  process.exit(0);
}
try {
  const result = await fn(args);
  process.stdout.write(JSON.stringify(result === undefined ? null : result));
} catch (err) {
  console.error(JSON.stringify({ error: String(err?.stack || err) }));
  process.exit(3);
}
`

// call runs a plugin hook in a fresh constrained runtime.
func (h *Host) call(p *Plugin, hook string, args any, out any) error {
	main := p.Manifest.Main
	if main == "" {
		main = "index.js"
	}
	argsJSON, err := json.Marshal(args)
	if err != nil {
		return err
	}
	network, _ := json.Marshal(p.Manifest.Permissions.Network)
	process, _ := json.Marshal(p.Manifest.Permissions.Process)
	settings, _ := json.Marshal(p.Settings)

	worker, err := h.ensureWorker()
	if err != nil {
		return err
	}
	ctx, cancel := context.WithTimeout(context.Background(), h.timeout)
	defer cancel()

	workerPath := realPath(worker)
	dirPath := realPath(p.Dir)
	cmdArgs := []string{
		"--permission",
		"--allow-fs-read=" + workerPath,
		"--allow-fs-read=" + dirPath,
		"--max-old-space-size=256",
		workerPath,
		dirPath, main, hook, string(argsJSON), string(network), string(process), string(settings),
	}
	if len(p.Manifest.Permissions.Network) > 0 {
		cmdArgs = append([]string{"--allow-net"}, cmdArgs...)
	}
	if len(p.Manifest.Permissions.Process) > 0 {
		cmdArgs = append([]string{"--allow-child-process"}, cmdArgs...)
	}
	cmd := exec.CommandContext(ctx, "node", cmdArgs...)
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr
	err = cmd.Run()
	if ctx.Err() == context.DeadlineExceeded {
		return errors.New("plugin timed out after " + h.timeout.String())
	}
	if err != nil {
		msg := strings.TrimSpace(stderr.String())
		if msg == "" {
			msg = err.Error()
		}
		return errors.New(msg)
	}
	body := bytes.TrimSpace(stdout.Bytes())
	if len(body) == 0 || string(body) == "null" {
		return nil
	}
	if err := json.Unmarshal(body, out); err != nil {
		return err
	}
	return nil
}

func (h *Host) ensureWorker() (string, error) {
	dir := filepath.Join(h.baseDir, ".runtime")
	if h.worker != "" {
		if _, err := os.Stat(h.worker); err == nil {
			return h.worker, nil
		}
	}
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return "", err
	}
	path := filepath.Join(dir, "worker.mjs")
	if err := os.WriteFile(path, []byte(workerJS), 0o644); err != nil {
		return "", err
	}
	h.worker = path
	return path, nil
}

func realPath(path string) string {
	if resolved, err := filepath.EvalSymlinks(path); err == nil {
		return resolved
	}
	return path
}
