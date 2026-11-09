package plugin

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync/atomic"
	"time"

	"bowerbird/core"

	"github.com/MoeForge/moejs"
	"github.com/MoeForge/moejs/eventloop"
	"github.com/MoeForge/moejs/webapi"
)

const (
	pluginMemoryLimit = 256 << 20
	spawnTimeout      = 20 * time.Second
	maxLogDetail      = 4096
)

type cachedModule struct {
	module  *moejs.Module
	modTime time.Time
	size    int64
}

// call runs one plugin hook inside an in-process moejs runtime. Every call gets
// its own runtime and event loop, while the compiled module is cached, so a
// hook no longer starts a Node process and repeated calls stay fast.
func (h *Host) call(p *Plugin, hook string, args any, out any) error {
	if p == nil || !hasHook(p.Manifest, hook) {
		if p != nil {
			h.logPlugin("warn", p, "hook "+hook, "not declared in plugin.json; denied", 0)
		}
		return ErrHookNotDeclared
	}
	started := time.Now()
	argsJSON, err := json.Marshal(args)
	if err != nil {
		return err
	}
	h.logPlugin("info", p, "hook "+hook, "start args="+summarizeBytes(argsJSON), 0)

	mod, err := h.compilePluginModule(p)
	if err != nil {
		h.logPlugin("error", p, "hook "+hook, "compile failed: "+err.Error(), time.Since(started).Milliseconds())
		return err
	}
	hookRef, err := mod.Hook(hook)
	if errors.Is(err, moejs.ErrHookNotFound) {
		h.logPlugin("info", p, "hook "+hook, "not exported; skipped", time.Since(started).Milliseconds())
		return nil
	}
	if err != nil {
		h.logPlugin("error", p, "hook "+hook, err.Error(), time.Since(started).Milliseconds())
		return err
	}

	rt := moejs.NewRuntime(moejs.Options{
		MemoryLimit:        pluginMemoryLimit,
		DisableDynamicCode: true,
	})
	loop, err := eventloop.New(rt, eventloop.Options{
		OnError: func(err error) {
			h.logPlugin("error", p, "hook "+hook, "event loop: "+err.Error(), time.Since(started).Milliseconds())
		},
	})
	if err != nil {
		h.logPlugin("error", p, "hook "+hook, err.Error(), time.Since(started).Milliseconds())
		return err
	}
	api, err := webapi.Install(loop, webapi.Options{
		Client: h.currentHTTPClient(),
		Allow:  h.fetchAllowFunc(p, hook),
	})
	if err != nil {
		h.logPlugin("error", p, "hook "+hook, "webapi install: "+err.Error(), time.Since(started).Milliseconds())
		return err
	}
	defer api.Close()

	if err := h.installGlobals(rt, p, hook); err != nil {
		h.logPlugin("error", p, "hook "+hook, "globals: "+err.Error(), time.Since(started).Milliseconds())
		return err
	}

	var (
		result   moejs.Value
		callErr  error
		timedOut atomic.Bool
	)
	timeout := time.AfterFunc(h.timeout, func() {
		timedOut.Store(true)
		loop.Interrupt("plugin timeout")
	})
	defer timeout.Stop()

	runErr := loop.Run(func(rt *moejs.Runtime) error {
		if err := rt.Load(mod); err != nil {
			return err
		}
		arg, err := rt.ParseJSON(argsJSON)
		if err != nil {
			return err
		}
		result, callErr = rt.Call(hookRef, arg)
		return callErr
	})
	if timedOut.Load() {
		h.logPlugin("error", p, "hook "+hook, fmt.Sprintf("timed out after %s", h.timeout), time.Since(started).Milliseconds())
		return fmt.Errorf("plugin timed out after %s", h.timeout)
	}
	if runErr != nil {
		h.logPlugin("error", p, "hook "+hook, "failed: "+runErr.Error(), time.Since(started).Milliseconds())
		return runErr
	}
	if st := rt.Stats(); st.LastMemoryLimitError != nil {
		h.logPlugin("error", p, "hook "+hook, "memory limit exceeded: "+st.LastMemoryLimitError.Error(), time.Since(started).Milliseconds())
	}

	// Async hooks return a Promise. Loop.Run drives fetch/timers/promise jobs;
	// inspect the settled promise once the loop has driven fetch/timers.
	if state, value, ok := moejs.PromiseResult(result); ok {
		switch state {
		case moejs.PromiseFulfilled:
			result = value
		case moejs.PromiseRejected:
			reason, _ := rt.ToGo(value)
			err := fmt.Errorf("promise rejected: %v", reason)
			h.logPlugin("error", p, "hook "+hook, err.Error(), time.Since(started).Milliseconds())
			return err
		default:
			err := errors.New("plugin hook promise did not settle")
			h.logPlugin("error", p, "hook "+hook, err.Error(), time.Since(started).Milliseconds())
			return err
		}
	}

	if out == nil || !result.IsObject() && !result.IsString() && !result.IsNumber() && !result.IsBool() {
		// undefined/null means the hook has nothing to contribute.
		h.logPlugin("info", p, "hook "+hook, "done result=null", time.Since(started).Milliseconds())
		return nil
	}
	body, err := rt.AppendJSON(nil, result)
	if err != nil {
		h.logPlugin("error", p, "hook "+hook, "result encode: "+err.Error(), time.Since(started).Milliseconds())
		return err
	}
	if string(body) == "null" {
		h.logPlugin("info", p, "hook "+hook, "done result=null", time.Since(started).Milliseconds())
		return nil
	}
	if err := json.Unmarshal(body, out); err != nil {
		h.logPlugin("error", p, "hook "+hook, "result decode: "+err.Error(), time.Since(started).Milliseconds())
		return err
	}
	h.logPlugin("info", p, "hook "+hook, "done result="+summarizeBytes(body), time.Since(started).Milliseconds())
	return nil
}

