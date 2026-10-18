import * as React from "react";
import { Link } from "@tanstack/react-router";
import {
  ExternalLink,
  Share2,
  Check,
  ChevronDown,
  Laptop,
  Tablet,
  Smartphone,
  Star,
  Sparkles,
  ArrowLeft,
} from "lucide-react";
import type { AppItem } from "../lib/types";
import { useI18n } from "../lib/i18n";

interface Props {
  app: AppItem;
  otherApps?: AppItem[];
}

export function AppDetailClient({ app, otherApps = [] }: Props) {
  const { t } = useI18n();
  const [descExpanded, setDescExpanded] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  const [selectedDevice, setSelectedDevice] = React.useState<"all" | "pc" | "tablet" | "mobile">("all");

  const handleCopyLink = () => {
    if (typeof window !== "undefined") {
      navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const screenshots = React.useMemo(() => {
    if (app.screenshots && app.screenshots.length > 0) return app.screenshots;
    if (app.cover_url) return [app.cover_url];
    return [];
  }, [app]);

  return (
    <div className="w-full min-h-screen bg-background text-foreground transition-colors duration-200">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10 space-y-8 sm:space-y-12">
        {/* Back Link */}
        <div>
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>{t("apps.title")}</span>
          </Link>
        </div>

        {/* Hero Header Section */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 pb-8 border-b border-border">
          <div className="flex items-start sm:items-center gap-5 min-w-0">
            <img
              src={app.icon_url}
              alt={app.name}
              className="w-20 h-20 sm:w-28 sm:h-28 rounded-2xl sm:rounded-3xl object-cover shadow-md border border-border shrink-0"
            />
            <div className="space-y-1 min-w-0">
              <h1 className="text-2xl sm:text-4xl font-extrabold text-foreground tracking-tight truncate">
                {app.name}
              </h1>
              <p className="text-sm sm:text-base text-muted-foreground font-medium">
                {app.tagline}
              </p>
              <div className="flex flex-wrap items-center gap-2 pt-1 text-xs text-muted-foreground">
                <span className="font-semibold text-foreground">{app.developer}</span>
                <span>•</span>
                <span className="px-2 py-0.5 rounded-md bg-secondary text-secondary-foreground font-medium border border-border">
                  {app.category.toUpperCase()}
                </span>
                <span>•</span>
                <span className="text-[#FF9500] font-semibold flex items-center gap-0.5">
                  ★ {app.rating} ({app.rating_count})
                </span>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-3 w-full sm:w-auto shrink-0">
            <a
              href={app.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-full bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary-hover active:scale-[0.98] transition-all shadow-sm"
            >
              <span>{t("appDetail.visitWebsite")}</span>
              <ExternalLink className="w-4 h-4" />
            </a>

            <button
              type="button"
              onClick={handleCopyLink}
              title={t("appDetail.share")}
              className="inline-flex items-center justify-center p-2.5 rounded-full border border-border bg-card text-foreground hover:bg-surface active:scale-95 transition cursor-pointer"
            >
              {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Share2 className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Device Preview Screenshots Showcase */}
        {screenshots.length > 0 && (
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg sm:text-xl font-bold tracking-tight text-foreground">
                {t("appDetail.preview")}
              </h2>

              {/* Device tabs */}
              <div className="flex items-center p-0.5 rounded-xl bg-surface border border-border text-xs">
                <button
                  type="button"
                  onClick={() => setSelectedDevice("all")}
                  className={`px-3 py-1 rounded-lg font-medium transition cursor-pointer ${
                    selectedDevice === "all" ? "bg-card text-foreground shadow-2xs font-semibold" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  全部
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedDevice("pc")}
                  className={`px-2.5 py-1 rounded-lg flex items-center gap-1 font-medium transition cursor-pointer ${
                    selectedDevice === "pc" ? "bg-card text-foreground shadow-2xs font-semibold" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Laptop className="w-3.5 h-3.5" />
                  <span>PC</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedDevice("tablet")}
                  className={`px-2.5 py-1 rounded-lg flex items-center gap-1 font-medium transition cursor-pointer ${
                    selectedDevice === "tablet" ? "bg-card text-foreground shadow-2xs font-semibold" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Tablet className="w-3.5 h-3.5" />
                  <span>平板</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedDevice("mobile")}
                  className={`px-2.5 py-1 rounded-lg flex items-center gap-1 font-medium transition cursor-pointer ${
                    selectedDevice === "mobile" ? "bg-card text-foreground shadow-2xs font-semibold" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Smartphone className="w-3.5 h-3.5" />
                  <span>手机</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {screenshots.map((url, i) => (
                <div
                  key={i}
                  className="rounded-2xl overflow-hidden border border-border bg-card shadow-xs group"
                >
                  <div className="aspect-video w-full overflow-hidden bg-muted">
                    <img
                      src={url}
                      alt={`${app.name} preview ${i + 1}`}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    />
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Description & Features */}
        <section className="space-y-6">
          <div className="space-y-3">
            <h2 className="text-lg sm:text-xl font-bold tracking-tight text-foreground">
              {t("appDetail.aboutApp")}
            </h2>
            <div className="relative">
              <p
                className={`text-sm sm:text-base text-muted-foreground leading-relaxed ${
                  !descExpanded ? "line-clamp-3" : ""
                }`}
              >
                {app.description}
              </p>
              {app.description.length > 120 && (
                <button
                  type="button"
                  onClick={() => setDescExpanded(!descExpanded)}
                  className="mt-2 text-xs font-semibold text-primary hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <span>{descExpanded ? t("appDetail.showLess") : t("appDetail.showMore")}</span>
                  <ChevronDown className={`w-3.5 h-3.5 transition-transform ${descExpanded ? "rotate-180" : ""}`} />
                </button>
              )}
            </div>
          </div>

          {/* Highlights Checklist */}
          {app.preview_features && app.preview_features.length > 0 && (
            <div className="bg-surface/50 rounded-2xl p-4 sm:p-6 border border-border space-y-3">
              <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-primary" />
                <span>功能特点</span>
              </h3>
              <ul className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                {app.preview_features.map((feat, idx) => (
                  <li key={idx} className="flex items-start gap-2.5 text-xs sm:text-sm text-foreground">
                    <Check className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                    <span>{feat}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        {/* Ratings Breakdown */}
        <section className="space-y-4">
          <h2 className="text-lg sm:text-xl font-bold tracking-tight text-foreground">
            {t("appDetail.ratingsReviews")}
          </h2>

          <div className="bg-card rounded-2xl p-6 border border-border flex flex-col sm:flex-row items-center gap-8">
            <div className="text-center sm:text-left space-y-1">
              <div className="text-5xl font-black text-foreground">{app.rating}</div>
              <div className="flex items-center justify-center sm:justify-start gap-1 text-[#FF9500]">
                {[1, 2, 3, 4, 5].map((s) => (
                  <Star key={s} className="w-4 h-4 fill-[#FF9500]" />
                ))}
              </div>
              <p className="text-xs text-muted-foreground">{app.rating_count} 个评分</p>
            </div>

            <div className="flex-1 w-full space-y-2">
              {[
                { star: 5, pct: 85 },
                { star: 4, pct: 10 },
                { star: 3, pct: 3 },
                { star: 2, pct: 1 },
                { star: 1, pct: 1 },
              ].map((row) => (
                <div key={row.star} className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="w-3 text-right">{row.star}</span>
                  <div className="flex-1 h-2 rounded-full bg-surface overflow-hidden">
                    <div className="h-full bg-primary rounded-full" style={{ width: `${row.pct}%` }} />
                  </div>
                  <span className="w-8 text-right font-mono">{row.pct}%</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Specifications Information */}
        <section className="space-y-4">
          <h2 className="text-lg sm:text-xl font-bold tracking-tight text-foreground">
            {t("appDetail.information")}
          </h2>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            <div className="bg-card p-4 rounded-xl border border-border space-y-1">
              <span className="text-xs text-muted-foreground">开发者</span>
              <p className="text-sm font-semibold text-foreground truncate">{app.developer}</p>
            </div>
            <div className="bg-card p-4 rounded-xl border border-border space-y-1">
              <span className="text-xs text-muted-foreground">{t("appDetail.sizePlatform")}</span>
              <p className="text-sm font-semibold text-foreground truncate">{app.size}</p>
            </div>
            <div className="bg-card p-4 rounded-xl border border-border space-y-1">
              <span className="text-xs text-muted-foreground">{t("appDetail.category")}</span>
              <p className="text-sm font-semibold text-foreground truncate">{app.category.toUpperCase()}</p>
            </div>
            <div className="bg-card p-4 rounded-xl border border-border space-y-1">
              <span className="text-xs text-muted-foreground">{t("appDetail.compatibility")}</span>
              <p className="text-sm font-semibold text-foreground truncate">{app.compatibility}</p>
            </div>
            <div className="bg-card p-4 rounded-xl border border-border space-y-1">
              <span className="text-xs text-muted-foreground">{t("appDetail.languages")}</span>
              <p className="text-sm font-semibold text-foreground truncate">{app.languages}</p>
            </div>
            <div className="bg-card p-4 rounded-xl border border-border space-y-1">
              <span className="text-xs text-muted-foreground">{t("appDetail.ageRating")}</span>
              <p className="text-sm font-semibold text-foreground truncate">{app.age_rating}</p>
            </div>
            <div className="bg-card p-4 rounded-xl border border-border space-y-1">
              <span className="text-xs text-muted-foreground">{t("appDetail.version")}</span>
              <p className="text-sm font-semibold text-foreground truncate">v{app.version}</p>
            </div>
            <div className="bg-card p-4 rounded-xl border border-border space-y-1">
              <span className="text-xs text-muted-foreground">{t("appDetail.freeWebApp")}</span>
              <p className="text-sm font-semibold text-foreground truncate">{app.price}</p>
            </div>
          </div>
        </section>

        {/* Related Apps */}
        {otherApps.length > 0 && (
          <section className="space-y-4 pt-4 border-t border-border">
            <h2 className="text-lg sm:text-xl font-bold tracking-tight text-foreground">
              {t("appDetail.recommendedApps")}
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {otherApps.slice(0, 4).map((other) => (
                <Link
                  key={other.id}
                  to="/app/$id"
                  params={{ id: other.id }}
                  className="p-3 bg-card rounded-2xl border border-border hover:border-primary/50 transition-colors flex items-center gap-3 group"
                >
                  <img
                    src={other.icon_url}
                    alt={other.name}
                    className="w-12 h-12 rounded-xl object-cover shrink-0 group-hover:scale-105 transition-transform"
                  />
                  <div className="min-w-0 flex-1">
                    <h3 className="text-xs font-semibold text-foreground truncate group-hover:text-primary transition-colors">
                      {other.name}
                    </h3>
                    <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                      {other.tagline}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
