import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import * as React from "react";
import { ChevronRight, PlusCircle } from "lucide-react";
import { getAllApps, CATEGORIES_CONFIG } from "../data/apps";
import type { AppItem } from "../lib/types";
import { useI18n } from "../lib/i18n";

export const Route = createFileRoute("/category/$name")({
  component: CategoryPage,
});

export function CategoryPage() {
  const { name } = Route.useParams();
  const { t, locale } = useI18n();
  const navigate = useNavigate();

  const decoded = decodeURIComponent(name || "all").trim();
  const lower = decoded.toLowerCase();

  const categoryItem = CATEGORIES_CONFIG.find(
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

  const apps = React.useMemo(() => {
    return getAllApps({ category: categoryParam });
  }, [categoryParam]);

  // Section 1: 精选 App (up to 8 items in 4x2 grid)
  const featuredSlice = apps.slice(0, 8);

  // Section 2: 热门排行 (up to 5 items in 5-col row)
  const freeRankSlice =
    apps.length >= 13
      ? apps.slice(8, 13)
      : apps.length > 5
      ? apps.slice(0, 5)
      : apps;

  // Section 3: 精选推荐 (up to 5 items in 5-col row)
  const paidRankSlice =
    apps.length >= 18
      ? apps.slice(13, 18)
      : apps.length >= 10
      ? apps.slice(5, 10)
      : apps;

  return (
    <div className="p-4 sm:p-6 md:p-8 lg:p-10 w-full space-y-8 sm:space-y-10 max-w-[1440px] mx-auto bg-background text-foreground transition-colors duration-200">
      {/* Top Header: Category Name */}
      <div className="border-b border-border pb-4 sm:pb-5 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl sm:text-4xl font-extrabold text-foreground tracking-tight">
          {categoryTitle}
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

      {apps.length === 0 ? (
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
          {/* Section 1: 精选 {categoryTitle} 应用 (4 cols x 2 rows = 8 items) */}
          <section className="space-y-3 sm:space-y-4">
            <div className="flex items-center gap-1">
              <h2 className="text-lg sm:text-xl font-bold text-foreground tracking-tight">
                {t("category.featured", { category: categoryTitle })}
              </h2>
              <ChevronRight className="w-4 h-4 text-muted-foreground stroke-[2.5]" />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-x-6 sm:gap-y-3.5">
              {featuredSlice.map((app: AppItem) => (
                <div
                  key={app.id}
                  className="flex items-center justify-between gap-3 p-2 rounded-2xl hover:bg-card/80 transition-colors group"
                >
                  <Link
                    to="/app/$id"
                    params={{ id: app.id }}
                    className="flex items-center gap-3 min-w-0 flex-1 cursor-pointer"
                  >
                    <img
                      src={app.icon_url}
                      alt={app.name}
                      className="w-13 h-13 rounded-[16px] object-cover shadow-2xs group-hover:scale-105 transition-transform shrink-0"
                    />
                    <div className="min-w-0 flex-1">
                      <h3 className="text-xs sm:text-sm font-semibold text-foreground truncate leading-tight group-hover:text-blue-500 transition-colors">
                        {app.name}
                      </h3>
                      <p className="text-[11px] sm:text-xs text-muted-foreground truncate mt-1">
                        {app.tagline || app.description.slice(0, 30)}
                      </p>
                    </div>
                  </Link>

                  <Link
                    to="/app/$id"
                    params={{ id: app.id }}
                    className="px-3.5 py-1 rounded-full bg-secondary hover:bg-secondary-hover text-foreground text-xs font-semibold shrink-0 transition-colors cursor-pointer"
                  >
                    {t("view")}
                  </Link>
                </div>
              ))}
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
              {freeRankSlice.map((app: AppItem, index: number) => (
                <div
                  key={`free-${app.id}-${index}`}
                  className="bg-card rounded-2xl sm:rounded-[24px] border border-border shadow-xs hover:shadow-md transition-all p-3.5 sm:p-5 flex flex-col justify-between items-center text-center relative min-h-[210px] sm:min-h-[230px] group"
                >
                  {/* Rank Number top-left */}
                  <span className="absolute top-3.5 left-4 text-sm font-medium text-muted-foreground">
                    {index + 1}
                  </span>

                  {/* Icon, Title & Tagline */}
                  <Link
                    to="/app/$id"
                    params={{ id: app.id }}
                    className="flex flex-col items-center w-full flex-1 justify-center mt-1 cursor-pointer"
                  >
                    <img
                      src={app.icon_url}
                      alt={app.name}
                      className="w-14 h-14 sm:w-18 sm:h-18 md:w-20 md:h-20 rounded-xl sm:rounded-[22px] object-cover shadow-xs group-hover:scale-105 transition-transform mb-2.5 sm:mb-3"
                    />
                    <h4 className="text-xs sm:text-sm font-bold text-foreground line-clamp-1 w-full px-1 group-hover:text-blue-500 transition-colors">
                      {app.name}
                    </h4>
                    <p className="text-[11px] sm:text-xs text-muted-foreground line-clamp-1 mt-1 w-full px-1">
                      {app.tagline || app.description.slice(0, 30)}
                    </p>
                  </Link>

                  {/* Bottom Action */}
                  <Link
                    to="/app/$id"
                    params={{ id: app.id }}
                    className="mt-3 px-5 py-1 rounded-full bg-secondary hover:bg-secondary-hover text-foreground text-xs font-semibold transition-colors cursor-pointer"
                  >
                    {t("view")}
                  </Link>
                </div>
              ))}
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
              {paidRankSlice.map((app: AppItem, index: number) => (
                <div
                  key={`paid-${app.id}-${index}`}
                  className="bg-card rounded-2xl sm:rounded-[24px] border border-border shadow-xs hover:shadow-md transition-all p-3.5 sm:p-5 flex flex-col justify-between items-center text-center relative min-h-[210px] sm:min-h-[230px] group"
                >
                  {/* Rank Number top-left */}
                  <span className="absolute top-3.5 left-4 text-sm font-medium text-muted-foreground">
                    {index + 1}
                  </span>

                  {/* Icon, Title & Tagline */}
                  <Link
                    to="/app/$id"
                    params={{ id: app.id }}
                    className="flex flex-col items-center w-full flex-1 justify-center mt-1 cursor-pointer"
                  >
                    <img
                      src={app.icon_url}
                      alt={app.name}
                      className="w-14 h-14 sm:w-18 sm:h-18 md:w-20 md:h-20 rounded-xl sm:rounded-[22px] object-cover shadow-xs group-hover:scale-105 transition-transform mb-2.5 sm:mb-3"
                    />
                    <h4 className="text-xs sm:text-sm font-bold text-foreground line-clamp-1 w-full px-1 group-hover:text-blue-500 transition-colors">
                      {app.name}
                    </h4>
                    <p className="text-[11px] sm:text-xs text-muted-foreground line-clamp-1 mt-1 w-full px-1">
                      {app.tagline || app.description.slice(0, 30)}
                    </p>
                  </Link>

                  {/* Bottom Action */}
                  <Link
                    to="/app/$id"
                    params={{ id: app.id }}
                    className="mt-3 px-5 py-1 rounded-full bg-secondary hover:bg-secondary-hover text-foreground text-xs font-semibold transition-colors cursor-pointer"
                  >
                    {t("view")}
                  </Link>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
