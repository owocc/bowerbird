import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import * as React from "react";
import {
  Search,
  Filter,
  Download,
  Check,
  Sparkles,
  Layers,
  FileText,
  Music,
  Table,
  Camera,
  Box,
  Star,
  ExternalLink,
  ChevronRight,
  Info,
  Laptop,
} from "lucide-react";
import { OFFICIAL_PLUGINS, type MarketplacePlugin } from "../data/plugins";
import { I18nContext } from "../lib/i18n";
import { DesktopContext } from "../lib/desktop-context";

export const Route = createFileRoute("/")({
  component: MarketplaceCatalog,
});

function getIconComponent(iconName: MarketplacePlugin["iconName"]) {
  switch (iconName) {
    case "file-text":
      return FileText;
    case "music":
      return Music;
    case "table":
      return Table;
    case "camera":
      return Camera;
    case "sparkles":
      return Sparkles;
    default:
      return Box;
  }
}

function MarketplaceCatalog() {
  const { t } = React.useContext(I18nContext);
  const { connected, installedPlugins, installingId, installViaAPI, installViaProtocol } =
    React.useContext(DesktopContext);

  const [searchQuery, setSearchQuery] = React.useState<string>("");
  const [selectedCategory, setSelectedCategory] = React.useState<"all" | "preview" | "metadata">("all");
  const [selectedFormat, setSelectedFormat] = React.useState<string>("all");

  // Collect all available format extensions across plugins
  const allFormats = React.useMemo(() => {
    const set = new Set<string>();
    for (const p of OFFICIAL_PLUGINS) {
      for (const ext of p.extensions) {
        set.add(ext.toLowerCase().replace(/^\./, ""));
      }
    }
    return Array.from(set).sort();
  }, []);

  const filteredPlugins = React.useMemo(() => {
    return OFFICIAL_PLUGINS.filter((plugin) => {
      // Category filter
      if (selectedCategory !== "all" && plugin.category !== selectedCategory) {
        return false;
      }
      // Format filter
      if (selectedFormat !== "all") {
        const hasFormat = plugin.extensions.some(
          (ext) => ext.toLowerCase().replace(/^\./, "") === selectedFormat.toLowerCase()
        );
        if (!hasFormat) return false;
      }
      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesName = plugin.name.toLowerCase().includes(q);
        const matchesDesc = plugin.description.toLowerCase().includes(q);
        const matchesExt = plugin.extensions.some((ext) => ext.toLowerCase().includes(q));
        const matchesAuthor = plugin.author.toLowerCase().includes(q);
        return matchesName || matchesDesc || matchesExt || matchesAuthor;
      }
      return true;
    });
  }, [searchQuery, selectedCategory, selectedFormat]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 sm:py-12 w-full space-y-8">
      {/* Hero Banner */}
      <div className="relative overflow-hidden rounded-2xl border border-border/70 bg-gradient-to-br from-card via-card to-primary/5 p-6 sm:p-10 shadow-sm">
        <div className="max-w-3xl space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-primary/10 text-primary border border-primary/20">
            <Sparkles className="size-3.5" />
            <span>Official & Community Ecosystem</span>
          </div>
          <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight text-foreground">
            {t("catalogTitle")}
          </h1>
          <p className="text-sm sm:text-base text-muted-foreground leading-relaxed">
            {t("catalogSubtitle")}
          </p>
        </div>

        {/* Desktop Helper Notice */}
        {!connected && (
          <div className="mt-6 flex items-start gap-3 rounded-xl border border-border/80 bg-background/80 p-4 text-xs text-muted-foreground max-w-2xl">
            <Info className="size-4 text-primary shrink-0 mt-0.5" />
            <div className="space-y-1">
              <span className="font-semibold text-foreground">Bowerbird Desktop integration</span>
              <p>{t("desktopHelp")}</p>
            </div>
          </div>
        )}
      </div>

      {/* Search and Filters */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
        {/* Search Input */}
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t("searchPlaceholder")}
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-border bg-card text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-all shadow-2xs"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground hover:text-foreground cursor-pointer"
            >
              Clear
            </button>
          )}
        </div>

        {/* Category & Format Tabs */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Category Tabs */}
          <div className="inline-flex p-1 rounded-xl bg-muted/60 border border-border/70 text-xs font-medium">
            <button
              type="button"
              onClick={() => setSelectedCategory("all")}
              className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                selectedCategory === "all"
                  ? "bg-card text-foreground font-semibold shadow-2xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t("categoryAll")}
            </button>
            <button
              type="button"
              onClick={() => setSelectedCategory("preview")}
              className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                selectedCategory === "preview"
                  ? "bg-card text-foreground font-semibold shadow-2xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t("categoryPreview")}
            </button>
            <button
              type="button"
              onClick={() => setSelectedCategory("metadata")}
              className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                selectedCategory === "metadata"
                  ? "bg-card text-foreground font-semibold shadow-2xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t("categoryMetadata")}
            </button>
          </div>

          {/* Format dropdown */}
          <select
            value={selectedFormat}
            onChange={(e) => setSelectedFormat(e.target.value)}
            className="px-3 py-2 rounded-xl border border-border bg-card text-xs font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 cursor-pointer shadow-2xs"
          >
            <option value="all">All Formats</option>
            {allFormats.map((ext) => (
              <option key={ext} value={ext}>
                .{ext}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Plugins Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-6">
        {filteredPlugins.map((plugin) => {
          const Icon = getIconComponent(plugin.iconName);
          const isInstalled = installedPlugins.has(plugin.id);
          const isInstalling = installingId === plugin.id;

          return (
            <div
              key={plugin.id}
              className="group flex flex-col justify-between rounded-2xl border border-border/70 bg-card hover:border-primary/50 transition-all duration-200 hover:shadow-md p-6 relative overflow-hidden"
            >
              {/* Card Header */}
              <div className="space-y-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="size-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0 border border-primary/20 group-hover:scale-105 transition-transform">
                      <Icon className="size-6" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <Link
                          to="/plugins/$pluginId"
                          params={{ pluginId: plugin.id }}
                          className="font-bold text-base text-foreground hover:text-primary transition-colors inline-flex items-center gap-1"
                        >
                          {plugin.name}
                        </Link>
                        {plugin.featured && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                            Featured
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground flex items-center gap-2 mt-0.5">
                        <span>by {plugin.author}</span>
                        <span>•</span>
                        <span className="font-mono">v{plugin.version}</span>
                      </div>
                    </div>
                  </div>

                  {/* Status Indicator */}
                  {isInstalled ? (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                      <Check className="size-3.5" />
                      <span>{t("installed")}</span>
                    </span>
                  ) : null}
                </div>

                {/* Description */}
                <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed line-clamp-3">
                  {plugin.description}
                </p>

                {/* Format Badges */}
                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                  <span className="text-[11px] font-medium text-muted-foreground mr-1">
                    Formats:
                  </span>
                  {plugin.extensions.map((ext) => (
                    <span
                      key={ext}
                      className="px-2 py-0.5 rounded-md bg-muted text-[11px] font-mono font-medium text-muted-foreground border border-border/50"
                    >
                      .{ext.replace(/^\./, "")}
                    </span>
                  ))}
                </div>
              </div>

              {/* Card Footer */}
              <div className="mt-6 pt-4 border-t border-border/60 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1 font-medium">
                    <Star className="size-3.5 fill-amber-400 text-amber-400" />
                    <span>{plugin.rating}</span>
                  </span>
                  <span>•</span>
                  <span>{plugin.downloadsCount} installs</span>
                </div>

                <div className="flex items-center gap-2">
                  <Link
                    to="/plugins/$pluginId"
                    params={{ pluginId: plugin.id }}
                    className="px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted rounded-lg transition-colors"
                  >
                    {t("openDetails")}
                  </Link>

                  {isInstalled ? (
                    <button
                      type="button"
                      disabled
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-muted text-muted-foreground cursor-default flex items-center gap-1.5"
                    >
                      <Check className="size-3.5" />
                      <span>{t("installed")}</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => (connected ? installViaAPI(plugin) : installViaProtocol(plugin))}
                      disabled={isInstalling}
                      className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 transition-all flex items-center gap-1.5 shadow-xs cursor-pointer disabled:opacity-50"
                      title={connected ? "1-Click Direct Install" : "Install via bowerbird:// protocol"}
                    >
                      <Download className="size-3.5" />
                      <span>{isInstalling ? t("installing") : t("installPlugin")}</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {filteredPlugins.length === 0 && (
        <div className="text-center py-16 border border-dashed border-border rounded-2xl p-8 space-y-3">
          <p className="text-base font-semibold text-foreground">No plugins found matching your query</p>
          <p className="text-xs text-muted-foreground">
            Try adjusting your search terms or clearing format filters.
          </p>
          <button
            type="button"
            onClick={() => {
              setSearchQuery("");
              setSelectedCategory("all");
              setSelectedFormat("all");
            }}
            className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-semibold cursor-pointer"
          >
            Reset Filters
          </button>
        </div>
      )}
    </div>
  );
}
