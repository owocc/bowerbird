import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import * as React from "react";
import { ChevronRight, Sparkles, BookOpen, Download, Check } from "lucide-react";
import { getAllPlugins, usePluginsCatalog, type MarketplacePlugin } from "../data/plugins";
import { HeroFeaturedCard } from "../components/hero-featured-card";
import { getPluginIcon } from "../components/plugin-icon";
import { DesktopContext } from "../lib/desktop-context";
import { useI18n } from "../lib/i18n";

export const Route = createFileRoute("/")({
  component: AppsPage,
});

function formatLocalizedDate(date: Date, locale: string): string {
  try {
    return date.toLocaleDateString(locale === "zh" ? "zh-CN" : "en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    return date.toDateString();
  }
}

export function AppsPage() {
  const { t, locale } = useI18n();
  const navigate = useNavigate();
  const { plugins: catalogPlugins } = usePluginsCatalog();
  const { installedPlugins, installingId, installViaAPI, installViaProtocol } =
    React.useContext(DesktopContext);

  const allPlugins = catalogPlugins && catalogPlugins.length > 0 ? catalogPlugins : getAllPlugins();

  const previewPlugins = React.useMemo(
    () => allPlugins.filter((p) => p.kind === "preview"),
    [allPlugins]
  );
  const metadataPlugins = React.useMemo(
    () => allPlugins.filter((p) => p.kind === "metadata"),
    [allPlugins]
  );
  const devDataPlugins = React.useMemo(
    () =>
      allPlugins.filter(
        (p) =>
          p.subCategory === "code" ||
          p.subCategory === "data" ||
          p.subCategory === "ai"
      ),
    [allPlugins]
  );

  const featuredPlugins = allPlugins.filter((p: MarketplacePlugin) => p.featured);
  const heroPlugin = featuredPlugins[0] || allPlugins[0];
  const secondHeroPlugin = featuredPlugins[1] || allPlugins[1] || heroPlugin;
  const thirdHeroPlugin = featuredPlugins[2] || allPlugins[2] || heroPlugin;

  // List 1: Preview Plugins
  const previewList = previewPlugins.length > 0 ? previewPlugins.slice(0, 5) : allPlugins.slice(0, 5);
  // List 2: Metadata Plugins
  const metadataList = metadataPlugins.length > 0 ? metadataPlugins.slice(0, 5) : allPlugins.slice(2, 7);
  // List 3: Code & Data Plugins
  const devDataList = devDataPlugins.length > 0 ? devDataPlugins.slice(0, 5) : allPlugins.slice(4, 9);

  const dateString = React.useMemo(() => formatLocalizedDate(new Date(), locale), [locale]);

  const handleQuickInstall = (plugin: MarketplacePlugin, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (installedPlugins.has(plugin.id)) return;
    if (installViaAPI) {
      void installViaAPI(plugin);
    } else {
      installViaProtocol(plugin);
    }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 w-full space-y-8 sm:space-y-10 lg:space-y-12 bg-background text-foreground transition-colors duration-200">
      {/* Header */}
      <div className="border-b border-border pb-4">
        <p className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
          {dateString}
        </p>
        <div className="flex flex-wrap items-center justify-between gap-3 mt-1">
          <div>
            <h1 className="text-2xl sm:text-4xl font-extrabold text-foreground tracking-tight">
              {t("apps.title")}
            </h1>
            <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
              {t("apps.subtitle")}
            </p>
          </div>
          <Link
            to="/docs"
            className="inline-flex items-center gap-1.5 px-3.5 sm:px-4 py-1.5 sm:py-2 rounded-full bg-foreground text-background text-xs font-semibold hover:opacity-90 transition cursor-pointer"
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>{t("docs")}</span>
          </Link>
        </div>
      </div>

      {/* Empty State */}
      {allPlugins.length === 0 ? (
        <div className="bg-card rounded-3xl p-10 md:p-14 border border-border text-center space-y-6 shadow-xs">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-secondary flex items-center justify-center text-foreground">
            <Sparkles className="w-8 h-8 animate-pulse" />
          </div>
          <div className="space-y-2 max-w-lg mx-auto">
            <h2 className="text-2xl font-extrabold text-foreground">
              {t("apps.emptyTitle")}
            </h2>
            <p className="text-sm text-muted-foreground">
              {t("apps.emptyDesc")}
            </p>
          </div>
          <Link
            to="/docs"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary-hover active:scale-[0.98] transition-all shadow-xs"
          >
            <BookOpen className="w-4 h-4" />
            <span>{t("apps.recommendFirst")}</span>
          </Link>
        </div>
      ) : (
        <div className="space-y-8 sm:space-y-10 lg:space-y-12">
          {/* Row 1: Left Wide (Hero Banner 1), Right Narrow (Preview Plugins List) */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
            {heroPlugin && (
              <div className="lg:col-span-7 flex flex-col">
                <HeroFeaturedCard plugin={heroPlugin} tag={t("apps.heroTag1")} />
              </div>
            )}

            {/* Right Narrow: Preview Plugins List (5 cols) */}
            <div className="lg:col-span-5 bg-card rounded-2xl sm:rounded-3xl p-4 sm:p-6 border border-border flex flex-col justify-between shadow-xs">
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                      {t("apps.webCategory")}
                    </span>
                    <h2 className="text-xl font-bold text-foreground tracking-tight">
                      {t("apps.webTitle")}
                    </h2>
                  </div>
                  <Link
                    to="/category/$name"
                    params={{ name: "preview" }}
                    className="text-xs font-semibold text-foreground hover:underline flex items-center gap-0.5 cursor-pointer"
                  >
                    <span>{t("viewAll")}</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </Link>
                </div>

                <div className="divide-y divide-border">
                  {previewList.map((plugin: MarketplacePlugin, index: number) => {
                    const Icon = getPluginIcon(plugin.iconName);
                    const isInst = installedPlugins.has(plugin.id);
                    return (
                      <div
                        key={plugin.id}
                        className="py-3 first:pt-0 last:pb-0 flex items-center justify-between gap-3 group"
                      >
                        <Link
                          to="/plugins/$pluginId"
                          params={{ pluginId: plugin.id }}
                          className="flex items-center gap-3 flex-1 min-w-0 cursor-pointer"
                        >
                          <div className="w-11 h-11 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0 border border-primary/20 group-hover:scale-105 transition-transform">
                            <Icon className="w-5 h-5" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="font-semibold text-sm text-foreground truncate group-hover:text-primary transition-colors">
                                {plugin.name}
                              </span>
                              {index === 0 && (
                                <span className="text-[10px] px-1.5 py-0.5 bg-[#FF9500]/15 text-[#FF9500] font-bold rounded">
                                  {t("apps.badgeHot")}
                                </span>
                              )}
                              {index === 1 && (
                                <span className="text-[10px] px-1.5 py-0.5 bg-[#34C759]/15 text-[#34C759] font-bold rounded">
                                  {t("apps.badgeSpeed")}
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground truncate mt-0.5">
                              {plugin.tagline || plugin.description}
                            </p>
                          </div>
                        </Link>

                        <div className="shrink-0 flex items-center gap-1.5">
                          {isInst ? (
                            <span className="px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-xs font-semibold flex items-center gap-1">
                              <Check className="w-3 h-3" />
                              <span>已安装</span>
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={(e) => handleQuickInstall(plugin, e)}
                              className="px-3 py-1 rounded-full bg-secondary hover:bg-primary hover:text-primary-foreground text-foreground border border-border text-xs font-bold transition-all cursor-pointer flex items-center gap-1"
                            >
                              <Download className="w-3 h-3" />
                              <span>安装</span>
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* Row 2: Reversed! Left Narrow (Metadata Plugins List), Right Wide (Hero Banner 2) */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
            {/* Left Narrow: Metadata Plugins List (5 cols) */}
            <div className="lg:col-span-5 bg-card rounded-2xl sm:rounded-3xl p-4 sm:p-6 border border-border flex flex-col justify-between order-2 lg:order-1 shadow-xs">
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                      {t("apps.toolsCategory")}
                    </span>
                    <h2 className="text-xl font-bold text-foreground tracking-tight">
                      {t("apps.toolsTitle")}
                    </h2>
                  </div>
                  <Link
                    to="/category/$name"
                    params={{ name: "metadata" }}
                    className="text-xs font-semibold text-foreground hover:underline flex items-center gap-0.5 cursor-pointer"
                  >
                    <span>{t("viewAll")}</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </Link>
                </div>

                <div className="divide-y divide-border">
                  {metadataList.map((plugin: MarketplacePlugin, index: number) => {
                    const Icon = getPluginIcon(plugin.iconName);
                    const isInst = installedPlugins.has(plugin.id);
                    return (
                      <div
                        key={plugin.id}
                        className="py-3 first:pt-0 last:pb-0 flex items-center justify-between gap-3 group"
                      >
                        <Link
                          to="/plugins/$pluginId"
                          params={{ pluginId: plugin.id }}
                          className="flex items-center gap-3 flex-1 min-w-0 cursor-pointer"
                        >
                          <div className="w-11 h-11 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0 border border-primary/20 group-hover:scale-105 transition-transform">
                            <Icon className="w-5 h-5" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="font-semibold text-sm text-foreground truncate group-hover:text-primary transition-colors">
                                {plugin.name}
                              </span>
                              {index === 0 && (
                                <span className="text-[10px] px-1.5 py-0.5 bg-[#007AFF]/15 text-[#007AFF] font-bold rounded">
                                  {t("apps.badgeWorkflow")}
                                </span>
                              )}
                              {index === 1 && (
                                <span className="text-[10px] px-1.5 py-0.5 bg-[#AF52DE]/15 text-[#AF52DE] font-bold rounded">
                                  {t("apps.badgePraise")}
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground truncate mt-0.5">
                              {plugin.tagline || plugin.description}
                            </p>
                          </div>
                        </Link>

                        <div className="shrink-0 flex items-center gap-1.5">
                          {isInst ? (
                            <span className="px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-xs font-semibold flex items-center gap-1">
                              <Check className="w-3 h-3" />
                              <span>已安装</span>
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={(e) => handleQuickInstall(plugin, e)}
                              className="px-3 py-1 rounded-full bg-secondary hover:bg-primary hover:text-primary-foreground text-foreground border border-border text-xs font-bold transition-all cursor-pointer flex items-center gap-1"
                            >
                              <Download className="w-3 h-3" />
                              <span>安装</span>
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Right Wide: Featured Spotlight Card 2 (7 cols) */}
            {secondHeroPlugin && (
              <div className="lg:col-span-7 flex flex-col order-1 lg:order-2">
                <HeroFeaturedCard plugin={secondHeroPlugin} tag={t("apps.heroTag2")} />
              </div>
            )}
          </div>

          {/* Row 3: Left Wide (Hero Banner 3), Right Narrow (Dev & Data Plugins List) */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
            {thirdHeroPlugin && (
              <div className="lg:col-span-7 flex flex-col">
                <HeroFeaturedCard plugin={thirdHeroPlugin} tag={t("apps.heroTag3")} />
              </div>
            )}

            {/* Right Narrow: Dev & Data Plugins List (5 cols) */}
            <div className="lg:col-span-5 bg-card rounded-2xl sm:rounded-3xl p-4 sm:p-6 border border-border flex flex-col justify-between shadow-xs">
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                      {t("apps.aiCategory")}
                    </span>
                    <h2 className="text-xl font-bold text-foreground tracking-tight">
                      {t("apps.aiTitle")}
                    </h2>
                  </div>
                  <Link
                    to="/category/$name"
                    params={{ name: "code" }}
                    className="text-xs font-semibold text-foreground hover:underline flex items-center gap-0.5 cursor-pointer"
                  >
                    <span>{t("viewAll")}</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </Link>
                </div>

                <div className="divide-y divide-border">
                  {devDataList.map((plugin: MarketplacePlugin, index: number) => {
                    const Icon = getPluginIcon(plugin.iconName);
                    const isInst = installedPlugins.has(plugin.id);
                    return (
                      <div
                        key={plugin.id}
                        className="py-3 first:pt-0 last:pb-0 flex items-center justify-between gap-3 group"
                      >
                        <Link
                          to="/plugins/$pluginId"
                          params={{ pluginId: plugin.id }}
                          className="flex items-center gap-3 flex-1 min-w-0 cursor-pointer"
                        >
                          <div className="w-11 h-11 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0 border border-primary/20 group-hover:scale-105 transition-transform">
                            <Icon className="w-5 h-5" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="font-semibold text-sm text-foreground truncate group-hover:text-primary transition-colors">
                                {plugin.name}
                              </span>
                              {index === 0 && (
                                <span className="text-[10px] px-1.5 py-0.5 bg-[#FF2D55]/15 text-[#FF2D55] font-bold rounded">
                                  {t("apps.badgeGenerate")}
                                </span>
                              )}
                              {index === 1 && (
                                <span className="text-[10px] px-1.5 py-0.5 bg-[#5856D6]/15 text-[#5856D6] font-bold rounded">
                                  {t("apps.badgeAlgorithm")}
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground truncate mt-0.5">
                              {plugin.tagline || plugin.description}
                            </p>
                          </div>
                        </Link>

                        <div className="shrink-0 flex items-center gap-1.5">
                          {isInst ? (
                            <span className="px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-xs font-semibold flex items-center gap-1">
                              <Check className="w-3 h-3" />
                              <span>已安装</span>
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={(e) => handleQuickInstall(plugin, e)}
                              className="px-3 py-1 rounded-full bg-secondary hover:bg-primary hover:text-primary-foreground text-foreground border border-border text-xs font-bold transition-all cursor-pointer flex items-center gap-1"
                            >
                              <Download className="w-3 h-3" />
                              <span>安装</span>
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
