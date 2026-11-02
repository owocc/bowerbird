import * as React from "react";
import { ScriptOnce } from "@tanstack/react-router";

/**
 * 主题系统，按 shadcn 的 TanStack Start 指南实现：
 * - `<ScriptOnce>` 在浏览器首次绘制前读取 localStorage 并设置 `<html>` 的
 *   light/dark 类，避免服务端默认主题带来的闪烁，同时保证首屏就渲染出
 *   完整的主题切换控件；
 * - Provider 持有主题状态，选择时写 localStorage 并同步 `<html>`；
 * - 选择“跟随系统”时监听 `prefers-color-scheme` 变化。
 */

export type Theme = "system" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";

/** 存储键前缀，与 Bowerbird 主站保持一致。 */
const STORAGE_PREFIX = "bowerbird";

/** 主题存储键。 */
export const THEME_STORAGE_KEY = `${STORAGE_PREFIX}-web-theme`;

const DARK_QUERY = "(prefers-color-scheme: dark)";

export interface ThemeProviderState {
  theme: Theme;
  /** `theme` 中的 “system” 已按系统外观解析后的结果。 */
  resolvedTheme: ResolvedTheme;
  setTheme: (theme: Theme) => void;
}

export function isTheme(value: unknown): value is Theme {
  return value === "light" || value === "dark" || value === "system";
}

const ThemeProviderContext = React.createContext<ThemeProviderState>({
  theme: "system",
  resolvedTheme: "dark",
  setTheme: () => {},
});

/**
 * 首次绘制前执行的内联脚本：读取持久化主题，解析系统外观，
 * 直接给 `<html>` 打上最终类名，避免样式闪烁。
 */
function getThemeScript(storageKey: string, defaultTheme: Theme): string {
  const key = JSON.stringify(storageKey);
  const fallback = JSON.stringify(defaultTheme);

  return (
    "(function(){try{" +
    `var t=localStorage.getItem(${key});` +
    "if(t!=='light'&&t!=='dark'&&t!=='system'){t=null}" +
    `if(!t){t=${fallback}}` +
    "var r=t==='system'?(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):t;" +
    "var e=document.documentElement;" +
    "e.classList.remove('light','dark');e.classList.add(r);e.style.colorScheme=r;" +
    "}catch(e){}})();"
  );
}

/** 把解析后的主题写到 `<html>` 上。 */
function applyTheme(resolved: ResolvedTheme) {
  const root = window.document.documentElement;
  root.classList.remove("light", "dark");
  root.classList.add(resolved);
  root.style.colorScheme = resolved;
}

export interface ThemeProviderProps {
  children: React.ReactNode;
  defaultTheme?: Theme;
  storageKey?: string;
}

export function ThemeProvider({
  children,
  defaultTheme = "system",
  storageKey = THEME_STORAGE_KEY,
}: ThemeProviderProps) {
  const [theme, setThemeState] = React.useState<Theme>(defaultTheme);
  // 服务端与首次客户端渲染保持一致（与 CSS 的 :root 默认深色相同），
  // 真实系统外观在挂载后同步，避免 hydration 不匹配。
  const [systemTheme, setSystemTheme] = React.useState<ResolvedTheme>("dark");
  const [mounted, setMounted] = React.useState(false);

  // 挂载后恢复持久化主题，同步一次系统外观，并立即把最终主题应用到 DOM——
  // 这里直接用刚算出的值，避免覆盖掉首屏脚本已经设置好的主题。
  React.useEffect(() => {
    let nextTheme: Theme = defaultTheme;
    try {
      const stored = localStorage.getItem(storageKey);
      if (isTheme(stored)) nextTheme = stored;
    } catch {
      // localStorage 不可用（隐私模式 / 受限环境）时退回默认主题。
    }

    const nextSystemTheme: ResolvedTheme = window.matchMedia(DARK_QUERY).matches
      ? "dark"
      : "light";

    setThemeState(nextTheme);
    setSystemTheme(nextSystemTheme);
    applyTheme(nextTheme === "system" ? nextSystemTheme : nextTheme);
    setMounted(true);
  }, [defaultTheme, storageKey]);

  const resolvedTheme: ResolvedTheme = theme === "system" ? systemTheme : theme;

  // 主题变化时同步 `<html>` 的 class 与 color-scheme。
  React.useEffect(() => {
    if (!mounted) return;
    applyTheme(resolvedTheme);
  }, [mounted, resolvedTheme]);

  // 跟随系统时，系统外观切换要立即生效。
  React.useEffect(() => {
    if (theme !== "system" || typeof window === "undefined") return;

    const media = window.matchMedia(DARK_QUERY);
    const onChange = () => setSystemTheme(media.matches ? "dark" : "light");
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [theme]);

  const setTheme = React.useCallback(
    (next: Theme) => {
      setThemeState(next);
      try {
        localStorage.setItem(storageKey, next);
      } catch {
        // 无法持久化时仅保留本次会话的选择。
      }
    },
    [storageKey]
  );

  const value = React.useMemo<ThemeProviderState>(
    () => ({ theme, resolvedTheme, setTheme }),
    [theme, resolvedTheme, setTheme]
  );

  return (
    <ThemeProviderContext.Provider value={value}>
      <ScriptOnce>{getThemeScript(storageKey, defaultTheme)}</ScriptOnce>
      {children}
    </ThemeProviderContext.Provider>
  );
}

export function useTheme(): ThemeProviderState {
  return React.useContext(ThemeProviderContext);
}
