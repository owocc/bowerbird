import * as React from "react";
import { Link } from "@tanstack/react-router";
import {
  Download,
  Check,
  Star,
  ShieldCheck,
  FileCode,
  Layers,
  Sparkles,
  ExternalLink,
  Laptop,
  Copy,
  CheckCheck,
  ArrowLeft,
  Share2,
} from "lucide-react";
import type { MarketplacePlugin } from "../data/plugins";
import { getPluginIcon } from "./plugin-icon";
import { DesktopContext } from "../lib/desktop-context";
import { useI18n } from "../lib/i18n";

interface Props {
  plugin: MarketplacePlugin;
  otherPlugins?: MarketplacePlugin[];
}

export function PluginDetailClient({ plugin, otherPlugins = [] }: Props) {
  const { t } = useI18n();
  const { connected, installedPlugins, installingId, installViaAPI, installViaProtocol } =
    React.useContext(DesktopContext);

  const [copiedLink, setCopiedLink] = React.useState(false);
  const [copiedProtocol, setCopiedProtocol] = React.useState(false);

  const isInstalled = installedPlugins.has(plugin.id);
  const isInstalling = installingId === plugin.id;
  const Icon = getPluginIcon(plugin.iconName);

  const handleCopyLink = () => {
    if (typeof window !== "undefined") {
      navigator.clipboard.writeText(window.location.href);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    }
  };

  const handleCopyProtocol = () => {
    if (typeof window !== "undefined") {
      const manifestUrl = plugin.manifestUrl.startsWith("http")
        ? plugin.manifestUrl
        : `${window.location.origin}${plugin.manifestUrl}`;
      const protocolUrl = `bowerbird://plugins/install?manifest=${encodeURIComponent(manifestUrl)}`;
      navigator.clipboard.writeText(protocolUrl);
      setCopiedProtocol(true);
      setTimeout(() => setCopiedProtocol(false), 2000);
    }
  };

  const handleInstall = () => {
    if (installViaAPI) {
      void installViaAPI(plugin);
    } else {
      installViaProtocol(plugin);
    }
  };

  const screenshots =
    plugin.screenshots && plugin.screenshots.length > 0
      ? plugin.screenshots
      : plugin.cover_url
      ? [plugin.cover_url]
      : [];

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
            <span>返回插件中心</span>
          </Link>
        </div>

        {/* Hero Header Section */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 pb-8 border-b border-border">
          <div className="flex items-start sm:items-center gap-5 min-w-0">
            <div className="w-20 h-20 sm:w-28 sm:h-28 rounded-2xl sm:rounded-3xl bg-primary/10 text-primary flex items-center justify-center shrink-0 border border-primary/20 shadow-md">
              <Icon className="w-10 h-10 sm:w-14 sm:h-14" />
            </div>

            <div className="space-y-1.5 min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl sm:text-4xl font-extrabold text-foreground tracking-tight truncate">
                  {plugin.name}
                </h1>
                {plugin.featured && (
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                    精选推荐
                  </span>
                )}
              </div>

              <p className="text-sm sm:text-base text-muted-foreground font-medium">
                {plugin.tagline || plugin.description}
              </p>

              <div className="flex flex-wrap items-center gap-2 pt-1 text-xs text-muted-foreground">
                <span className="font-semibold text-foreground">由 {plugin.author} 提供</span>
                <span>•</span>
                <span className="font-mono">v{plugin.version}</span>
                <span>•</span>
                <span className="px-2 py-0.5 rounded-md bg-secondary text-secondary-foreground font-medium border border-border">
                  {plugin.kind === "preview" ? "预览扩展" : "元数据透视"}
                </span>
                <span>•</span>
                <span className="text-[#FF9500] font-semibold flex items-center gap-0.5">
                  ★ {plugin.rating} ({plugin.downloadsCount} 次安装)
                </span>
              </div>

              {/* Supported format badges */}
              {plugin.extensions.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 pt-1.5">
                  <span className="text-[11px] font-medium text-muted-foreground">支持格式:</span>
                  {plugin.extensions.map((ext) => (
                    <span
                      key={ext}
                      className="px-2 py-0.5 rounded-md bg-muted text-[11px] font-mono font-medium text-muted-foreground border border-border/50"
                    >
                      .{ext}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full sm:w-auto shrink-0">
            {isInstalled ? (
              <button
                type="button"
                disabled
                className="inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-semibold text-sm border border-emerald-500/30 cursor-default"
              >
                <Check className="w-4 h-4" />
                <span>已安装到客户端</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={handleInstall}
                disabled={isInstalling}
                className="inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-full bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary-hover active:scale-[0.98] transition-all shadow-sm cursor-pointer"
              >
                <Download className="w-4 h-4" />
                <span>{isInstalling ? "正在安装中..." : connected ? "一键安装到客户端" : "通过客户端安装"}</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleCopyLink}
              title="分享插件链接"
              className="inline-flex items-center justify-center p-2.5 rounded-full border border-border bg-card text-foreground hover:bg-surface active:scale-95 transition cursor-pointer"
            >
              {copiedLink ? <Check className="w-4 h-4 text-emerald-500" /> : <Share2 className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Screenshots Showcase */}
        {screenshots.length > 0 && (
          <section className="space-y-4">
            <h2 className="text-lg sm:text-xl font-bold tracking-tight text-foreground">
              界面预览
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {screenshots.map((url, i) => (
                <div
                  key={i}
                  className="rounded-2xl overflow-hidden border border-border bg-card shadow-xs group"
                >
                  <div className="aspect-video w-full overflow-hidden bg-muted">
                    <img
                      src={url}
                      alt={`${plugin.name} preview ${i + 1}`}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    />
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Detailed Description */}
        <section className="space-y-4">
          <h2 className="text-lg sm:text-xl font-bold tracking-tight text-foreground">
            插件介绍与功能特点
          </h2>

          <div className="prose dark:prose-invert max-w-none bg-card p-6 rounded-2xl border border-border text-sm leading-relaxed whitespace-pre-line">
            {plugin.longDescription || plugin.description}
          </div>
        </section>

        {/* Technical Specifications */}
        <section className="space-y-4">
          <h2 className="text-lg sm:text-xl font-bold tracking-tight text-foreground">
            规格与元数据
          </h2>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            <div className="bg-card p-4 rounded-xl border border-border space-y-1">
              <span className="text-xs text-muted-foreground">插件唯一 ID</span>
              <p className="text-xs font-mono font-semibold text-foreground truncate">{plugin.id}</p>
            </div>
            <div className="bg-card p-4 rounded-xl border border-border space-y-1">
              <span className="text-xs text-muted-foreground">能力类型</span>
              <p className="text-sm font-semibold text-foreground truncate">
                {plugin.kind === "preview" ? "预览视口扩展" : "属性检视扩展"}
              </p>
            </div>
            <div className="bg-card p-4 rounded-xl border border-border space-y-1">
              <span className="text-xs text-muted-foreground">评估优先级</span>
              <p className="text-sm font-semibold text-foreground truncate">{plugin.priority}</p>
            </div>
            <div className="bg-card p-4 rounded-xl border border-border space-y-1">
              <span className="text-xs text-muted-foreground">开源协议</span>
              <p className="text-sm font-semibold text-foreground truncate">{plugin.license || "MIT"}</p>
            </div>
            <div className="bg-card p-4 rounded-xl border border-border space-y-1">
              <span className="text-xs text-muted-foreground">入口脚本</span>
              <p className="text-sm font-mono font-semibold text-foreground truncate">{plugin.main || "index.js"}</p>
            </div>
            <div className="bg-card p-4 rounded-xl border border-border space-y-1">
              <span className="text-xs text-muted-foreground">缩放支持</span>
              <p className="text-sm font-semibold text-foreground truncate">
                {plugin.supportsZoom ? "支持" : "自适应"}
              </p>
            </div>
            <div className="bg-card p-4 rounded-xl border border-border space-y-1">
              <span className="text-xs text-muted-foreground">当前版本</span>
              <p className="text-sm font-mono font-semibold text-foreground truncate">v{plugin.version}</p>
            </div>
            <div className="bg-card p-4 rounded-xl border border-border space-y-1">
              <span className="text-xs text-muted-foreground">安装总数</span>
              <p className="text-sm font-semibold text-foreground truncate">{plugin.downloadsCount} 次</p>
            </div>
          </div>
        </section>

        {/* Manual Download Links */}
        <section className="bg-surface/50 rounded-2xl p-6 border border-border space-y-4">
          <h2 className="text-base font-bold text-foreground">手动下载与集成</h2>
          <p className="text-xs text-muted-foreground">
            您也可以直接下载插件产物，或复制协议链接直接在本地或受控离线环境加载。
          </p>

          <div className="flex flex-wrap items-center gap-3 pt-1">
            <a
              href={plugin.manifestUrl}
              target="_blank"
              rel="noopener noreferrer"
              download="manifest.json"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-card border border-border text-xs font-semibold text-foreground hover:bg-muted transition"
            >
              <FileCode className="w-3.5 h-3.5" />
              <span>下载 manifest.json</span>
            </a>

            <a
              href={plugin.downloadUrl}
              target="_blank"
              rel="noopener noreferrer"
              download="index.js"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-card border border-border text-xs font-semibold text-foreground hover:bg-muted transition"
            >
              <Download className="w-3.5 h-3.5" />
              <span>下载 index.js 脚本包</span>
            </a>

            <button
              type="button"
              onClick={handleCopyProtocol}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-card border border-border text-xs font-semibold text-foreground hover:bg-muted transition cursor-pointer"
            >
              {copiedProtocol ? <CheckCheck className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedProtocol ? "已复制 bowerbird:// 协议" : "复制协议安装链接"}</span>
            </button>
          </div>
        </section>

        {/* Changelog */}
        {plugin.changelog && plugin.changelog.length > 0 && (
          <section className="space-y-4">
            <h2 className="text-lg sm:text-xl font-bold tracking-tight text-foreground">
              版本更新历史
            </h2>

            <div className="bg-card rounded-2xl p-6 border border-border space-y-4">
              {plugin.changelog.map((entry, idx) => (
                <div key={idx} className="space-y-2 pb-4 last:pb-0 border-b last:border-0 border-border">
                  <div className="flex items-center gap-3">
                    <span className="font-mono font-bold text-sm text-foreground">v{entry.version}</span>
                    <span className="text-xs text-muted-foreground">{entry.date}</span>
                  </div>
                  <ul className="list-disc list-inside text-xs text-muted-foreground space-y-1">
                    {entry.notes.map((note, nIdx) => (
                      <li key={nIdx}>{note}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Related Plugins */}
        {otherPlugins.length > 0 && (
          <section className="space-y-4 pt-4 border-t border-border">
            <h2 className="text-lg sm:text-xl font-bold tracking-tight text-foreground">
              相关插件推荐
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {otherPlugins.slice(0, 4).map((other) => {
                const OtherIcon = getPluginIcon(other.iconName);
                return (
                  <Link
                    key={other.id}
                    to="/plugins/$pluginId"
                    params={{ pluginId: other.id }}
                    className="p-3 bg-card rounded-2xl border border-border hover:border-primary/50 transition-colors flex items-center gap-3 group"
                  >
                    <div className="w-12 h-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0 border border-primary/20 group-hover:scale-105 transition-transform">
                      <OtherIcon className="w-6 h-6" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="text-xs font-semibold text-foreground truncate group-hover:text-primary transition-colors">
                        {other.name}
                      </h3>
                      <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                        {other.tagline || other.description}
                      </p>
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
