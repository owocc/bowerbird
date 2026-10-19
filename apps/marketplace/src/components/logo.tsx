import * as React from "react";
import { Link } from "@tanstack/react-router";
import { Sparkles } from "lucide-react";

export interface LogoProps {
  variant?: "hero" | "header" | "sidebar" | "footer" | "icon-only";
  size?: "sm" | "md" | "lg";
  text?: string;
  subtitle?: string;
  href?: string;
  className?: string;
}

export function AppIconMark({
  size = "md",
  className = "",
}: {
  size?: "sm" | "md" | "lg" | "hero";
  className?: string;
}) {
  const sizeClasses =
    {
      sm: "w-7 h-7 sm:w-8 sm:h-8 rounded-lg",
      md: "w-8 h-8 sm:w-9 sm:h-9 rounded-xl",
      lg: "w-10 h-10 sm:w-11 sm:h-11 rounded-xl",
      hero: "w-12 h-12 sm:w-14 sm:h-14 rounded-2xl shadow-md",
    }[size] || "w-8 h-8 sm:w-9 sm:h-9 rounded-xl";

  return (
    <div
      className={`relative flex items-center justify-center shrink-0 select-none overflow-hidden bg-gradient-to-br from-primary to-primary/80 text-primary-foreground border border-white/15 shadow-xs transition-transform duration-200 group-hover:scale-105 ${sizeClasses} ${className}`}
    >
      <img
        src="/logo.jpeg"
        alt="Bowerbird Logo"
        width={128}
        height={128}
        className="w-full h-full object-cover select-none pointer-events-none"
        loading="eager"
        onError={(e) => {
          // Fallback to stylized SVG icon if image not present
          (e.currentTarget as HTMLElement).style.display = "none";
        }}
      />
      <Sparkles className="w-4 h-4 text-white absolute inset-0 m-auto pointer-events-none opacity-0 only:opacity-100" />
    </div>
  );
}

export const PixelMark = AppIconMark;

export function Logo({
  variant = "header",
  size = "md",
  text = "Bowerbird 插件",
  subtitle = "Marketplace",
  href,
  className = "",
}: LogoProps) {
  if (variant === "hero") {
    const content = (
      <div className={`flex flex-col items-center gap-2 select-none ${className}`}>
        <AppIconMark size="hero" />
        {subtitle ? (
          <span className="text-[11px] font-medium text-neutral-400 tracking-wide">
            {subtitle}
          </span>
        ) : null}
      </div>
    );

    if (href) {
      return (
        <Link to={href} className="inline-block hover:opacity-85 transition-opacity">
          {content}
        </Link>
      );
    }
    return content;
  }

  if (variant === "icon-only") {
    return <AppIconMark size={size} className={className} />;
  }

  if (variant === "sidebar") {
    const content = (
      <div className={`flex items-center w-full select-none ${className}`}>
        <div className="flex items-center gap-2.5">
          <AppIconMark size="sm" />
          <div className="flex flex-col">
            <span className="font-bold text-sm tracking-tight text-foreground leading-none">
              Bowerbird
            </span>
            <span className="text-[10px] text-muted-foreground font-medium mt-0.5 leading-none">
              插件市场
            </span>
          </div>
        </div>
      </div>
    );

    if (href) {
      return (
        <Link
          to={href}
          className="flex items-center w-full px-2 py-1 text-foreground hover:opacity-80 transition cursor-pointer group"
        >
          {content}
        </Link>
      );
    }
    return content;
  }

  const textSizes =
    {
      sm: "text-base sm:text-lg",
      md: "text-lg sm:text-xl",
      lg: "text-xl sm:text-2xl",
    }[size] || "text-lg sm:text-xl";

  const content = (
    <div className={`flex items-center gap-2.5 sm:gap-3 select-none ${className}`}>
      <AppIconMark size={size} />
      <div className="flex flex-col">
        <span className={`font-extrabold tracking-tight text-foreground leading-none ${textSizes}`}>
          {text}
        </span>
        {subtitle && (
          <span className="text-[11px] text-muted-foreground font-medium mt-0.5 leading-none">
            {subtitle}
          </span>
        )}
      </div>
    </div>
  );

  if (href) {
    return (
      <Link to={href} className="flex items-center group hover:opacity-90 transition-opacity">
        {content}
      </Link>
    );
  }

  return content;
}
