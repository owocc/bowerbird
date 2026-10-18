import * as React from "react";
import { Link } from "@tanstack/react-router";
import { Check, Star, Download, ExternalLink } from "lucide-react";
import type { MarketplacePlugin } from "../data/plugins";
import { getPluginIcon } from "./plugin-icon";
import { DesktopContext } from "../lib/desktop-context";

interface Props {
  plugin: MarketplacePlugin;
}

export function SearchCard({ plugin }: Props) {
  const { installedPlugins, installingId, installViaAPI, installViaProtocol } =
    React.useContext(DesktopContext);

  const isInstalled = installedPlugins.has(plugin.id);
  const isInstalling = installingId === plugin.id;
  const Icon = getPluginIcon(plugin.iconName);

  const handleInstall = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (isInstalled || isInstalling) return;
    if (installViaAPI) {
      void installViaAPI(plugin);
    } else {
      installViaProtocol(plugin);
    }
  };

  const screenshots =
    plugin.screenshots && plugin.screenshots.length > 0
      ? plugin.screenshots
      : plugin.cover_url
      ? [plugin.cover_url]
      : [];

  const gridColsClass =
    screenshots.length === 1
      ? "grid-cols-1"
      : screenshots.length === 2
      ? "grid-cols-2"
      : "grid-cols-1 sm:grid-cols-3";

  return (
    <div className="bg-card rounded-2xl sm:rounded-3xl p-4 sm:p-5 border border-border hover:border-neutral-400/70 transition-colors flex flex-col justify-between group shadow-xs">
      {/* Top Row: Icon, Title, Rating, Install/View Button */}
      <div className="flex items-start justify-between gap-3 mb-4">
        <Link
          to="/plugins/$pluginId"
          params={{ pluginId: plugin.id }}
          className="flex items-center gap-3 min-w-0 cursor-pointer"
        >
          <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0 border border-primary/20 group-hover:scale-105 transition-transform">
            <Icon className="w-5 h-5 sm:w-6 sm:h-6" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-sm text-foreground truncate group-hover:text-primary transition-colors">
                {plugin.name}
              </h3>
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-muted text-muted-foreground border border-border">
                v{plugin.version}
              </span>
            </div>

            <div className="flex flex-wrap gap-1 mt-1">
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-secondary text-secondary-foreground font-medium border border-border/60">
                {plugin.kind === "preview" ? "预览扩展" : "元数据透视"}
              </span>
              {plugin.extensions.slice(0, 3).map((ext) => (
                <span
                  key={ext}
                  className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-muted text-muted-foreground border border-border/50"
                >
                  .{ext}
                </span>
              ))}
            </div>

            <div className="flex items-center gap-2 text-[11px] text-muted-foreground mt-1">
              <span className="flex items-center gap-0.5 text-[#FF9500] font-semibold">
                <Star className="w-3 h-3 fill-[#FF9500]" />
                {plugin.rating}
              </span>
              <span>•</span>
              <span>{plugin.downloadsCount} 次安装</span>
            </div>
          </div>
        </Link>

        {/* Action Button */}
        <div className="shrink-0 flex items-center gap-1.5">
          {isInstalled ? (
            <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
              <Check className="w-3.5 h-3.5" />
              <span>已安装</span>
            </span>
          ) : (
            <button
              type="button"
              onClick={handleInstall}
              disabled={isInstalling}
              className="px-3.5 py-1 rounded-full bg-secondary hover:bg-primary hover:text-primary-foreground text-foreground border border-border text-xs font-bold transition-all shrink-0 cursor-pointer flex items-center gap-1"
            >
              <Download className="w-3.5 h-3.5" />
              <span>{isInstalling ? "安装中" : "安装"}</span>
            </button>
          )}
        </div>
      </div>

      {/* Description */}
      <p className="text-xs text-muted-foreground line-clamp-2 mb-3">
        {plugin.description}
      </p>

      {/* Bottom Showcase Screenshots */}
      {screenshots.length > 0 && (
        <Link
          to="/plugins/$pluginId"
          params={{ pluginId: plugin.id }}
          className={`grid ${gridColsClass} gap-1.5 sm:gap-2 bg-surface p-2 rounded-xl sm:rounded-2xl border border-border/60 overflow-hidden cursor-pointer`}
        >
          {screenshots.map((imgUrl, i) => (
            <div
              key={i}
              className="bg-card rounded-xl overflow-hidden border border-border/80 flex flex-col h-32 relative group/img"
            >
              <img
                src={imgUrl}
                alt={`${plugin.name} screenshot ${i + 1}`}
                className="w-full h-full object-cover group-hover/img:scale-105 transition-transform duration-300"
              />
            </div>
          ))}
        </Link>
      )}
    </div>
  );
}