func (h *Host) compilePluginModule(p *Plugin) (*moejs.Module, error) {
	path := filepath.Join(p.Dir, p.Manifest.Main)
	info, err := os.Stat(path)
	if err != nil {
		return nil, err
	}
	key := p.Manifest.ID + "|" + path
	h.modMu.Lock()
	cached, ok := h.modules[key]
	h.modMu.Unlock()
	if ok && cached.modTime.Equal(info.ModTime()) && cached.size == info.Size() {
		return cached.module, nil
	}
	source, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	name := p.Manifest.ID + "/" + p.Manifest.Main
	var mod *moejs.Module
	if strings.HasSuffix(strings.ToLower(path), ".ts") || strings.HasSuffix(strings.ToLower(path), ".tsx") {
		mod, err = moejs.CompileTS(name, string(source))
	} else {
		mod, err = moejs.Compile(name, string(source))
	}
	if err != nil {
		return nil, err
	}
	h.modMu.Lock()
	h.modules[key] = cachedModule{module: mod, modTime: info.ModTime(), size: info.Size()}
	h.modMu.Unlock()
	return mod, nil
}

func (h *Host) installGlobals(rt *moejs.Runtime, p *Plugin, hook string) error {
	settings := map[string]string{}
	for _, setting := range p.Manifest.Settings {
		if setting.Default != "" {
			settings[setting.Key] = setting.Default
		}
	}
	for key, value := range p.Settings {
		settings[key] = value
	}
	getSetting := moejs.NativeFunc(func(_ *moejs.Realm, _ moejs.Value, args []moejs.Value) (moejs.Value, error) {
		key := moejs.Arg(args, 0).String()
		value := settings[key]
		if len(args) > 1 && value == "" {
			value = moejs.Arg(args, 1).String()
		}
		h.logPlugin("info", p, "api.settings.get", fmt.Sprintf("hook=%s key=%s found=%t", hook, key, value != ""), 0)
		return moejs.String(value), nil
	})
	spawn := moejs.NativeFunc(func(_ *moejs.Realm, _ moejs.Value, args []moejs.Value) (moejs.Value, error) {
		command := moejs.Arg(args, 0).String()
		var commandArgs []string
		if len(args) > 1 && args[1].IsObject() {
			raw, err := rt.ToGo(args[1])
			if err == nil {
				if list, ok := raw.([]any); ok {
					for _, value := range list {
						commandArgs = append(commandArgs, fmt.Sprint(value))
					}
				}
			}
		}
		allowed := false
		for _, rule := range p.Manifest.Permissions.Process {
			if rule == command || filepath.Base(command) == rule {
				allowed = true
				break
			}
		}
		if !allowed {
			err := fmt.Errorf("process permission denied for %s", command)
			h.logPlugin("warn", p, "api.spawn", fmt.Sprintf("hook=%s command=%s denied", hook, command), 0)
			return moejs.Undefined(), err
		}
		ctx, cancel := context.WithTimeout(context.Background(), spawnTimeout)
		defer cancel()
		start := time.Now()
		out, err := exec.CommandContext(ctx, command, commandArgs...).Output()
		detail := fmt.Sprintf("hook=%s command=%s args=%v bytes=%d", hook, command, commandArgs, len(out))
		if err != nil {
			h.logPlugin("error", p, "api.spawn", detail+" err="+err.Error(), time.Since(start).Milliseconds())
			return moejs.Undefined(), err
		}
		h.logPlugin("info", p, "api.spawn", detail, time.Since(start).Milliseconds())
		return moejs.String(string(out)), nil
	})
	platformOpen := moejs.NativeFunc(func(_ *moejs.Realm, _ moejs.Value, args []moejs.Value) (moejs.Value, error) {
		target := moejs.Arg(args, 0).String()
		h.logPlugin("info", p, "api.platformOpen", fmt.Sprintf("hook=%s url=%s", hook, target), 0)
		if err := core.OpenExternalURL(target); err != nil {
			return moejs.Undefined(), err
		}
		return moejs.Undefined(), nil
	})
	pluginLog := moejs.NativeFunc(func(_ *moejs.Realm, _ moejs.Value, args []moejs.Value) (moejs.Value, error) {
		level := "info"
		message := ""
		detail := ""
		isLevel := func(value string) bool {
			switch strings.ToLower(value) {
			case "trace", "debug", "info", "warn", "error":
				return true
			}
			return false
		}
		if len(args) >= 2 && isLevel(moejs.Arg(args, 0).String()) {
			level = strings.ToLower(moejs.Arg(args, 0).String())
			message = moejs.Arg(args, 1).String()
			if len(args) >= 3 {
				detail = moejs.Arg(args, 2).String()
			}
		} else if len(args) >= 2 {
			message = moejs.Arg(args, 0).String()
			detail = moejs.Arg(args, 1).String()
		} else if len(args) == 1 {
			message = moejs.Arg(args, 0).String()
		}
		h.logPlugin(level, p, message, "hook="+hook+" "+detail, 0)
		return moejs.Undefined(), nil
	})
	console := map[string]any{}
	for _, level := range []string{"log", "info", "warn", "error", "debug"} {
		lvl := level
		console[lvl] = moejs.NativeFunc(func(_ *moejs.Realm, _ moejs.Value, args []moejs.Value) (moejs.Value, error) {
			parts := make([]string, 0, len(args))
			for i := range args {
				parts = append(parts, moejs.Arg(args, i).String())
			}
			logLevel := lvl
			if logLevel == "log" {
				logLevel = "info"
			} else if logLevel == "debug" {
				logLevel = "info"
			}
			h.logPlugin(logLevel, p, strings.Join(parts, " "), "hook="+hook+" console."+lvl, 0)
			return moejs.Undefined(), nil
		})
	}
	host := map[string]any{
		"settings": map[string]any{"get": getSetting},
		"log":      pluginLog,
	}
	// Capabilities are only visible when plugin.json explicitly grants them.
	if len(p.Manifest.Permissions.Process) > 0 {
		host["spawn"] = spawn
	}
	if p.Manifest.Permissions.OpenExternal {
		host["platformOpen"] = platformOpen
	}
	if err := rt.SetGlobal("host", host); err != nil {
		return err
	}
	if len(p.Manifest.Permissions.Network) > 0 {
		// webapi exposes fetch as a lazy global. Wrap it once so host.fetch uses
		// the same implementation, and record completion/failure in the unified
		// log (a hung request then leaves a clear start/error trail).
		const fetchWrapper = `if (typeof fetch === "function") {
  const originalFetch = globalThis.fetch.bind(globalThis);
  globalThis.fetch = async function (...args) {
    const started = performance.now();
    const target = args[0] && args[0].url ? args[0].url : String(args[0]);
    try {
      const response = await originalFetch(...args);
      host.log("info", "api.fetch.response", target + " status=" + response.status + " ms=" + Math.round(performance.now() - started));
      return response;
    } catch (err) {
      host.log("error", "api.fetch.error", target + " ms=" + Math.round(performance.now() - started) + " err=" + String(err));
      throw err;
    }
  };
  host.fetch = function (...args) { return globalThis.fetch(...args); };
}`
		if script, err := moejs.CompileScript("host-fetch.js", fetchWrapper); err == nil {
			_, _ = rt.RunScript(script)
		}
	}
	if err := rt.SetGlobal("console", console); err != nil {
		return err
	}
	return nil
}

