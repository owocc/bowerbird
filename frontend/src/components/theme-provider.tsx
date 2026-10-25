import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import { Events } from "@/lib/host-runtime";
import { GetTheme, SetTheme } from "../../bindings/bowerbird/core/service";
import {
  availableBackdropModes,
  useAppearance,
  type AppearanceApi,
} from "@/lib/appearance";
import { BACKDROP_DEFAULTS } from "@/lib/backdrop";

export type Theme = "dark" | "light" | "system";
/** The concrete appearance, "system" already resolved. */
export type ResolvedTheme = "dark" | "light";

export interface ThemeProviderProps {
  children: React.ReactNode;
  defaultTheme?: Theme;
  storageKey?: string;
}

export interface ThemeProviderState extends AppearanceApi {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  /** `theme` with "system" resolved against the OS appearance. */
  resolvedTheme: ResolvedTheme;
}

/**
 * Stand-in used before a provider mounts. Hooks never read it in practice, but
 * keeping it a faithful value means a stray `useTheme()` outside the tree fails
 * on the thrown error rather than on a missing field.
 */
const initialState: ThemeProviderState = {
  theme: "system",
  setTheme: () => null,
  resolvedTheme: "light",
  vibrancy: false,
  setVibrancy: () => null,
  backdrop: BACKDROP_DEFAULTS,
  setBackdrop: () => null,
  backdropModes: availableBackdropModes(false),
};

const ThemeProviderContext = createContext<ThemeProviderState>(initialState);

const DARK_QUERY = "(prefers-color-scheme: dark)";

function readSystemMode(): ResolvedTheme {
  if (typeof window === "undefined") return "light";
  return window.matchMedia(DARK_QUERY).matches ? "dark" : "light";
}

function subscribeToSystemMode(onChange: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const mediaQuery = window.matchMedia(DARK_QUERY);
  mediaQuery.addEventListener("change", onChange);
  return () => mediaQuery.removeEventListener("change", onChange);
}

/** Applies the resolved light/dark class to <html>. */
function applyThemeClass(mode: ResolvedTheme) {
  const root = window.document.documentElement;
  root.classList.remove("light", "dark");
  root.classList.add(mode);
}

export function isTheme(value: unknown): value is Theme {
  return value === "dark" || value === "light" || value === "system";
}

/**
 * ThemeProvider for the app.
 *
 * Owns the colour mode and, through {@link useAppearance}, the other two
 * appearance settings (window vibrancy and the background layer) so every
 * consumer reaches all of them with one call.
 *
 * The colour mode is persisted through the Go backend — shared by every window —
 * and mirrored into localStorage so the first paint never flashes the wrong
 * theme. Changes are broadcast over the event bus, which keeps the main window
 * and the settings window in step in real time.
 */
export function ThemeProvider({
  children,
  defaultTheme = "system",
  storageKey = "bowerbird-theme",
  ...props
}: ThemeProviderProps) {
  const [theme, setThemeState] = useState<Theme>(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem(storageKey);
      if (isTheme(stored)) return stored;
    }
    return defaultTheme;
  });

  // The OS appearance only matters while the mode follows it. useSyncExternalStore
  // keeps the value correct without a subscription of our own.
  const systemMode = useSyncExternalStore(
    subscribeToSystemMode,
    readSystemMode,
    () => "light" as ResolvedTheme
  );
  const resolvedTheme: ResolvedTheme = theme === "system" ? systemMode : theme;

  const appearance = useAppearance(resolvedTheme);

  // Apply the class whenever the resolved mode changes. Native window chrome is
  // kept in lock-step by Service.SetTheme → Host.ApplyTheme.
  useEffect(() => {
    applyThemeClass(resolvedTheme);
  }, [resolvedTheme]);

  // Reconcile with the persisted backend value on mount. An empty response
  // means "never chosen": migrate the local choice instead of overwriting it.
  useEffect(() => {
    let cancelled = false;
    GetTheme()
      .then((persisted) => {
        if (cancelled) return;
        if (isTheme(persisted)) {
          setThemeState((prev) => (prev === persisted ? prev : persisted));
          localStorage.setItem(storageKey, persisted);
          return;
        }
        const local = localStorage.getItem(storageKey);
        if (isTheme(local)) void SetTheme(local);
      })
      .catch((err) => {
        console.error("Failed to load theme:", err);
      });
    return () => {
      cancelled = true;
    };
  }, [storageKey]);

  // Another window picked a different mode.
  useEffect(() => {
    const unsubscribe = Events.On("theme-changed", (event) => {
      const data = event?.data as unknown;
      const next =
        typeof data === "string"
          ? data
          : (data as { theme?: unknown } | undefined)?.theme;
      if (!isTheme(next)) return;
      localStorage.setItem(storageKey, next);
      setThemeState((prev) => (prev === next ? prev : next));
    });
    return () => unsubscribe();
  }, [storageKey]);

  const setTheme = useCallback(
    (next: Theme) => {
      localStorage.setItem(storageKey, next);
      setThemeState(next);
      // Persist + broadcast; the resulting "theme-changed" event is a no-op here
      // because the local state already matches.
      SetTheme(next).catch((err) => {
        console.error("Failed to persist theme:", err);
      });
    },
    [storageKey]
  );

  const value = useMemo<ThemeProviderState>(
    () => ({ ...appearance, theme, setTheme, resolvedTheme }),
    [appearance, theme, setTheme, resolvedTheme]
  );

  return (
    <ThemeProviderContext.Provider {...props} value={value}>
      {children}
    </ThemeProviderContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeProviderContext);
  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}
