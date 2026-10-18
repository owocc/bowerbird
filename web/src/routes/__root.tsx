import {
  Outlet,
  ScrollRestoration,
  createRootRoute,
  HeadContent,
  Scripts,
  Link,
  useLocation,
} from "@tanstack/react-router";
import * as React from "react";
import {
  Moon,
  Sun,
  Laptop,
  CheckCircle2,
  AlertCircle,
  BookOpen,
  Sparkles,
  ExternalLink,
  Languages,
} from "lucide-react";
import appCss from "../styles/app.css?url";
import { I18nContext, MESSAGES, type Locale } from "../lib/i18n";
import { DesktopProvider, DesktopContext } from "../lib/desktop-context";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Bowerbird Plugin Marketplace" },
      {
        name: "description",
        content: "Discover, inspect, and install plugins for Bowerbird",
      },
    ],
    links: [{ rel: "stylesheet", href: appCss }],
  }),
  component: RootComponent,
});

function RootComponent() {
  const [theme, setTheme] = React.useState<"light" | "dark">("dark");
  const [locale, setLocale] = React.useState<Locale>("en");

  React.useEffect(() => {
    if (typeof window !== "undefined") {
      const storedTheme = localStorage.getItem("bowerbird-web-theme");
      if (storedTheme === "light" || storedTheme === "dark") {
        setTheme(storedTheme);
        document.documentElement.classList.toggle("dark", storedTheme === "dark");
      } else {
        document.documentElement.classList.add("dark");
      }
      const storedLocale = localStorage.getItem("bowerbird-web-locale");
      if (storedLocale === "zh" || storedLocale === "en") {
        setLocale(storedLocale);
      }
    }
  }, []);

  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    localStorage.setItem("bowerbird-web-theme", next);
    document.documentElement.classList.toggle("dark", next === "dark");
  };

  const handleSetLocale = (next: Locale) => {
    setLocale(next);
    localStorage.setItem("bowerbird-web-locale", next);
  };

  const t = (key: keyof (typeof MESSAGES)["en"]) => {
    return MESSAGES[locale][key] || MESSAGES.en[key] || String(key);
  };

  return (
    <html lang={locale} className={theme === "dark" ? "dark" : ""}>
      <head>
        <HeadContent />
      </head>
      <body className="min-h-screen bg-background text-foreground antialiased selection:bg-primary/20 flex flex-col font-sans">
        <I18nContext.Provider value={{ locale, setLocale: handleSetLocale, t }}>
          <DesktopProvider>
            <AppHeader theme={theme} onToggleTheme={toggleTheme} />
            <main className="flex-1 w-full flex flex-col">
              <Outlet />
            </main>
            <AppFooter />
          </DesktopProvider>
        </I18nContext.Provider>
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

function AppHeader({
  theme,
  onToggleTheme,
}: {
  theme: "light" | "dark";
  onToggleTheme: () => void;
}) {
  const location = useLocation();
  const { locale, setLocale, t } = React.useContext(I18nContext);
  const { connected, checking } = React.useContext(DesktopContext);

  return (
    <header className="sticky top-0 z-40 w-full border-b border-border/70 bg-background/85 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
        {/* Brand */}
        <div className="flex items-center gap-6">
          <Link to="/" className="flex items-center gap-2.5 font-bold tracking-tight text-lg hover:opacity-90 transition-opacity">
            <div className="size-8 rounded-lg bg-primary text-primary-foreground flex items-center justify-center shadow-xs">
              <Sparkles className="size-4" />
            </div>
            <span>Bowerbird</span>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
              Marketplace
            </span>
          </Link>

          {/* Navigation Links */}
          <nav className="hidden md:flex items-center gap-1 text-sm font-medium">
            <Link
              to="/"
              className={`px-3 py-1.5 rounded-md transition-colors ${
                location.pathname === "/"
                  ? "bg-accent text-accent-foreground font-semibold"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              }`}
            >
              {t("navMarketplace")}
            </Link>
            <Link
              to="/docs"
              className={`px-3 py-1.5 rounded-md transition-colors flex items-center gap-1.5 ${
                location.pathname.startsWith("/docs")
                  ? "bg-accent text-accent-foreground font-semibold"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              }`}
            >
              <BookOpen className="size-3.5" />
              {t("navDocs")}
            </Link>
          </nav>
        </div>

        {/* Right Controls */}
        <div className="flex items-center gap-3">
          {/* Desktop Connection Pill */}
          <div
            className={`hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
              connected
                ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/25"
                : "bg-muted/60 text-muted-foreground border-border/80"
            }`}
            title={connected ? t("desktopConnected") : t("desktopHelp")}
          >
            {checking ? (
              <span className="size-2 rounded-full bg-muted-foreground/50 animate-pulse" />
            ) : connected ? (
              <>
                <span className="relative flex size-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full size-2 bg-emerald-500" />
                </span>
                <CheckCircle2 className="size-3.5" />
                <span>{t("desktopConnected")}</span>
              </>
            ) : (
              <>
                <Laptop className="size-3.5" />
                <span>{t("desktopOffline")}</span>
              </>
            )}
          </div>

          {/* Language Switch */}
          <button
            type="button"
            onClick={() => setLocale(locale === "en" ? "zh" : "en")}
            className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md border border-border hover:bg-muted/60 transition-colors cursor-pointer"
            title="Toggle Language (EN / 中文)"
          >
            <Languages className="size-3.5 text-muted-foreground" />
            <span>{locale === "en" ? "中" : "EN"}</span>
          </button>

          {/* Theme Toggle */}
          <button
            type="button"
            onClick={onToggleTheme}
            className="p-1.5 rounded-md border border-border text-foreground hover:bg-muted/60 transition-colors cursor-pointer"
            title="Toggle theme"
            aria-label="Toggle theme"
          >
            {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
          </button>
        </div>
      </div>
    </header>
  );
}

function AppFooter() {
  const { t } = React.useContext(I18nContext);

  return (
    <footer className="border-t border-border/60 bg-muted/20 py-8 px-4 text-xs text-muted-foreground">
      <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-foreground">Bowerbird</span>
          <span>&copy; {new Date().getFullYear()} Modern Desktop Asset Library</span>
        </div>
        <div className="flex items-center gap-4">
          <Link to="/docs" className="hover:text-foreground transition-colors">
            {t("navDocs")}
          </Link>
          <a
            href="https://github.com"
            target="_blank"
            rel="noreferrer"
            className="hover:text-foreground transition-colors flex items-center gap-1"
          >
            <span>{t("navGithub")}</span>
            <ExternalLink className="size-3" />
          </a>
        </div>
      </div>
    </footer>
  );
}
