import * as React from "react";
import { Link } from "@tanstack/react-router";
import type { MarketplacePlugin } from "../data/plugins";
import { getPluginIcon } from "./plugin-icon";

interface Props {
  plugin: MarketplacePlugin;
  tag: string;
}

export function HeroFeaturedCard({ plugin, tag }: Props) {
  const coverUrl = plugin.cover_url ? plugin.cover_url.replace(/&amp;/g, "&") : "";
  const Icon = getPluginIcon(plugin.iconName);

  return (
    <Link
      to="/plugins/$pluginId"
      params={{ pluginId: plugin.id }}
      className="group relative flex-1 min-h-[340px] sm:min-h-[420px] lg:min-h-[460px] rounded-2xl sm:rounded-3xl overflow-hidden shadow-xs hover:shadow-xl transition-all duration-300 border border-border/80 flex flex-col justify-end isolate [transform:translateZ(0)] cursor-pointer"
      style={{
        WebkitMaskImage: "-webkit-radial-gradient(white, black)",
      }}
    >
      {/* Cover Image / Animated background */}
      <div
        className="absolute inset-0 bg-cover bg-center group-hover:scale-105 transition-transform duration-700 pointer-events-none"
        style={{ backgroundImage: `url(${coverUrl || "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=1200&h=800&fit=crop"})` }}
      />

      {/* Bottom Gradient + Backdrop Blur Overlays */}
      <div
        className="absolute inset-x-0 bottom-0 h-[60%] pointer-events-none"
        style={{
          backdropFilter: "blur(16px)",
          WebkitBackdropFilter: "blur(16px)",
          maskImage: "linear-gradient(to top, black 30%, transparent 100%)",
          WebkitMaskImage: "linear-gradient(to top, black 30%, transparent 100%)",
        }}
      />
      <div className="absolute inset-0 pointer-events-none bg-gradient-to-t from-black/95 via-black/60 via-40% to-transparent" />

      {/* Content Container */}
      <div className="relative z-10 p-4 sm:p-6 md:p-7 space-y-3 sm:space-y-4">
        {/* Upper text block: Tag, Title, Tagline */}
        <div className="space-y-1.5 max-w-2xl">
          <span className="text-xs font-semibold uppercase tracking-wider text-white/80 drop-shadow-xs block">
            {tag}
          </span>
          <h2 className="text-xl sm:text-2xl lg:text-3xl font-extrabold text-white leading-snug tracking-tight drop-shadow-sm">
            {plugin.name}：{plugin.tagline || plugin.description}
          </h2>
          <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
            {plugin.extensions.slice(0, 5).map((ext) => (
              <span
                key={ext}
                className="text-[11px] font-mono px-2 py-0.5 rounded bg-white/20 text-white backdrop-blur-xs font-semibold"
              >
                .{ext}
              </span>
            ))}
            {plugin.extensions.length > 5 && (
              <span className="text-[11px] text-white/80 font-mono">
                +{plugin.extensions.length - 5}
              </span>
            )}
          </div>
        </div>

        {/* Bottom Plugin Info Bar: Icon, Name, Category/Rating, Action Button */}
        <div className="flex items-center justify-between pt-1">
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-lg sm:rounded-xl bg-white/10 backdrop-blur-md flex items-center justify-center shrink-0 border border-white/20 text-white shadow-md">
              <Icon className="w-5 h-5 sm:w-6 sm:h-6" />
            </div>
            <div className="min-w-0">
              <h3 className="font-bold text-sm leading-tight text-white truncate drop-shadow-xs">
                {plugin.name}
              </h3>
              <p className="text-xs text-white/70 truncate mt-0.5 drop-shadow-xs">
                {plugin.author} • {plugin.rating}★ ({plugin.downloadsCount} 次安装)
              </p>
            </div>
          </div>

          <span className="px-4 py-1.5 rounded-full font-bold text-xs text-white bg-white/20 hover:bg-white/30 backdrop-blur-md border border-white/20 shadow-xs transition shrink-0 ml-3">
            查看详情
          </span>
        </div>
      </div>
    </Link>
  );
}
