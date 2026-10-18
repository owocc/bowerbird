import * as React from "react";
import { Link } from "@tanstack/react-router";

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
      className={`relative flex items-center justify-center shrink-0 select-none overflow-hidden bg-black border border-white/15 shadow-xs transition-transform duration-200 group-hover:scale-105 ${sizeClasses} ${className}`}
    >
      <img
        src="/logo.jpeg"
        alt="Hyakume Logo"
        width={128}
        height={128}
        className="w-full h-full object-cover select-none pointer-events-none"
        loading="eager"
      />
    </div>
  );
}

export const PixelMark = AppIconMark;

export function Logo({
  variant = "header",
  size = "md",
  text = "Hyakume",
  subtitle = "",
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
          <span className="font-semibold text-sm tracking-tight text-foreground">
            {text}
          </span>
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
      <span className={`font-extrabold tracking-tight text-foreground ${textSizes}`}>
        {text}
      </span>
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
