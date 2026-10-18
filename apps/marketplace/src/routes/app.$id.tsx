import { createFileRoute, Link } from "@tanstack/react-router";
import * as React from "react";
import { ArrowLeft, Sparkles } from "lucide-react";
import { getAppById, getAllApps } from "../data/apps";
import { AppDetailClient } from "../components/app-detail-client";
import { useI18n } from "../lib/i18n";

export const Route = createFileRoute("/app/$id")({
  component: AppDetailPage,
});

export function AppDetailPage() {
  const { id } = Route.useParams();
  const { t } = useI18n();

  const app = React.useMemo(() => getAppById(id), [id]);
  const otherApps = React.useMemo(() => {
    return getAllApps().filter((a) => a.id !== id);
  }, [id]);

  if (!app) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-20 text-center space-y-6">
        <div className="w-16 h-16 mx-auto rounded-2xl bg-secondary flex items-center justify-center text-foreground">
          <Sparkles className="w-8 h-8" />
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-bold">App Not Found</h1>
          <p className="text-sm text-muted-foreground">
            The requested app "{id}" does not exist in the directory.
          </p>
        </div>
        <div>
          <Link
            to="/"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary-hover transition"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>{t("apps.title")}</span>
          </Link>
        </div>
      </div>
    );
  }

  return <AppDetailClient app={app} otherApps={otherApps} />;
}
