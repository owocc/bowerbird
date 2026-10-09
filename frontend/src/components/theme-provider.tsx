import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { Events } from "@wailsio/runtime";
import { GetTheme, SetTheme } from "../../bindings/bowerbird/core/service";

export type Theme = "dark" | "light" | "system";

export interface ThemeProviderProps {
  children: React.ReactNode;
  defaultTheme?: Theme;
  storageKey?: string;
}

export interface ThemeProviderState {
  theme: Theme;
  setTheme: (theme: Theme) => void;
}

const initialState: ThemeProviderState = {
  theme: "system",
  setTheme: () => null,
};

const ThemeProviderContext = createContext<ThemeProviderState>(initialState);

/** Resolves "system" to the concrete light/dark mode. */
function resolveMode(theme: Theme): "light" | "dark" {
  if (theme !== "system") return theme;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/** Applies the resolved light/dark class to <html>. */
function applyThemeClass(theme: Theme) {
  const root = window.document.documentElement;
  root.classList.remove("light", "dark");
  root.classList.add(resolveMode(theme));
}

function isTheme(value: unknown): value is Theme {
  return value === "dark" || value === "light" || value === "system";
}

/**
 * Shadcn-recommended ThemeProvider for Vite React apps.
 *
 * The colour mode is persisted through the Go backend (shared by every window)
 * and mirrored into localStorage so the first paint never flashes the wrong
 * theme. Changes are broadcast over the Wails event bus, which keeps the main
 * window and the settings window in sync in real time.
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
      if (isTheme(stored)) {
        return stored;
      }
    }
    return defaultTheme;
  });

  // Apply the class whenever the mode changes.
  useEffect(() => {
    applyThemeClass(theme);
  }, [theme]);

  // Reconcile with the persisted backend value on mount. An empty response
  // means "never chosen": migrate the local choice instead of overwriting it.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const persisted = await GetTheme();
        if (cancelled) return;
        if (isTheme(persisted)) {
          setThemeState((prev) => (prev === persisted ? prev : persisted));
          localStorage.setItem(storageKey, persisted);
        } else {
          const local = localStorage.getItem(storageKey);
          if (isTheme(local)) {
            await SetTheme(local);
          }
        }
      } catch (err) {
        console.error("Failed to load theme:", err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [storageKey]);

  // Keep windows in sync: the backend broadcasts "theme-changed" to everyone.
  useEffect(() => {
    const unsubscribe = Events.On("theme-changed", (event: any) => {
      const next = typeof event?.data === "string" ? event.data : event?.data?.theme;
      if (!isTheme(next)) return;
      localStorage.setItem(storageKey, next);
      setThemeState((prev) => (prev === next ? prev : next));
    });
    return () => unsubscribe();
  }, [storageKey]);

  // Dynamically listen for OS dark/light mode changes in real time.
  useEffect(() => {
    if (theme !== "system") return;

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = () => applyThemeClass("system");

    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, [theme]);

  const setTheme = useCallback(
    (newTheme: Theme) => {
      localStorage.setItem(storageKey, newTheme);
      setThemeState(newTheme);
      // Persist + broadcast to every other window. The resulting "theme-changed"
      // event is a no-op here because the local state already matches.
      SetTheme(newTheme).catch((err) => {
        console.error("Failed to persist theme:", err);
      });
    },
    [storageKey]
  );

  const value: ThemeProviderState = {
    theme,
    setTheme,
  };

  return (
    <ThemeProviderContext.Provider {...props} value={value}>
      {children}
    </ThemeProviderContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeProviderContext);
  if (context === undefined) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}
