import * as React from "react";
import { Monitor, Sun, Moon } from "lucide-react";
import { useTheme, type Theme } from "./theme-provider";
import { useI18n } from "../lib/i18n";

const OPTIONS: {
  value: Theme;
  icon: React.ComponentType<{ className?: string }>;
  labelKey: string;
}[] = [
  { value: "system", icon: Monitor, labelKey: "themeSystem" },
  { value: "light", icon: Sun, labelKey: "themeLight" },
  { value: "dark", icon: Moon, labelKey: "themeDark" },
];

/**
 * 三态主题切换（跟随系统 / 浅色 / 深色）。
 *
 * 不依赖 `mounted` 之类的客户端状态，服务端即可渲染出完整控件——主题状态
 * 由 ThemeProvider 统一持有，首个客户端渲染与 SSR 一致，随后再恢复用户选择。
 */
export function ThemeToggle({ className = "" }: { className?: string }) {
  const { theme, setTheme } = useTheme();
  const { t } = useI18n();

  return (
    <div
      role="radiogroup"
      aria-label={t("theme")}
      className={`inline-flex items-center p-0.5 rounded-full border border-border bg-surface/80 text-muted-foreground shadow-2xs ${className}`}
    >
      {OPTIONS.map(({ value, icon: Icon, labelKey }) => {
        const selected = theme === value;
        const label = t(labelKey);
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => setTheme(value)}
            title={label}
            className={`p-1.5 rounded-full transition-all duration-150 cursor-pointer ${
              selected
                ? "bg-card text-foreground shadow-2xs font-semibold"
                : "text-muted-foreground hover:text-foreground hover:bg-black/5 dark:hover:bg-white/5"
            }`}
          >
            <Icon className="w-3.5 h-3.5" />
            <span className="sr-only">{label}</span>
          </button>
        );
      })}
    </div>
  );
}
