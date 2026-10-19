import * as React from "react";
import { useTheme } from "./theme-context";
import { Monitor, Sun, Moon } from "lucide-react";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div className="inline-flex items-center p-0.5 rounded-full border border-border bg-surface/70 w-[84px] h-[28px]" />
    );
  }

  return (
    <div
      role="radiogroup"
      aria-label="选择主题模式"
      className="inline-flex items-center p-0.5 rounded-full border border-border bg-surface/80 text-muted-foreground shadow-2xs"
    >
      {/* 1. System Mode */}
      <button
        type="button"
        role="radio"
        aria-checked={theme === "system"}
        onClick={() => setTheme("system")}
        title="系统跟随 (System)"
        className={`p-1.5 rounded-full transition-all duration-150 cursor-pointer ${
          theme === "system"
            ? "bg-card text-foreground shadow-2xs font-semibold"
            : "text-muted-foreground hover:text-foreground hover:bg-black/5 dark:hover:bg-white/5"
        }`}
      >
        <Monitor className="w-3.5 h-3.5" />
        <span className="sr-only">系统模式</span>
      </button>

      {/* 2. Light Mode */}
      <button
        type="button"
        role="radio"
        aria-checked={theme === "light"}
        onClick={() => setTheme("light")}
        title="浅色模式 (Light)"
        className={`p-1.5 rounded-full transition-all duration-150 cursor-pointer ${
          theme === "light"
            ? "bg-card text-foreground shadow-2xs font-semibold"
            : "text-muted-foreground hover:text-foreground hover:bg-black/5 dark:hover:bg-white/5"
        }`}
      >
        <Sun className="w-3.5 h-3.5" />
        <span className="sr-only">浅色模式</span>
      </button>

      {/* 3. Dark Mode */}
      <button
        type="button"
        role="radio"
        aria-checked={theme === "dark"}
        onClick={() => setTheme("dark")}
        title="深色模式 (Dark)"
        className={`p-1.5 rounded-full transition-all duration-150 cursor-pointer ${
          theme === "dark"
            ? "bg-card text-foreground shadow-2xs font-semibold"
            : "text-muted-foreground hover:text-foreground hover:bg-black/5 dark:hover:bg-white/5"
        }`}
      >
        <Moon className="w-3.5 h-3.5" />
        <span className="sr-only">深色模式</span>
      </button>
    </div>
  );
}
