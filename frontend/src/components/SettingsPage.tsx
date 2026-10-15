import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Check,
  Monitor,
  Moon,
  Sun,
  Settings2,
  Blocks,
  Lock,
  FileImage,
  FileVideo,
  Puzzle,
  ZoomIn,
} from "lucide-react";
import { MacTrafficLightSpacer } from "@/components/MacTrafficLightSpacer";
import { useTheme, type Theme } from "@/components/theme-provider";
import { Badge } from "@/components/ui/badge";
import {
  previewRegistry,
  usePreviewPlugins,
  type PreviewPluginStatus,
} from "@/plugins/preview/registry";
import { cn } from "@/lib/utils";

type SettingsSectionId = "general" | "plugins";

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

function PluginIcon({ pluginId, className }: { pluginId: string; className?: string }) {
  switch (pluginId) {
    case "builtin.image":
      return <FileImage className={className} />;
    case "builtin.video":
      return <FileVideo className={className} />;
    default:
      return <Puzzle className={className} />;
  }
}

function PluginCard({ item }: { item: PreviewPluginStatus }) {
  const { t } = useTranslation();
  const { plugin, enabled, canDisable } = item;

  const displayName = plugin.nameKey ? t(plugin.nameKey) : plugin.name;
  const displayDescription = plugin.descriptionKey
    ? t(plugin.descriptionKey)
    : plugin.description;

  const extensions = plugin.extensions ?? [];

  return (
    <div className="rounded-xl border border-border/60 bg-card/60 p-4 transition-colors hover:border-border">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0">
          <div className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <PluginIcon pluginId={plugin.id} className="size-4.5" />
          </div>
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-xs font-semibold text-foreground truncate">
                {displayName}
              </h3>
              <span className="text-[10px] font-mono text-muted-foreground">
                {plugin.id}
              </span>
              {plugin.version && (
                <Badge
                  variant="secondary"
                  className="h-4 px-1.5 text-[10px] font-mono"
                >
                  v{plugin.version}
                </Badge>
              )}
              {plugin.builtin && (
                <Badge
                  variant="outline"
                  className="h-4 px-1.5 text-[10px] border-primary/30 bg-primary/5 text-primary"
                >
                  {t("settings.plugins.builtinBadge")}
                </Badge>
              )}
              {plugin.supportsZoom && (
                <Badge
                  variant="secondary"
                  className="h-4 px-1.5 text-[10px] gap-1"
                >
                  <ZoomIn className="size-2.5" />
                  {t("settings.plugins.supportsZoom")}
                </Badge>
              )}
            </div>

            {displayDescription && (
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                {displayDescription}
              </p>
            )}
          </div>
        </div>

        {/* Enable / Disable Control (Built-in core plugins are locked and cannot be disabled) */}
        <div className="shrink-0 flex items-center gap-2">
          {!canDisable ? (
            <div
              title={t("settings.plugins.cannotDisableHint")}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border/60 bg-muted/40 px-2.5 py-1 text-[11px] font-medium text-muted-foreground cursor-not-allowed"
            >
              <Lock className="size-3 text-muted-foreground/80" />
              <span>{t("settings.plugins.alwaysEnabled")}</span>
            </div>
          ) : (
            <button
              type="button"
              role="switch"
              aria-checked={enabled}
              onClick={() => previewRegistry.setEnabled(plugin.id, !enabled)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-medium transition-colors cursor-pointer",
                enabled
                  ? "border-primary/40 bg-primary/10 text-primary hover:bg-primary/15"
                  : "border-border/60 bg-muted/30 text-muted-foreground hover:bg-muted/60 hover:text-foreground"
              )}
            >
              <span
                className={cn(
                  "size-1.5 rounded-full",
                  enabled ? "bg-primary" : "bg-muted-foreground/50"
                )}
              />
              <span>
                {enabled
                  ? t("settings.plugins.enabled")
                  : t("settings.plugins.disabled")}
              </span>
            </button>
          )}
        </div>
      </div>

      {extensions.length > 0 && (
        <div className="mt-3 pt-3 border-t border-border/40 flex items-start gap-2">
          <span className="text-[10px] font-medium text-muted-foreground shrink-0 pt-0.5">
            {t("settings.plugins.supportedFormats")}:
          </span>
          <div className="flex flex-wrap gap-1">
            {extensions.map((ext) => (
              <span
                key={ext}
                className="rounded-md bg-muted/60 px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground"
              >
                .{ext}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Settings window with a 2-column sidebar layout:
 * - General Settings (Colour mode)
 * - Plugin Management (Installed preview plugins, built-in Image & Video locked on)
 */
export function SettingsPage() {
  const { t } = useTranslation();
  const { theme, setTheme } = useTheme();
  const [activeSection, setActiveSection] = useState<SettingsSectionId>("general");
  const installedPlugins = usePreviewPlugins();

  const navItems: {
    id: SettingsSectionId;
    label: string;
    icon: typeof Settings2;
    badge?: number;
  }[] = [
    {
      id: "general",
      label: t("settings.nav.general"),
      icon: Settings2,
    },
    {
      id: "plugins",
      label: t("settings.nav.plugins"),
      icon: Blocks,
      badge: installedPlugins.length,
    },
  ];

  return (
    <div className="h-screen w-screen overflow-hidden flex bg-background text-foreground antialiased select-none">
      {/* Left Navigation Sidebar */}
      <aside className="w-56 shrink-0 border-r border-sidebar-border bg-sidebar text-sidebar-foreground flex flex-col select-none">
        <div className="h-(--titlebar-height) px-3 flex items-center gap-2 shrink-0 wails-drag">
          <MacTrafficLightSpacer className="w-[72px] h-(--titlebar-height) shrink-0" />
          <span className="text-xs font-semibold tracking-tight text-sidebar-foreground truncate">
            {t("settings.title")}
          </span>
          <div className="flex-1 h-full" />
        </div>

        <nav
          aria-label={t("settings.title")}
          className="flex-1 px-2.5 py-2 space-y-1 overflow-y-auto wails-no-drag"
        >
          {navItems.map(({ id, label, icon: Icon, badge }) => {
            const isActive = activeSection === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setActiveSection(id)}
                className={cn(
                  "w-full flex items-center gap-2.5 h-8 px-2.5 rounded-lg text-xs transition-colors cursor-pointer",
                  isActive
                    ? "bg-primary/10 text-primary font-semibold shadow-2xs"
                    : "text-sidebar-foreground/80 hover:bg-sidebar-accent/70 hover:text-sidebar-foreground"
                )}
              >
                <Icon
                  className={cn(
                    "size-4 shrink-0",
                    isActive ? "text-primary" : "text-muted-foreground"
                  )}
                />
                <span className="flex-1 text-left truncate">{label}</span>
                {badge !== undefined && (
                  <span
                    className={cn(
                      "rounded-md px-1.5 py-0.5 text-[10px] font-mono",
                      isActive
                        ? "bg-primary/15 text-primary"
                        : "bg-sidebar-accent text-muted-foreground"
                    )}
                  >
                    {badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </aside>

      {/* Right Content Area */}
      <main className="flex-1 flex flex-col min-w-0 bg-background overflow-hidden">
        <header className="h-(--titlebar-height) shrink-0 border-b border-border/60 px-6 flex items-center justify-between bg-background/80 backdrop-blur wails-drag">
          <h1 className="text-xs font-semibold tracking-tight text-foreground">
            {activeSection === "general"
              ? t("settings.nav.general")
              : t("settings.nav.plugins")}
          </h1>
          <div className="flex-1 h-full" />
        </header>

        <div className="flex-1 overflow-y-auto p-6 wails-no-drag">
          {activeSection === "general" && (
            <div className="max-w-xl space-y-6">
              <section className="space-y-3">
                <div className="space-y-0.5">
                  <h2 className="text-xs font-semibold">
                    {t("settings.appearance.title")}
                  </h2>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    {t("settings.appearance.description")}
                  </p>
                </div>

                <div className="grid grid-cols-3 gap-3" role="radiogroup">
                  {THEME_OPTIONS.map(
                    ({ value, icon: Icon, labelKey, descriptionKey }) => {
                      const selected = theme === value;
                      return (
                        <button
                          key={value}
                          type="button"
                          role="radio"
                          aria-checked={selected}
                          onClick={() => setTheme(value)}
                          className={cn(
                            "group relative flex flex-col items-center gap-1.5 rounded-xl border p-3.5 text-center transition-colors cursor-pointer",
                            selected
                              ? "border-primary bg-primary/10 text-foreground"
                              : "border-border/60 bg-muted/30 text-muted-foreground hover:border-border hover:bg-muted/60 hover:text-foreground"
                          )}
                        >
                          {selected && (
                            <span className="absolute right-2 top-2 flex size-4 items-center justify-center rounded-full bg-primary text-primary-foreground">
                              <Check className="size-2.5" />
                            </span>
                          )}
                          <Icon className="size-5" />
                          <span className="text-[11px] font-medium">
                            {t(labelKey)}
                          </span>
                          <span className="text-[10px] leading-tight text-muted-foreground">
                            {t(descriptionKey)}
                          </span>
                        </button>
                      );
                    }
                  )}
                </div>
              </section>
            </div>
          )}

          {activeSection === "plugins" && (
            <div className="max-w-2xl space-y-4">
              <div className="flex items-center justify-between gap-4">
                <div className="space-y-0.5">
                  <h2 className="text-xs font-semibold">
                    {t("settings.plugins.title")}
                  </h2>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    {t("settings.plugins.description")}
                  </p>
                </div>
                <Badge variant="secondary" className="text-[11px] font-mono">
                  {t("settings.plugins.installedCount", {
                    count: installedPlugins.length,
                  })}
                </Badge>
              </div>

              <div className="space-y-3">
                {installedPlugins.map((item) => (
                  <PluginCard key={item.plugin.id} item={item} />
                ))}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
