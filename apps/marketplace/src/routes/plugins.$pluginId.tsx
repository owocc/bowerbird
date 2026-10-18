import { createFileRoute, Link } from "@tanstack/react-router";
import * as React from "react";
import { ArrowLeft, Sparkles } from "lucide-react";
import { usePluginsCatalog, getAllPlugins } from "../data/plugins";
import { PluginDetailClient } from "../components/plugin-detail-client";

export const Route = createFileRoute("/plugins/$pluginId")({
  component: PluginDetailsPage,
});

function PluginDetailsPage() {
  const { pluginId } = Route.useParams();
  const { plugins } = usePluginsCatalog();
  const allPlugins = plugins && plugins.length > 0 ? plugins : getAllPlugins();
  const plugin = allPlugins.find((p) => p.id === pluginId);

  if (!plugin) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-20 text-center space-y-6">
        <div className="w-16 h-16 mx-auto rounded-2xl bg-secondary flex items-center justify-center text-foreground">
          <Sparkles className="w-8 h-8" />
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-bold">Plugin Not Found</h1>
          <p className="text-sm text-muted-foreground">
            The requested plugin ID "{pluginId}" does not exist in the marketplace catalog.
          </p>
        </div>
        <div>
          <Link
            to="/"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary-hover transition"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>返回插件中心</span>
          </Link>
        </div>
      </div>
    );
  }

  const otherPlugins = allPlugins.filter(
    (p) => p.id !== plugin.id && (p.category === plugin.category || p.kind === plugin.kind)
  );

  return <PluginDetailClient plugin={plugin} otherPlugins={otherPlugins} />;
}
