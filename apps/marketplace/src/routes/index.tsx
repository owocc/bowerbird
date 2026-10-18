import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import * as React from "react";
import { ChevronRight, Sparkles, PlusCircle } from "lucide-react";
import { getAllApps } from "../data/apps";
import type { AppItem } from "../lib/types";
import { HeroFeaturedCard } from "../components/hero-featured-card";
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

  const allApps = React.useMemo(() => getAllApps(), []);
  const webApps = React.useMemo(() => getAllApps({ category: "web" }), []);
  const toolApps = React.useMemo(() => getAllApps({ category: "tools" }), []);
  const aiApps = React.useMemo(() => getAllApps({ category: "ai" }), []);

  const featuredApps = allApps.filter((a: AppItem) => a.featured);
  const heroApp = featuredApps[0] || allApps[0];
  const secondHeroApp = featuredApps[1] || allApps[1] || heroApp;
  const thirdHeroApp = featuredApps[2] || allApps[2] || heroApp;

  // List 1: Web category
  const webListApps = webApps.length > 0 ? webApps.slice(0, 5) : allApps.slice(0, 5);
  // List 2: Tools category
  const toolListApps = toolApps.length > 0 ? toolApps.slice(0, 5) : allApps.slice(2, 7);
  // List 3: AI category
  const aiListApps = aiApps.length > 0 ? aiApps.slice(0, 5) : allApps.slice(4, 9);

  const dateString = React.useMemo(() => formatLocalizedDate(new Date(), locale), [locale]);

  return (
    <div className="p-4 sm:p-6 lg:p-8 w-full space-y-8 sm:space-y-10 lg:space-y-12 bg-background text-foreground transition-colors duration-200">
      {/* Apps Header */}
      <div className="border-b border-border pb-4">
        <p className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
          {dateString}
        </p>
        <div className="flex flex-wrap items-center justify-between gap-3 mt-1">
          <h1 className="text-2xl sm:text-4xl font-extrabold text-foreground tracking-tight">
            {t("apps.title")}
          </h1>
          <button
            type="button"
            onClick={() => navigate({ to: "/search", search: { q: "" } })}
            className="inline-flex items-center gap-1.5 px-3.5 sm:px-4 py-1.5 sm:py-2 rounded-full bg-foreground text-background text-xs font-semibold hover:opacity-90 transition cursor-pointer"
          >
            <PlusCircle className="w-3.5 h-3.5" />
            <span>{t("submit")}</span>
          </button>
        </div>
      </div>

      {/* Empty State */}
      {allApps.length === 0 ? (
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
          <button
            type="button"
            onClick={() => navigate({ to: "/search", search: { q: "" } })}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary-hover active:scale-[0.98] transition-all shadow-xs cursor-pointer"
          >
            <PlusCircle className="w-4 h-4" />
            <span>{t("apps.recommendFirst")}</span>
          </button>
        </div>
      ) : (
        <div className="space-y-8 sm:space-y-10 lg:space-y-12">
          {/* Row 1: Left Wide (Hero Banner), Right Narrow (Web 分类列表) */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
            {/* Left Wide: Hero Feature Card (7 cols) */}
            {heroApp && (
              <div className="lg:col-span-7 flex flex-col">
                <HeroFeaturedCard app={heroApp} tag={t("apps.heroTag1")} />
              </div>
            )}

            {/* Right Narrow: Web 分类列表 (5 cols) */}
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
                    params={{ name: "web" }}
                    className="text-xs font-semibold text-foreground hover:underline flex items-center gap-0.5 cursor-pointer"
                  >
                    <span>{t("viewAll")}</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </Link>
                </div>

                <div className="divide-y divide-border">
                  {webListApps.map((app: AppItem, index: number) => (
                    <div
                      key={app.id}
                      className="py-3 first:pt-0 last:pb-0 flex items-center justify-between gap-3 group"
                    >
                      <Link
                        to="/app/$id"
                        params={{ id: app.id }}
                        className="flex items-center gap-3 flex-1 min-w-0 cursor-pointer"
                      >
                        <img
                          src={app.icon_url}
                          alt={app.name}
                          className="w-11 h-11 rounded-xl object-cover shadow-2xs group-hover:scale-105 transition-transform shrink-0"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="font-semibold text-sm text-foreground truncate group-hover:text-primary transition-colors">
                              {app.name}
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
                            {app.tagline || app.description.slice(0, 30)}
                          </p>
                        </div>
                      </Link>
                      <Link
                        to="/app/$id"
                        params={{ id: app.id }}
                        className="px-3.5 py-1 rounded-full bg-secondary hover:bg-primary hover:text-primary-foreground text-foreground border border-border text-xs font-bold transition-all shrink-0 cursor-pointer"
                      >
                        {t("view")}
                      </Link>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Row 2: Reversed! Left Narrow (工具 分类列表), Right Wide (主打推荐大卡片) */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
            {/* Left Narrow: 工具 分类列表 (5 cols) */}
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
                    params={{ name: "tools" }}
                    className="text-xs font-semibold text-foreground hover:underline flex items-center gap-0.5 cursor-pointer"
                  >
                    <span>{t("viewAll")}</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </Link>
                </div>

                <div className="divide-y divide-border">
                  {toolListApps.map((app: AppItem, index: number) => (
                    <div
                      key={app.id}
                      className="py-3 first:pt-0 last:pb-0 flex items-center justify-between gap-3 group"
                    >
                      <Link
                        to="/app/$id"
                        params={{ id: app.id }}
                        className="flex items-center gap-3 flex-1 min-w-0 cursor-pointer"
                      >
                        <img
                          src={app.icon_url}
                          alt={app.name}
                          className="w-11 h-11 rounded-xl object-cover shadow-2xs group-hover:scale-105 transition-transform shrink-0"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="font-semibold text-sm text-foreground truncate group-hover:text-primary transition-colors">
                              {app.name}
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
                            {app.tagline || app.description.slice(0, 30)}
                          </p>
                        </div>
                      </Link>
                      <Link
                        to="/app/$id"
                        params={{ id: app.id }}
                        className="px-3.5 py-1 rounded-full bg-secondary hover:bg-primary hover:text-primary-foreground text-foreground border border-border text-xs font-bold transition-all shrink-0 cursor-pointer"
                      >
                        {t("view")}
                      </Link>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Right Wide: Featured Spotlight Card (7 cols) */}
            {secondHeroApp && (
              <div className="lg:col-span-7 flex flex-col order-1 lg:order-2">
                <HeroFeaturedCard app={secondHeroApp} tag={t("apps.heroTag2")} />
              </div>
            )}
          </div>

          {/* Row 3: Left Wide (AI 专区大卡片), Right Narrow (AI 分类列表) */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
            {/* Left Wide: AI Spotlight Card (7 cols) */}
            {thirdHeroApp && (
              <div className="lg:col-span-7 flex flex-col">
                <HeroFeaturedCard app={thirdHeroApp} tag={t("apps.heroTag3")} />
              </div>
            )}

            {/* Right Narrow: AI 分类列表 (5 cols) */}
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
                    params={{ name: "ai" }}
                    className="text-xs font-semibold text-foreground hover:underline flex items-center gap-0.5 cursor-pointer"
                  >
                    <span>{t("viewAll")}</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </Link>
                </div>

                <div className="divide-y divide-border">
                  {aiListApps.map((app: AppItem, index: number) => (
                    <div
                      key={app.id}
                      className="py-3 first:pt-0 last:pb-0 flex items-center justify-between gap-3 group"
                    >
                      <Link
                        to="/app/$id"
                        params={{ id: app.id }}
                        className="flex items-center gap-3 flex-1 min-w-0 cursor-pointer"
                      >
                        <img
                          src={app.icon_url}
                          alt={app.name}
                          className="w-11 h-11 rounded-xl object-cover shadow-2xs group-hover:scale-105 transition-transform shrink-0"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="font-semibold text-sm text-foreground truncate group-hover:text-primary transition-colors">
                              {app.name}
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
                            {app.tagline || app.description.slice(0, 30)}
                          </p>
                        </div>
                      </Link>
                      <Link
                        to="/app/$id"
                        params={{ id: app.id }}
                        className="px-3.5 py-1 rounded-full bg-secondary hover:bg-primary hover:text-primary-foreground text-foreground border border-border text-xs font-bold transition-all shrink-0 cursor-pointer"
                      >
                        {t("view")}
                      </Link>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
