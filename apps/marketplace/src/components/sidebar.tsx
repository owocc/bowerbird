import * as React from "react";
import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import {
  AppWindow,
  LayoutGrid,
  Search,
  Sparkles,
  FileText,
  Music,
  Code2,
  Table,
  BookOpen,
  Menu,
  X,
  Download,
} from "lucide-react";
import { Logo } from "./logo";
import { useI18n } from "../lib/i18n";
import { DesktopContext } from "../lib/desktop-context";

const PRIMARY_NAV_CONFIG = [
  { key: "sidebar.apps", to: "/", icon: LayoutGrid },
  { key: "sidebar.preview", to: "/category/$name", params: { name: "preview" }, icon: AppWindow },
  { key: "sidebar.metadata", to: "/category/$name", params: { name: "metadata" }, icon: Sparkles },
  { key: "sidebar.docs", to: "/docs", icon: BookOpen },
] as const;

const CATEGORIES_NAV_CONFIG = [
  { key: "sidebar.all", to: "/category/$name", params: { name: "all" }, id: "all", icon: LayoutGrid },
  { key: "sidebar.document", to: "/category/$name", params: { name: "document" }, id: "document", icon: FileText },
  { key: "sidebar.media", to: "/category/$name", params: { name: "media" }, id: "media", icon: Music },
  { key: "sidebar.code", to: "/category/$name", params: { name: "code" }, id: "code", icon: Code2 },
  { key: "sidebar.data", to: "/category/$name", params: { name: "data" }, id: "data", icon: Table },
] as const;

