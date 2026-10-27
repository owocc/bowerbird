/**
 * Appearance preferences that are not the colour mode: window vibrancy (the
 * native blurred material) and the background layer.
 *
 * Both are stored in localStorage *and* in the Go user data, because every
 * window shows them and the native side needs to know about vibrancy before a
 * window is created. The rules that tie them together live here too, in one
 * place, rather than in the provider or in the settings page:
 *
 *  - the background layer always decides what the chrome (and therefore the
 *    sidebar) shows: a theme colour, a solid fill, a gradient, or nothing;
 *  - "transparent" only means something while the window shows a material, so
 *    it is unavailable without vibrancy and falls back to "default" when
 *    vibrancy is turned off.
 */

import { useCallback, useEffect, useState } from "react";
import { Events } from "@/lib/host-runtime";
import {
  applyBackdrop,
  getBackdropPreference,
  BACKDROP_STORAGE_KEY,
  type BackdropMode,
  type BackdropPrefs,
} from "@/lib/backdrop";
import {
  GetVibrancyEnabled,
  SetVibrancyEnabled,
} from "../../bindings/bowerbird/core/service";
import {
  VIBRANCY_STORAGE_KEY,
} from "@/lib/appearance-keys";

export { VIBRANCY_STORAGE_KEY };

/** Event broadcast when any window toggles vibrancy. */
const VIBRANCY_CHANGED_EVENT = "vibrancy-changed";

/** Reads the local mirror of the vibrancy preference (false when unset). */
function getVibrancyPreference(): boolean {
  if (typeof localStorage === "undefined") return false;
  return localStorage.getItem(VIBRANCY_STORAGE_KEY) === "true";
}

/**
 * Mirrors the vibrancy flag onto <html> for the first-paint script and for any
 * CSS that needs to know the window shows a material.
 */
function applyVibrancyAttribute(enabled: boolean) {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-vibrancy", enabled ? "on" : "off");
}

/**
 * The background modes that make sense for the current vibrancy state.
 *
 * "Transparent" is left out while the window cannot show a material behind the
 * page: without it the layer would just render the window's own fill, which is
 * exactly what "default" already does.
 */
export function availableBackdropModes(enabled: boolean): BackdropMode[] {
  const all: BackdropMode[] = [
    "default",
    "transparent",
    "solid",
    "gradient",
    "image",
  ];
  return enabled ? all : all.filter((mode) => mode !== "transparent");
}

/**
 * Applies the rule that ties the two settings together: a transparent backdrop
 * needs vibrancy, so it collapses to "default" once the material is gone.
 */
function withVibrancyConstraint(
  prefs: BackdropPrefs,
  vibrancyEnabled: boolean
): BackdropPrefs {
  if (vibrancyEnabled || prefs.mode !== "transparent") return prefs;
  return { ...prefs, mode: "default" };
}

function persistBackdrop(prefs: BackdropPrefs): BackdropPrefs {
  try {
    localStorage.setItem(BACKDROP_STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    /* storage unavailable: the in-memory value still applies for this window */
  }
  return prefs;
}

export interface AppearanceApi {
  /** Whether windows show a blurred material behind the page. */
  vibrancy: boolean;
  setVibrancy: (enabled: boolean) => void;
  /** The background painted between <body> and the content. */
  backdrop: BackdropPrefs;
  setBackdrop: (prefs: BackdropPrefs) => void;
  /** The background modes currently on offer (see availableBackdropModes). */
  backdropModes: BackdropMode[];
}

/**
 * Owns the vibrancy and background preferences for one window.
 *
 * `resolvedMode` is the concrete light/dark appearance, needed because the
 * gradient presets carry one value per mode.
 */
export function useAppearance(resolvedMode: "light" | "dark"): AppearanceApi {
  const [vibrancy, setVibrancyState] = useState<boolean>(getVibrancyPreference);
  const [backdrop, setBackdropState] = useState<BackdropPrefs>(() =>
    withVibrancyConstraint(getBackdropPreference(), getVibrancyPreference())
  );

  // Publish the flag and repaint the layer whenever either changes, including a
  // live OS appearance change (which changes which preset gradient applies).
  useEffect(() => {
    applyVibrancyAttribute(vibrancy);
  }, [vibrancy]);

  useEffect(() => {
    applyBackdrop(backdrop, resolvedMode);
  }, [backdrop, resolvedMode]);

  // The hairline strength is shared too. The backend is the source of truth and
  // broadcasts changes, which is what keeps the main window in step with the
  // settings window (localStorage's "storage" event does not fire reliably in
  // this WebView, so it is only a first-paint mirror).
  // Every appearance setting is shared by all windows, so pick up whatever
  // another one wrote. The browser skips same-window writes, so no echo here.
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === BACKDROP_STORAGE_KEY) {
        setBackdropState(
          withVibrancyConstraint(getBackdropPreference(), vibrancy)
        );
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [vibrancy]);

  // Reconcile with the persisted value on mount: the backend is the source of
  // truth, the local mirror only exists to avoid a first-paint flash.
  useEffect(() => {
    let cancelled = false;
    GetVibrancyEnabled()
      .then((persisted) => {
        if (cancelled || typeof persisted !== "boolean") return;
        localStorage.setItem(VIBRANCY_STORAGE_KEY, persisted ? "true" : "false");
        setVibrancyState((prev) => (prev === persisted ? prev : persisted));
        setBackdropState((prev) =>
          withVibrancyConstraint(prev, persisted)
        );
      })
      .catch((err) => {
        console.error("Failed to load vibrancy preference:", err);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Vibrancy changed in another window: mirror it, and apply the fallback there
  // too so both windows keep the same coherent pair of settings.
  useEffect(() => {
    const unsubscribe = Events.On(VIBRANCY_CHANGED_EVENT, (event) => {
      const next = typeof event?.data === "boolean" ? event.data : undefined;
      if (typeof next !== "boolean") return;
      localStorage.setItem(VIBRANCY_STORAGE_KEY, next ? "true" : "false");
      setVibrancyState((prev) => (prev === next ? prev : next));
      setBackdropState((prev) => {
        const constrained = withVibrancyConstraint(prev, next);
        return constrained === prev ? prev : persistBackdrop(constrained);
      });
    });
    return () => unsubscribe();
  }, []);

  const setVibrancy = useCallback((enabled: boolean) => {
    localStorage.setItem(VIBRANCY_STORAGE_KEY, enabled ? "true" : "false");
    setVibrancyState(enabled);
    // A transparent background cannot outlive the material it shows, so it
    // falls back to the default rather than leaving an invisible setting
    // behind. Both windows and a later re-enable then behave predictably.
    setBackdropState((prev) => {
      const constrained = withVibrancyConstraint(prev, enabled);
      return constrained === prev ? prev : persistBackdrop(constrained);
    });
    // Persist + broadcast; the native windows follow through ApplyVibrancy.
    SetVibrancyEnabled(enabled).catch((err) => {
      console.error("Failed to persist vibrancy preference:", err);
    });
  }, []);

  const setBackdrop = useCallback((prefs: BackdropPrefs) => {
    setBackdropState(persistBackdrop(prefs));
  }, []);

  return {
    vibrancy,
    setVibrancy,
    backdrop,
    setBackdrop,
    backdropModes: availableBackdropModes(vibrancy),
  };
}
