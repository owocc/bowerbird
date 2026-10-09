import { useTranslation } from "react-i18next";
import { Check, Monitor, Moon, Sun } from "lucide-react";
import { MainHeaderSafePrefix } from "@/components/MainHeaderSafePrefix";
import { useTheme, type Theme } from "@/components/theme-provider";

interface ThemeOption {
  value: Theme;
  icon: typeof Sun;
  labelKey: string;
  descriptionKey: string;
}

const THEME_OPTIONS: ThemeOption[] = [
  {
    value: "light",
    icon: Sun,
    labelKey: "settings.appearance.light",
    descriptionKey: "settings.appearance.lightDescription",
  },
  {
    value: "dark",
    icon: Moon,
    labelKey: "settings.appearance.dark",
    descriptionKey: "settings.appearance.darkDescription",
  },
  {
    value: "system",
    icon: Monitor,
    labelKey: "settings.appearance.auto",
    descriptionKey: "settings.appearance.autoDescription",
  },
];

/**
 * Settings window contents. For now it only exposes the colour mode; the
 * dedicated Wails window and route give future settings a natural home.
 */
export function SettingsPage() {
  const { t } = useTranslation();
  const { theme, setTheme } = useTheme();

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground antialiased select-none">
      <header className="shrink-0 border-b border-border/60 bg-background/80 backdrop-blur">
        <div className="h-(--titlebar-height) px-3 flex items-center justify-between">
          <MainHeaderSafePrefix sidebarOpen={false}>
            <span className="text-xs font-semibold tracking-tight truncate">
              {t("settings.title")}
            </span>
          </MainHeaderSafePrefix>
          <div className="flex-1 h-full min-w-4 wails-drag" />
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-5 space-y-6 wails-no-drag">
        <section className="space-y-3">
          <div className="space-y-0.5">
            <h2 className="text-xs font-semibold">{t("settings.appearance.title")}</h2>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              {t("settings.appearance.description")}
            </p>
          </div>

          <div className="grid grid-cols-3 gap-2.5" role="radiogroup">
            {THEME_OPTIONS.map(({ value, icon: Icon, labelKey, descriptionKey }) => {
              const selected = theme === value;
              return (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => setTheme(value)}
                  className={`group relative flex flex-col items-center gap-1.5 rounded-xl border p-3 text-center transition-colors cursor-pointer ${
                    selected
                      ? "border-primary bg-primary/10 text-foreground"
                      : "border-border/60 bg-muted/30 text-muted-foreground hover:border-border hover:bg-muted/60 hover:text-foreground"
                  }`}
                >
                  {selected && (
                    <span className="absolute right-2 top-2 flex size-4 items-center justify-center rounded-full bg-primary text-primary-foreground">
                      <Check className="size-2.5" />
                    </span>
                  )}
                  <Icon className="size-5" />
                  <span className="text-[11px] font-medium">{t(labelKey)}</span>
                  <span className="text-[10px] leading-tight text-muted-foreground">
                    {t(descriptionKey)}
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}