export function Sidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const pathname = location.pathname;
  const [searchTerm, setSearchTerm] = React.useState("");
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const { t } = useI18n();
  const { connected } = React.useContext(DesktopContext);

  // Close drawer on route navigation
  React.useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  // Lock body scroll when mobile drawer is open
  React.useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileOpen]);

  const handleSearchSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (searchTerm.trim()) {
      setMobileOpen(false);
      navigate({
        to: "/search",
        search: { q: searchTerm.trim() },
      });
    }
  };

  return (
    <>
      {/* Mobile Top Header (< md) */}
      <header className="md:hidden sticky top-0 z-40 w-full bg-background/90 backdrop-blur-md border-b border-border px-4 py-2.5 flex items-center justify-between select-none transition-colors duration-200">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="p-1.5 -ml-1 rounded-lg text-foreground hover:bg-secondary active:scale-95 transition cursor-pointer"
            aria-label="Open navigation menu"
          >
            <Menu className="w-5 h-5" />
          </button>
          <Logo variant="sidebar" href="/" />
        </div>

        <div className="flex items-center gap-2">
          <Link
            to="/docs"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary-hover active:scale-95 transition shadow-2xs"
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>{t("docs")}</span>
          </Link>
        </div>
      </header>

      {/* Mobile Slide-over Drawer (< md) */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity animate-in fade-in duration-200"
            onClick={() => setMobileOpen(false)}
            aria-hidden="true"
          />

          {/* Drawer Panel */}
          <div className="relative w-72 max-w-[84vw] h-full bg-background border-r border-border flex flex-col z-10 shadow-2xl p-4 overflow-y-auto animate-in slide-in-from-left duration-200">
            {/* Drawer Top Branding & Close Button */}
            <div className="flex items-center justify-between pb-3.5 border-b border-border">
              <Logo variant="sidebar" href="/" />
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition cursor-pointer"
                aria-label="Close navigation menu"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Mobile Search Bar */}
            <form onSubmit={handleSearchSubmit} className="relative mt-4">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder={t("sidebar.searchPlaceholder")}
                className="w-full pl-8 pr-3 py-2 bg-card border border-input rounded-xl text-xs text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </form>

            {/* Primary Navigation */}
            <nav className="mt-4 space-y-1">
              {PRIMARY_NAV_CONFIG.map((item) => {
                const Icon = item.icon;
                const isApps = item.to === "/" && pathname === "/";
                const isDocs = item.to === "/docs" && pathname === "/docs";
                const isSub = "params" in item && pathname === `/category/${item.params.name}`;
                const isActive = isApps || isDocs || isSub;
                const label = t(item.key);
                return (
                  <Link
                    key={item.key}
                    to={item.to}
                    params={"params" in item ? item.params : undefined}
                    onClick={() => setMobileOpen(false)}
                    className={`flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-colors ${
                      isActive
                        ? "bg-surface-active text-foreground font-semibold"
                        : "text-foreground hover:bg-secondary-hover/70"
                    }`}
                  >
                    <Icon className="w-4 h-4 text-foreground" />
                    <span>{label}</span>
                  </Link>
                );
              })}
            </nav>

            {/* Categories Navigation */}
            <div className="pt-4 mt-2 border-t border-border">
              <div className="flex items-center justify-between px-3 mb-2 text-[11px] font-semibold text-muted-foreground tracking-wider uppercase">
                <span className="flex items-center gap-1.5">
                  <LayoutGrid className="w-3 h-3 text-foreground" />
                  {t("sidebar.categoriesHeader")}
                </span>
              </div>

              <nav className="space-y-1">
                {CATEGORIES_NAV_CONFIG.map((cat) => {
                  const Icon = cat.icon;
                  const isActive = pathname === `/category/${cat.id}`;
                  const label = t(cat.key);
                  return (
                    <Link
                      key={cat.key}
                      to={cat.to}
                      params={cat.params}
                      onClick={() => setMobileOpen(false)}
                      className={`flex items-center gap-3 px-3 py-2 rounded-xl text-[13px] font-normal transition-colors ${
                        isActive
                          ? "bg-surface-active text-foreground font-semibold"
                          : "text-foreground hover:bg-secondary-hover/70"
                      }`}
                    >
                      <Icon className="w-4 h-4 text-foreground" />
                      <span>{label}</span>
                    </Link>
                  );
                })}
              </nav>
            </div>

            {/* Desktop Connection Status */}
            <div className="mt-auto pt-6 border-t border-border space-y-2">
              <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-card border border-border text-xs text-muted-foreground">
                <span className={`w-2 h-2 rounded-full ${connected ? "bg-emerald-500" : "bg-amber-500"}`} />
                <span className="font-medium text-foreground">
                  {connected ? "Bowerbird 客户端已连接" : "客户端未运行 (使用协议唤起)"}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Desktop Sidebar (hidden on < md, sticky on >= md) */}
      <aside className="hidden md:flex w-64 min-w-[16rem] h-screen sticky top-0 bg-background border-r border-border flex-col select-none z-30 self-start transition-colors duration-200">
        <div className="p-4 space-y-4 overflow-y-auto h-full flex flex-col justify-between">
          <div className="space-y-4">
            <Logo variant="sidebar" href="/" />

            {/* Search Input */}
            <form onSubmit={handleSearchSubmit} className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder={t("sidebar.searchPlaceholder")}
                className="w-full pl-8 pr-3 py-1.5 bg-card border border-input rounded-lg text-xs text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 transition"
              />
            </form>

            {/* Primary Navigation */}
            <nav className="space-y-1">
              {PRIMARY_NAV_CONFIG.map((item) => {
                const Icon = item.icon;
                const isApps = item.to === "/" && pathname === "/";
                const isDocs = item.to === "/docs" && pathname === "/docs";
                const isSub = "params" in item && pathname === `/category/${item.params.name}`;
                const isActive = isApps || isDocs || isSub;
                const label = t(item.key);
                return (
                  <Link
                    key={item.key}
                    to={item.to}
                    params={"params" in item ? item.params : undefined}
                    className={`flex items-center gap-3 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                      isActive
                        ? "bg-surface-active text-foreground font-semibold"
                        : "text-foreground hover:bg-secondary-hover/70"
                    }`}
                  >
                    <Icon className="w-4 h-4 text-foreground" />
                    <span>{label}</span>
                  </Link>
                );
              })}
            </nav>

            {/* Categories Navigation */}
            <div className="pt-2">
              <div className="flex items-center justify-between px-3 mb-1 text-[11px] font-semibold text-muted-foreground tracking-wider uppercase">
                <span className="flex items-center gap-1.5">
                  <LayoutGrid className="w-3 h-3 text-foreground" />
                  {t("sidebar.categoriesHeader")}
                </span>
              </div>

              <nav className="space-y-0.5">
                {CATEGORIES_NAV_CONFIG.map((cat) => {
                  const Icon = cat.icon;
                  const isActive = pathname === `/category/${cat.id}`;
                  const label = t(cat.key);
                  return (
                    <Link
                      key={cat.key}
                      to={cat.to}
                      params={cat.params}
                      className={`flex items-center gap-3 px-3 py-1.5 rounded-lg text-[13px] font-normal transition-colors ${
                        isActive
                          ? "bg-surface-active text-foreground font-semibold"
                          : "text-foreground hover:bg-secondary-hover/70"
                      }`}
                    >
                      <Icon className="w-4 h-4 text-foreground" />
                      <span>{label}</span>
                    </Link>
                  );
                })}
              </nav>
            </div>
          </div>

          {/* Bottom Desktop Connection Status */}
          <div className="pt-4 border-t border-border">
            <div className="p-3 rounded-xl bg-card border border-border text-xs space-y-1">
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${connected ? "bg-emerald-500" : "bg-amber-500"}`} />
                <span className="font-semibold text-foreground">
                  {connected ? "Bowerbird 已连接" : "Bowerbird 客户端离线"}
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground leading-snug">
                {connected ? "已启用一键安装与实时状态同步" : "启动桌面应用可启用一键安装"}
              </p>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
