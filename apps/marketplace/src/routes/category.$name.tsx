import { createFileRoute, Link } from "@tanstack/react-router";
import * as React from "react";
import { ChevronRight, BookOpen, Star } from "lucide-react";
import { getAllPlugins, PLUGIN_CATEGORIES_CONFIG, type MarketplacePlugin } from "../data/plugins";
import { getPluginIcon } from "../components/plugin-icon";
import { BuiltinBadge } from "../components/builtin-badge";
import { PluginActionButton } from "../components/plugin-action-button";
import { DesktopContext } from "../lib/desktop-context";
import { useI18n } from "../lib/i18n";

export const Route = createFileRoute("/category/$name")({
  component: CategoryPage,
});

export function CategoryPage() {
  const { name } = Route.useParams();
  const { t, locale } = useI18n();
  const { installedPlugins, installViaAPI, installViaProtocol } =
    React.useContext(DesktopContext);

  const decoded = decodeURIComponent(name || "all").trim();
  const lower = decoded.toLowerCase();

  const categoryItem = PLUGIN_CATEGORIES_CONFIG.find(
    (c) => c.id === lower || c.name.toLowerCase() === lower || c.enName.toLowerCase() === lower
  );

  const categoryParam = lower === "all" || lower === "全部" ? undefined : categoryItem ? categoryItem.id : lower;
  const categoryTitle =
    lower === "all" || lower === "全部"
      ? t("all")
      : categoryItem
      ? locale === "zh"
        ? categoryItem.name
        : categoryItem.enName
      : decoded;

  const plugins = React.useMemo(() => {
    return getAllPlugins({ category: categoryParam });
  }, [categoryParam]);

  const featuredSlice = plugins.slice(0, 8);
  const topRankSlice =
    plugins.length >= 10
      ? plugins.slice(0, 5)
      : plugins;
  const editorsChoiceSlice =
    plugins.length > 5
      ? plugins.slice(5, 10)
      : plugins;

  const handleInstall = (plugin: MarketplacePlugin, e: React.MouseEvent) => {
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
    <div className="p-4 sm:p-6 md:p-8 lg:p-10 w-full space-y-8 sm:space-y-10 max-w-[1440px] mx-auto bg-background text-foreground transition-colors duration-200">
      {/* Top Header */}
      <div className="border-b border-border pb-4 sm:pb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-4xl font-extrabold text-foreground tracking-tight">
            {categoryTitle}
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
            共收录 {plugins.length} 款官方与社区高质量扩展
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

      {plugins.length === 0 ? (
        <div className="text-center py-24 bg-card rounded-3xl border border-border shadow-xs space-y-3">
          <h3 className="text-lg font-bold text-foreground">
            {t("category.emptyTitle")}
          </h3>
          <p className="text-xs text-muted-foreground max-w-sm mx-auto">
            {t("category.emptyDesc", { category: categoryTitle })}
          </p>
        </div>
      ) : (
        <div className="space-y-8 sm:space-y-12">
          {/* Section 1: 精选 {categoryTitle} 插件 (4 cols x 2 rows) */}
          <section className="space-y-3 sm:space-y-4">
            <div className="flex items-center gap-1">
              <h2 className="text-lg sm:text-xl font-bold text-foreground tracking-tight">
                {t("category.featured", { category: categoryTitle })}
              </h2>
              <ChevronRight className="w-4 h-4 text-muted-foreground stroke-[2.5]" />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-x-6 sm:gap-y-3.5">
              {featuredSlice.map((plugin: MarketplacePlugin) => {
                const Icon = getPluginIcon(plugin.iconName);
                return (
                  <div
                    key={plugin.id}
                    className="flex items-center justify-between gap-3 p-2.5 rounded-2xl hover:bg-card/80 transition-colors group border border-transparent hover:border-border/60"
                  >
                    <Link
                      to="/plugins/$pluginId"
                      params={{ pluginId: plugin.id }}
                      className="flex items-center gap-3 min-w-0 flex-1 cursor-pointer"
                    >
                      <div className="w-12 h-12 rounded-[16px] bg-primary/10 text-primary flex items-center justify-center shrink-0 border border-primary/20 group-hover:scale-105 transition-transform">
                        <Icon className="w-6 h-6" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <h3 className="text-xs sm:text-sm font-semibold text-foreground truncate leading-tight group-hover:text-primary transition-colors">
                            {plugin.name}
                          </h3>
                          <BuiltinBadge plugin={plugin} />
                        </div>
                        <p className="text-[11px] sm:text-xs text-muted-foreground truncate mt-0.5">
                          {plugin.tagline || plugin.description}
                        </p>
                      </div>
                    </Link>

                    <div className="shrink-0">
                      <PluginActionButton plugin={plugin} onInstall={handleInstall} />
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Section 2: 热门排行 (5 columns) */}
          <section className="space-y-4">
            <div className="flex items-center gap-1">
              <h2 className="text-lg sm:text-xl font-bold text-foreground tracking-tight">
                {t("category.topCharts")}
              </h2>
              <ChevronRight className="w-4 h-4 text-muted-foreground stroke-[2.5]" />
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-5">
              {topRankSlice.map((plugin: MarketplacePlugin, index: number) => {
                const Icon = getPluginIcon(plugin.iconName);
                return (
                  <div
                    key={`rank-${plugin.id}-${index}`}
                    className="bg-card rounded-2xl sm:rounded-[24px] border border-border shadow-xs hover:shadow-md transition-all p-3.5 sm:p-5 flex flex-col justify-between items-center text-center relative min-h-[210px] sm:min-h-[230px] group"
                  >
                    {/* Rank Number */}
                    <span className="absolute top-3.5 left-4 text-sm font-black text-muted-foreground">
                      {index + 1}
                    </span>

                    <Link
                      to="/plugins/$pluginId"
                      params={{ pluginId: plugin.id }}
                      className="flex flex-col items-center w-full flex-1 justify-center mt-1 cursor-pointer"
                    >
                      <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-primary/10 text-primary flex items-center justify-center shrink-0 border border-primary/20 group-hover:scale-105 transition-transform mb-2.5">
                        <Icon className="w-7 h-7 sm:w-8 sm:h-8" />
                      </div>
                      <h4 className="text-xs sm:text-sm font-bold text-foreground line-clamp-1 w-full px-1 group-hover:text-primary transition-colors">
                        {plugin.name}
                      </h4>
                      <div className="mt-1">
                        <BuiltinBadge plugin={plugin} />
                      </div>
                      <p className="text-[11px] sm:text-xs text-muted-foreground line-clamp-1 mt-1 w-full px-1">
                        {plugin.tagline || plugin.description}
                      </p>
                      <div className="flex items-center gap-1 text-[10px] text-muted-foreground mt-1">
                        <Star className="w-3 h-3 fill-[#FF9500] text-[#FF9500]" />
                        <span>{plugin.rating}</span>
                        <span>•</span>
                        <span>{plugin.downloadsCount} 次</span>
                      </div>
                    </Link>

                    {/* Bottom Action */}
                    <div className="mt-2 w-full flex justify-center">
                      <PluginActionButton plugin={plugin} onInstall={handleInstall} />
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Section 3: 精选推荐 (5 columns) */}
          <section className="space-y-4">
            <div className="flex items-center gap-1">
              <h2 className="text-lg sm:text-xl font-bold text-foreground tracking-tight">
                {t("category.editorsChoice")}
              </h2>
              <ChevronRight className="w-4 h-4 text-muted-foreground stroke-[2.5]" />
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-5">
              {editorsChoiceSlice.map((plugin: MarketplacePlugin, index: number) => {
                const Icon = getPluginIcon(plugin.iconName);
                return (
                  <div
                    key={`editor-${plugin.id}-${index}`}
                    className="bg-card rounded-2xl sm:rounded-[24px] border border-border shadow-xs hover:shadow-md transition-all p-3.5 sm:p-5 flex flex-col justify-between items-center text-center relative min-h-[210px] sm:min-h-[230px] group"
                  >
                    <span className="absolute top-3.5 left-4 text-sm font-black text-muted-foreground">
                      {index + 1}
                    </span>

                    <Link
                      to="/plugins/$pluginId"
                      params={{ pluginId: plugin.id }}
                      className="flex flex-col items-center w-full flex-1 justify-center mt-1 cursor-pointer"
                    >
                      <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-primary/10 text-primary flex items-center justify-center shrink-0 border border-primary/20 group-hover:scale-105 transition-transform mb-2.5">
                        <Icon className="w-7 h-7 sm:w-8 sm:h-8" />
                      </div>
                      <h4 className="text-xs sm:text-sm font-bold text-foreground line-clamp-1 w-full px-1 group-hover:text-primary transition-colors">
                        {plugin.name}
                      </h4>
                      <div className="mt-1">
                        <BuiltinBadge plugin={plugin} />
                      </div>
                      <p className="text-[11px] sm:text-xs text-muted-foreground line-clamp-1 mt-1 w-full px-1">
                        {plugin.tagline || plugin.description}
                      </p>
                      <div className="flex items-center gap-1 text-[10px] text-muted-foreground mt-1">
                        <Star className="w-3 h-3 fill-[#FF9500] text-[#FF9500]" />
                        <span>{plugin.rating}</span>
                        <span>•</span>
                        <span>{plugin.downloadsCount} 次</span>
                      </div>
                    </Link>

                    <div className="mt-2 w-full flex justify-center">
                      <PluginActionButton plugin={plugin} onInstall={handleInstall} />
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
