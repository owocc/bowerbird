import * as React from "react";
import { Link } from "@tanstack/react-router";
import type { AppItem } from "../lib/types";

interface Props {
  app: AppItem;
  tag: string;
}

export function HeroFeaturedCard({ app, tag }: Props) {
  const coverUrl = app.cover_url ? app.cover_url.replace(/&amp;/g, "&") : "";

  return (
    <Link
      to="/app/$id"
      params={{ id: app.id }}
      className="group relative flex-1 min-h-[340px] sm:min-h-[420px] lg:min-h-[460px] rounded-2xl sm:rounded-3xl overflow-hidden shadow-xs hover:shadow-xl transition-all duration-300 border border-border/80 flex flex-col justify-end isolate [transform:translateZ(0)] cursor-pointer"
      style={{
        WebkitMaskImage: "-webkit-radial-gradient(white, black)",
      }}
    >
      {/* Cover Image / Animated background */}
      <div
        className="absolute inset-0 bg-cover bg-center group-hover:scale-105 transition-transform duration-700 pointer-events-none"
        style={{ backgroundImage: `url(${coverUrl || app.cover_url})` }}
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

      {/* Content Container (Positioned at bottom over the blurred, darkened area) */}
      <div className="relative z-10 p-4 sm:p-6 md:p-7 space-y-3 sm:space-y-4">
        {/* Upper text block: Tag, Title, Tagline */}
        <div className="space-y-1.5 max-w-2xl">
          <span className="text-xs font-semibold uppercase tracking-wider text-white/80 drop-shadow-xs block">
            {tag}
          </span>
          <h2 className="text-xl sm:text-2xl lg:text-3xl font-extrabold text-white leading-snug tracking-tight drop-shadow-sm">
            {app.name}：{app.tagline}
          </h2>
          {app.preview_features && app.preview_features.length > 0 && (
            <p className="text-xs md:text-sm text-white/75 line-clamp-1 drop-shadow-xs font-normal pt-0.5">
              {app.preview_features[0]}
            </p>
          )}
        </div>

        {/* Bottom App Info Bar: Icon, Name, Category/Rating, Action Button */}
        <div className="flex items-center justify-between pt-1">
          <div className="flex items-center gap-3.5 min-w-0">
            <img
              src={app.icon_url}
              alt={app.name}
              className="w-10 h-10 sm:w-12 sm:h-12 rounded-lg sm:rounded-xl object-cover shadow-md shrink-0 border border-white/15"
            />
            <div className="min-w-0">
              <h3 className="font-bold text-sm leading-tight text-white truncate drop-shadow-xs">
                {app.name}
              </h3>
              <p className="text-xs text-white/70 truncate mt-0.5 drop-shadow-xs">
                {app.category} • {app.rating}★ ({app.rating_count})
              </p>
            </div>
          </div>

          <span className="px-4 py-1.5 rounded-full font-bold text-xs text-white bg-white/20 hover:bg-white/30 backdrop-blur-md border border-white/20 shadow-xs transition shrink-0 ml-3">
            查看
          </span>
        </div>
      </div>
    </Link>
  );
}
