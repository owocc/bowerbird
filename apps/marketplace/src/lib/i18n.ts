import * as React from "react";

export type Locale = "en" | "zh";

export interface Translations {
  catalogTitle: string;
  catalogSubtitle: string;
  searchPlaceholder: string;
  categoryAll: string;
  categoryPreview: string;
  categoryMetadata: string;
  desktopConnected: string;
  desktopOffline: string;
  desktopHelp: string;
  installBowerbird: string;
  installPlugin: string;
  installing: string;
  installed: string;
  uninstall: string;
  openDetails: string;
  docsTitle: string;
  navMarketplace: string;
  navDocs: string;
  navGithub: string;
  backToCatalog: string;
  supportedFormats: string;
  versionHistory: string;
  detailsOverview: string;
  manualDownload: string;
  downloadManifest: string;
  downloadBundle: string;
  oneClickInstall: string;
  oneClickHint: string;
  sdkQuickStart: string;
  sdkManifestSpec: string;
  sdkHostApi: string;
  sdkPackaging: string;
  rating: string;
  author: string;
  version: string;
  priority: string;
}

export const MESSAGES: Record<Locale, Translations> = {
  en: {
    catalogTitle: "Bowerbird Plugin Marketplace",
    catalogSubtitle: "Extend Bowerbird with community and official plugins for rich media previews, metadata inspection, and custom workflows.",
    searchPlaceholder: "Search plugins by name, format, or description...",
    categoryAll: "All Plugins",
    categoryPreview: "Preview Plugins",
    categoryMetadata: "Metadata Plugins",
    desktopConnected: "Desktop App Connected",
    desktopOffline: "Desktop App Offline",
    desktopHelp: "Launch Bowerbird on your computer to enable 1-click remote installs and real-time status detection.",
    installBowerbird: "Install via Bowerbird",
    installPlugin: "Install",
    installing: "Installing...",
    installed: "Installed",
    uninstall: "Uninstall",
    openDetails: "View Details",
    docsTitle: "Plugin Developer Documentation",
    navMarketplace: "Marketplace",
    navDocs: "SDK Docs",
    navGithub: "GitHub",
    backToCatalog: "Back to Catalog",
    supportedFormats: "Supported Formats",
    versionHistory: "Version History",
    detailsOverview: "Overview & Features",
    manualDownload: "Manual Download",
    downloadManifest: "manifest.json",
    downloadBundle: "index.js",
    oneClickInstall: "1-Click Install to Bowerbird",
    oneClickHint: "Triggers bowerbird:// OS protocol handler to install this plugin directly inside your local Bowerbird library.",
    sdkQuickStart: "Quick Start Guide",
    sdkManifestSpec: "Plugin Manifest Specification",
    sdkHostApi: "Host API & Capabilities",
    sdkPackaging: "Building & Publishing",
    rating: "Rating",
    author: "Author",
    version: "Version",
    priority: "Priority",
  },
  zh: {
    catalogTitle: "Bowerbird 插件市场",
    catalogSubtitle: "使用官方与社区插件扩展 Bowerbird，支持富媒体预览、元数据透视和自动化工作流。",
    searchPlaceholder: "按插件名称、支持格式或描述搜索...",
    categoryAll: "全部插件",
    categoryPreview: "预览插件",
    categoryMetadata: "元数据插件",
    desktopConnected: "桌面端已连接",
    desktopOffline: "桌面端未启动",
    desktopHelp: "在计算机上启动 Bowerbird 即可启用一键安装及本地状态同步。",
    installBowerbird: "通过 Bowerbird 安装",
    installPlugin: "安装插件",
    installing: "正在安装...",
    installed: "已安装",
    uninstall: "卸载",
    openDetails: "查看详情",
    docsTitle: "插件开发指南",
    navMarketplace: "插件市场",
    navDocs: "开发文档",
    navGithub: "代码仓库",
    backToCatalog: "返回插件列表",
    supportedFormats: "支持文件格式",
    versionHistory: "版本更新历史",
    detailsOverview: "功能特点",
    manualDownload: "手动下载",
    downloadManifest: "下载 manifest.json",
    downloadBundle: "下载 index.js",
    oneClickInstall: "一键安装到 Bowerbird",
    oneClickHint: "通过 bowerbird:// 系统协议直接安装到您本地运行的 Bowerbird 桌面客户端。",
    sdkQuickStart: "快速开始",
    sdkManifestSpec: "插件清单规范",
    sdkHostApi: "宿主 API 与能力",
    sdkPackaging: "构建与发布",
    rating: "评分",
    author: "作者",
    version: "版本",
    priority: "优先级",
  },
};

export interface I18nContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: keyof Translations) => string;
}

export const I18nContext = React.createContext<I18nContextValue>({
  locale: "en",
  setLocale: () => {},
  t: (key) => MESSAGES.en[key] || String(key),
});

export function useI18n(): I18nContextValue {
  return React.useContext(I18nContext);
}
