import { createFileRoute, useNavigate } from "@tanstack/react-router";
import * as React from "react";
import { Sparkles, Search as SearchIcon, X } from "lucide-react";
import { searchApps } from "../data/apps";
import { SearchCard } from "../components/search-card";
import { useI18n } from "../lib/i18n";

interface SearchSearchParams {
  q?: string;
}

export const Route = createFileRoute("/search")({
  validateSearch: (search: Record<string, unknown>): SearchSearchParams => {
    return {
      q: (search.q as string) || "",
    };
  },
  component: SearchPage,
});

export function SearchPage() {
  const { q } = Route.useSearch();
  const { t } = useI18n();
  const navigate = useNavigate();

  const [inputVal, setInputVal] = React.useState(q || "");

  React.useEffect(() => {
    setInputVal(q || "");
  }, [q]);

  const query = (q || "").trim();
  const apps = React.useMemo(() => {
    return searchApps(query);
  }, [query]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    navigate({
      to: "/search",
      search: { q: inputVal.trim() },
    });
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 w-full space-y-6 sm:space-y-8 bg-background text-foreground transition-colors duration-200 max-w-[1440px] mx-auto">
      {/* Search Input Bar */}
      <form onSubmit={handleSearch} className="relative max-w-xl">
        <SearchIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          type="text"
          value={inputVal}
          onChange={(e) => setInputVal(e.target.value)}
          placeholder={t("searchPlaceholder")}
          className="w-full pl-10 pr-10 py-2.5 bg-card border border-border rounded-2xl text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 shadow-xs"
        />
        {inputVal && (
          <button
            type="button"
            onClick={() => {
              setInputVal("");
              navigate({ to: "/search", search: { q: "" } });
            }}
            className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </form>

      {/* Search Header */}
      <div className="border-b border-border pb-4">
        <h1 className="text-2xl sm:text-3xl font-extrabold text-foreground tracking-tight">
          {query ? t("searchPage.resultsFor", { query }) : t("allApps")}
        </h1>
        <p className="text-xs text-muted-foreground mt-1 font-medium">
          {t("searchPage.foundCount", { count: apps.length })}
        </p>
      </div>

      {/* 3-Column Grid */}
      {apps.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
          {apps.map((app) => (
            <SearchCard key={app.id} app={app} />
          ))}
        </div>
      ) : (
        <div className="text-center py-20 space-y-4 bg-card rounded-3xl border border-border">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-secondary text-foreground flex items-center justify-center shadow-xs">
            <Sparkles className="w-8 h-8" />
          </div>
          <h2 className="text-lg font-bold text-foreground">{t("searchPage.noResults")}</h2>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            {t("searchPage.noResultsDesc", { query })}
          </p>
          <button
            type="button"
            onClick={() => {
              setInputVal("");
              navigate({ to: "/search", search: { q: "" } });
            }}
            className="inline-flex items-center gap-2 px-6 py-2.5 rounded-full bg-primary hover:bg-primary-hover text-primary-foreground font-bold text-xs shadow-md transition cursor-pointer"
          >
            <Sparkles className="w-4 h-4" />
            <span>{t("allApps")}</span>
          </button>
        </div>
      )}
    </div>
  );
}
