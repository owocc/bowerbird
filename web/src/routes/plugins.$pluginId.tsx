import { createFileRoute, Link } from "@tanstack/react-router";
import * as React from "react";
import {
  ArrowLeft,
  Download,
  Check,
  Star,
  ShieldCheck,
  Calendar,
  FileCode,
  Layers,
  Sparkles,
  ExternalLink,
  Laptop,
  Copy,
  CheckCheck,
  FileText,
  Music,
  Table,
  Camera,
  Box,
} from "lucide-react";
import { OFFICIAL_PLUGINS, type MarketplacePlugin } from "../data/plugins";
import { I18nContext } from "../lib/i18n";
import { DesktopContext } from "../lib/desktop-context";

export const Route = createFileRoute("/plugins/$pluginId")({
  component: PluginDetailsPage,
});

function getIconComponent(iconName: MarketplacePlugin["iconName"]) {
  switch (iconName) {
    case "file-text":
      return FileText;
    case "music":
      return Music;
    case "table":
      return Table;
    case "camera":
      return Camera;
    case "sparkles":
      return Sparkles;
    default:
      return Box;
  }
}

function PluginDetailsPage() {
  const { pluginId } = Route.useParams();
  const { t } = React.useContext(I18nContext);
  const { connected, installedPlugins, installingId, installViaAPI, installViaProtocol } =
    React.useContext(DesktopContext);

  const [copiedLink, setCopiedLink] = React.useState<boolean>(false);

  const plugin = OFFICIAL_PLUGINS.find((p) => p.id === pluginId);

  if (!plugin) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 text-center space-y-4">
        <h1 className="text-2xl font-bold">Plugin Not Found</h1>
        <p className="text-sm text-muted-foreground">The requested plugin ID "{pluginId}" does not exist in the marketplace catalog.</p>
        <Link to="/" className="inline-flex items-center gap-2 text-sm text-primary font-medium hover:underline">
          <ArrowLeft className="size-4" />
          <span>{t("backToCatalog")}</span>
        </Link>
      </div>
    );
  }

  const Icon = getIconComponent(plugin.iconName);
  const isInstalled = installedPlugins.has(plugin.id);
  const isInstalling = installingId === plugin.id;

  const origin = typeof window !== "undefined" ? window.location.origin : "http://localhost:3000";
  const absoluteManifestUrl = plugin.manifestUrl.startsWith("http")
    ? plugin.manifestUrl
    : `${origin}${plugin.manifestUrl}`;
  const absoluteDownloadUrl = plugin.downloadUrl.startsWith("http")
    ? plugin.downloadUrl
    : `${origin}${plugin.downloadUrl}`;
  const protocolUrl = `bowerbird://plugin/install?manifest=${encodeURIComponent(absoluteManifestUrl)}&id=${encodeURIComponent(plugin.id)}&version=${encodeURIComponent(plugin.version)}`;

  const handleCopyProtocol = () => {
    if (typeof navigator !== "undefined") {
      navigator.clipboard.writeText(protocolUrl);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-12 w-full space-y-8">
      {/* Back button */}
      <Link
        to="/"
        className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="size-4" />
        <span>{t("backToCatalog")}</span>
      </Link>

      {/* Hero Header */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 p-6 sm:p-8 rounded-2xl border border-border/80 bg-card shadow-sm">
        <div className="flex items-start gap-4 sm:gap-6">
          <div className="size-16 sm:size-20 rounded-2xl bg-primary/10 text-primary flex items-center justify-center shrink-0 border border-primary/20 shadow-xs">
            <Icon className="size-8 sm:size-10" />
          </div>
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-2xl sm:text-3xl font-extrabold text-foreground tracking-tight">
                {plugin.name}
              </h1>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-semibold bg-muted text-foreground border border-border">
                v{plugin.version}
              </span>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-primary/10 text-primary border border-primary/20">
                {plugin.kind.toUpperCase()}
              </span>
            </div>
            <p className="text-sm text-muted-foreground max-w-2xl leading-relaxed">
              {plugin.description}
            </p>
            <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground pt-1">
              <span>By <strong className="text-foreground">{plugin.author}</strong></span>
              <span>•</span>
              <span className="flex items-center gap-1">
                <Star className="size-3.5 fill-amber-400 text-amber-400" />
                <strong>{plugin.rating}</strong> (Official)
              </span>
              <span>•</span>
              <span>License: <strong className="text-foreground">{plugin.license}</strong></span>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row md:flex-col gap-2.5 w-full md:w-auto shrink-0">
          {isInstalled ? (
            <div className="px-5 py-3 rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-emerald-600 dark:text-emerald-400 font-semibold text-sm flex items-center justify-center gap-2">
              <Check className="size-4" />
              <span>{t("installed")}</span>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => (connected ? installViaAPI(plugin) : installViaProtocol(plugin))}
              disabled={isInstalling}
              className="px-6 py-3 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 font-bold text-sm transition-all flex items-center justify-center gap-2 shadow-sm cursor-pointer disabled:opacity-50"
            >
              <Download className="size-4" />
              <span>{isInstalling ? t("installing") : t("oneClickInstall")}</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleCopyProtocol}
            className="px-4 py-2 rounded-xl border border-border hover:bg-muted/60 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors flex items-center justify-center gap-2 cursor-pointer"
            title="Copy bowerbird:// install URL"
          >
            {copiedLink ? <CheckCheck className="size-3.5 text-emerald-500" /> : <Copy className="size-3.5" />}
            <span>{copiedLink ? "Protocol link copied!" : "Copy bowerbird:// Link"}</span>
          </button>
        </div>
      </div>

      {/* Main Content Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left: Detailed Overview & Features */}
        <div className="lg:col-span-2 space-y-8">
          {/* Overview */}
          <div className="rounded-2xl border border-border/70 bg-card p-6 sm:p-8 space-y-4">
            <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
              <Sparkles className="size-5 text-primary" />
              <span>{t("detailsOverview")}</span>
            </h2>
            <div className="prose dark:prose-invert max-w-none text-sm text-muted-foreground leading-relaxed space-y-3 whitespace-pre-line">
              {plugin.longDescription}
            </div>
          </div>

          {/* Supported Formats */}
          <div className="rounded-2xl border border-border/70 bg-card p-6 sm:p-8 space-y-4">
            <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
              <Layers className="size-5 text-primary" />
              <span>{t("supportedFormats")}</span>
            </h2>
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2">
                {plugin.extensions.map((ext) => (
                  <div
                    key={ext}
                    className="px-3 py-1.5 rounded-lg bg-muted text-xs font-mono font-medium text-foreground border border-border/60 flex items-center gap-1.5"
                  >
                    <FileCode className="size-3.5 text-primary" />
                    <span>.{ext.replace(/^\./, "")}</span>
                  </div>
                ))}
              </div>
              {plugin.mimePrefixes && plugin.mimePrefixes.length > 0 && (
                <div className="text-xs text-muted-foreground">
                  <span>MIME Prefixes: </span>
                  <span className="font-mono">{plugin.mimePrefixes.join(", ")}</span>
                </div>
              )}
            </div>
          </div>

          {/* Version History */}
          <div className="rounded-2xl border border-border/70 bg-card p-6 sm:p-8 space-y-4">
            <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
              <Calendar className="size-5 text-primary" />
              <span>{t("versionHistory")}</span>
            </h2>
            <div className="space-y-4">
              {plugin.changelog.map((entry) => (
                <div key={entry.version} className="border-l-2 border-primary/40 pl-4 space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono font-bold text-foreground">v{entry.version}</span>
                    <span className="text-xs text-muted-foreground">({entry.date})</span>
                  </div>
                  <ul className="list-disc list-inside text-xs text-muted-foreground space-y-1">
                    {entry.notes.map((note, idx) => (
                      <li key={idx}>{note}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Sidebar: Meta & Manual Downloads */}
        <div className="space-y-6">
          {/* Manual Download Box */}
          <div className="rounded-2xl border border-border/70 bg-card p-6 space-y-4">
            <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
              <Download className="size-4 text-primary" />
              <span>{t("manualDownload")}</span>
            </h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              If Bowerbird is running offline or on a remote machine, you can download the manifest and entry bundle directly:
            </p>
            <div className="space-y-2 pt-1">
              <a
                href={absoluteManifestUrl}
                download="manifest.json"
                target="_blank"
                rel="noreferrer"
                className="w-full px-3 py-2 rounded-xl border border-border hover:bg-muted/70 text-xs font-medium text-foreground flex items-center justify-between transition-colors"
              >
                <span>{t("downloadManifest")}</span>
                <ExternalLink className="size-3 text-muted-foreground" />
              </a>
              <a
                href={absoluteDownloadUrl}
                download="index.js"
                target="_blank"
                rel="noreferrer"
                className="w-full px-3 py-2 rounded-xl border border-border hover:bg-muted/70 text-xs font-medium text-foreground flex items-center justify-between transition-colors"
              >
                <span>{t("downloadBundle")}</span>
                <ExternalLink className="size-3 text-muted-foreground" />
              </a>
            </div>
          </div>

          {/* Plugin Metadata Specification */}
          <div className="rounded-2xl border border-border/70 bg-card p-6 space-y-3 text-xs">
            <h3 className="font-bold text-foreground">Plugin Attributes</h3>
            <div className="divide-y divide-border/60">
              <div className="py-2 flex justify-between">
                <span className="text-muted-foreground">ID</span>
                <span className="font-mono font-medium text-foreground">{plugin.id}</span>
              </div>
              <div className="py-2 flex justify-between">
                <span className="text-muted-foreground">Kind</span>
                <span className="font-medium text-foreground capitalize">{plugin.kind}</span>
              </div>
              <div className="py-2 flex justify-between">
                <span className="text-muted-foreground">Priority</span>
                <span className="font-mono font-medium text-foreground">{plugin.priority} / 85</span>
              </div>
              <div className="py-2 flex justify-between">
                <span className="text-muted-foreground">Zoom Support</span>
                <span className="font-medium text-foreground">{plugin.supportsZoom ? "Yes" : "No"}</span>
              </div>
              <div className="py-2 flex justify-between">
                <span className="text-muted-foreground">Author</span>
                <span className="font-medium text-foreground">{plugin.author}</span>
              </div>
              <div className="py-2 flex justify-between">
                <span className="text-muted-foreground">License</span>
                <span className="font-medium text-foreground">{plugin.license}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
