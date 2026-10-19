import * as React from "react";
import { Link } from "@tanstack/react-router";
import { Logo } from "./logo";
import { ThemeToggle } from "./theme-toggle";
import { LanguageSwitcher } from "./language-switcher";
import { useI18n } from "../lib/i18n";

export function Footer() {
  const { t } = useI18n();

  return (
    <footer className="w-full bg-surface-card border-t border-border text-foreground transition-colors duration-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-10 lg:px-16 py-10 sm:py-16 flex flex-col justify-between min-h-[340px]">
        {/* Main Content: Left Brand, Right Navigation Columns */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 sm:gap-10 lg:gap-16">
          {/* Left: Brand Identity */}
          <div className="lg:col-span-5 flex flex-col justify-between space-y-6">
            <Logo variant="footer" href="/" size="md" />

            <p className="text-xs sm:text-sm text-muted-foreground max-w-sm leading-relaxed">
              {t("footer.subTagline")}
            </p>

            <div className="hidden sm:block min-h-[80px] w-full" aria-hidden="true" />
          </div>

          {/* Right: 3 Navigation Columns */}
          <div className="lg:col-span-7 grid grid-cols-2 sm:grid-cols-3 gap-6 sm:gap-10">
            {/* Column 1 */}
            <div className="space-y-4">
              <h4 className="text-xs sm:text-sm font-bold tracking-tight text-foreground">
                {t("footer.discover")}
              </h4>
              <ul className="space-y-2.5 text-xs sm:text-sm text-muted-foreground">
                <li>
                  <Link to="/" className="hover:text-primary transition-colors">
                    {t("footer.appsFeatured")}
                  </Link>
                </li>
                <li>
                  <Link
                    to="/category/$name"
                    params={{ name: "all" }}
                    className="hover:text-primary transition-colors"
                  >
                    {t("footer.allApps")}
                  </Link>
                </li>
                <li>
                  <Link
                    to="/category/$name"
                    params={{ name: "preview" }}
                    className="hover:text-primary transition-colors"
                  >
                    {t("footer.web")}
                  </Link>
                </li>
                <li>
                  <Link
                    to="/category/$name"
                    params={{ name: "metadata" }}
                    className="hover:text-primary transition-colors"
                  >
                    {t("footer.tools")}
                  </Link>
                </li>
                <li>
                  <Link
                    to="/category/$name"
                    params={{ name: "document" }}
                    className="hover:text-primary transition-colors"
                  >
                    文档与文本
                  </Link>
                </li>
                <li>
                  <Link
                    to="/category/$name"
                    params={{ name: "media" }}
                    className="hover:text-primary transition-colors"
                  >
                    音视频媒体
                  </Link>
                </li>
              </ul>
            </div>

            {/* Column 2 */}
            <div className="space-y-4">
              <h4 className="text-xs sm:text-sm font-bold tracking-tight text-foreground">
                {t("footer.services")}
              </h4>
              <ul className="space-y-2.5 text-xs sm:text-sm text-muted-foreground">
                <li>
                  <Link
                    to="/docs"
                    className="hover:text-primary font-semibold transition-colors"
                  >
                    {t("footer.snapshotPipeline")}
                  </Link>
                </li>
                <li>
                  <a
                    href="https://github.com/owocc/bowerbird"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-primary transition-colors"
                  >
                    {t("footer.developerCollab")}
                  </a>
                </li>
                <li>
                  <Link
                    to="/search"
                    search={{ q: "" }}
                    className="hover:text-primary transition-colors"
                  >
                    搜索全部插件
                  </Link>
                </li>
              </ul>
            </div>

            {/* Column 3 */}
            <div className="space-y-4 col-span-2 sm:col-span-1">
              <h4 className="text-xs sm:text-sm font-bold tracking-tight text-foreground">
                {t("footer.aboutPlatform")}
              </h4>
              <ul className="space-y-2.5 text-xs sm:text-sm text-muted-foreground">
                <li>
                  <span className="cursor-default text-muted-foreground/70">
                    {t("footer.aboutUs")}
                  </span>
                </li>
                <li>
                  <span className="cursor-default text-muted-foreground/70">
                    {t("footer.terms")}
                  </span>
                </li>
                <li>
                  <span className="cursor-default text-muted-foreground/70">
                    {t("footer.privacy")}
                  </span>
                </li>
                <li>
                  <a
                    href="https://github.com/owocc/bowerbird/issues"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-primary transition-colors"
                  >
                    {t("footer.contact")}
                  </a>
                </li>
              </ul>
            </div>
          </div>
        </div>

        {/* Bottom Row */}
        <div className="border-t border-border pt-6 sm:pt-8 mt-8 sm:mt-12 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-muted-foreground text-center sm:text-left">
          <p>{t("footer.copyright")}</p>

          <div className="flex items-center gap-3 justify-end">
            <LanguageSwitcher />
            <ThemeToggle />
          </div>
        </div>
      </div>
    </footer>
  );
}