func (h *Host) fetchAllowFunc(p *Plugin, hook string) func(*http.Request) error {
	network := append([]string(nil), p.Manifest.Permissions.Network...)
	return func(req *http.Request) error {
		host := req.URL.Hostname()
		allowed := false
		for _, rule := range network {
			if matchURLHost(host, rule) {
				allowed = true
				break
			}
		}
		if !allowed {
			h.logPlugin("warn", p, "api.fetch", fmt.Sprintf("hook=%s denied %s %s", hook, req.Method, req.URL.String()), 0)
			return fmt.Errorf("network permission denied for %s", host)
		}
		if req.Host != "" && !strings.EqualFold(req.Host, req.URL.Host) {
			hostHeader := req.Host
			if h, _, err := net.SplitHostPort(hostHeader); err == nil {
				hostHeader = h
			}
			hostHeader = strings.TrimSuffix(strings.TrimPrefix(hostHeader, "["), "]")
			hostAllowed := false
			for _, rule := range network {
				if matchURLHost(hostHeader, rule) {
					hostAllowed = true
					break
				}
			}
			if !hostAllowed {
				h.logPlugin("warn", p, "api.fetch", fmt.Sprintf("hook=%s denied Host header %s for %s", hook, hostHeader, req.URL.String()), 0)
				return fmt.Errorf("network permission denied for Host header %s", hostHeader)
			}
		}
		h.logPlugin("info", p, "api.fetch", fmt.Sprintf("hook=%s %s %s", hook, req.Method, req.URL.String()), 0)
		return nil
	}
}

func (h *Host) logPlugin(level string, p *Plugin, message, detail string, durationMs int64) {
	switch level {
	case "info", "warn", "error", "perf":
	default:
		level = "info"
	}
	if len(detail) > maxLogDetail {
		detail = detail[:maxLogDetail] + "…"
	}
	id := ""
	if p != nil {
		id = p.Manifest.ID
	}
	core.RecordLog(level, "plugin", "["+id+"] "+message, detail, durationMs)
}

func summarizeBytes(data []byte) string {
	text := string(data)
	if len(text) > maxLogDetail {
		return text[:maxLogDetail] + "…"
	}
	return text
}
