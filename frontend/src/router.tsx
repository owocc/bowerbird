import { useEffect } from "react";
import { default as FolderOpen } from "~icons/ri/folder-open-line";
import { default as Settings } from "~icons/ri/settings-line";
import { useTranslation } from "react-i18next";
import {
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
  Outlet,
  Navigate,
  createHashHistory,
} from "@tanstack/react-router";
import { LibraryProvider, useLibrary } from "@/lib/library-context";
import { validateWorkspaceSearch } from "@/lib/workspace-search";
import { LibrarySetup } from "@/components/LibrarySetup";
import { LibraryWorkspace } from "@/components/LibraryWorkspace";
import { SettingsPage } from "@/components/SettingsPage";
import { LogsPage } from "@/components/LogsPage";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { Button } from "@/components/ui/button";
import { MacTrafficLightSpacer } from "@/components/MacTrafficLightSpacer";
import { AppMenuButton } from "@/components/AppMenuButton";
import { usesInAppMenuBar } from "@/lib/platform";
import { useAppShortcuts } from "@/hooks/useAppShortcuts";
import { useHistoryShortcuts } from "@/hooks/useHistoryShortcuts";
import { isMacOS } from "@/lib/macos";
import { OpenSetupWindow, OpenSettingsWindow } from "../bindings/bowerbird/core/service";

/**
 * Paints the appearance gradient behind the whole app.
 *
 * It is a fixed layer rather than a body background so that it survives a
 * transparent `app-shell` without inheriting the content's stacking contexts,
 * and so that `index.html`'s first-paint script can prime it before React runs.
 */
function BackdropLayer() {
  return (
    <div
      data-slot="backdrop"
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-0"
      style={{ backgroundImage: "var(--app-backdrop, none)" }}
    />
  );
}

function RootLayout() {
  // In-app shortcuts (settings/logs on every window; window chrome on Win/Linux).
  useAppShortcuts();
  // Browser-style Back/Forward shortcuts, wired to the router history.
  useHistoryShortcuts();

  // Lets platform-specific CSS key off macOS without a build-time switch.
  useEffect(() => {
    if (isMacOS()) {
      document.documentElement.setAttribute("data-macos", "");
    }
  }, []);

  return (
    <ThemeProvider defaultTheme="system" storageKey="bowerbird-ui-theme">
      <LibraryProvider>
        {/* The backdrop gradient sits between <body> and the app: it is painted
            here, below the content, and only shows wherever the app draws no
            fill of its own (the vibrancy-transparent sidebar). */}
        <BackdropLayer />
        <div
          data-slot="app-shell"
          className="relative h-screen w-screen overflow-hidden text-foreground antialiased font-sans flex flex-col"
        >
          <Outlet />
        </div>
        <Toaster position="bottom-right" richColors />
      </LibraryProvider>
    </ThemeProvider>
  );
}

/**
 * Empty library placeholder shown in the main window when no library is active.
 * Automatically requests the standalone Setup window to open.
 */
function EmptyLibraryPlaceholder() {
  const { t } = useTranslation();

  useEffect(() => {
    // Reveal or focus the setup window
    OpenSetupWindow().catch(console.error);
  }, []);

  return (
    <div
      data-slot="page-root"
      className="relative h-screen w-screen overflow-hidden flex flex-col items-center justify-center p-6 select-none"
    >
      <div className="absolute top-0 left-0 right-0 h-(--titlebar-height) flex items-center px-3 z-10 wails-drag">
        <MacTrafficLightSpacer className="w-[80px] h-(--titlebar-height) shrink-0" />
        <div className="flex-1 h-full" />
      </div>

      <div className="absolute top-3 left-3 z-20 wails-no-drag">
        <AppMenuButton className="size-8" />
      </div>

      {!usesInAppMenuBar() && (
        <button
          type="button"
          onClick={() => OpenSettingsWindow().catch(console.error)}
          title={t("settings.title")}
          className="absolute top-3 right-3 z-20 inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors cursor-pointer wails-no-drag"
        >
          <Settings className="size-4" />
          <span>{t("settings.title")}</span>
        </button>
      )}

      <div className="flex flex-col items-center gap-3 text-center max-w-sm wails-no-drag">
        <div className="p-3.5 rounded-2xl bg-muted/60 text-muted-foreground">
          <FolderOpen className="size-6" />
        </div>
        <div className="space-y-1">
          <p className="text-sm font-semibold">{t("app.noActiveLibrary")}</p>
          <p className="text-xs text-muted-foreground">{t("app.openSetup")}</p>
        </div>
        <Button
          type="button"
          size="sm"
          onClick={() => OpenSetupWindow().catch(console.error)}
          className="mt-2 text-xs"
        >
          {t("app.openSetup")}
        </Button>
      </div>
    </div>
  );
}

/**
 * `/` redirects straight to `/browse` with `replace`, so the root redirect
 * is never kept in the history stack.
 */
function IndexRedirect() {
  const { t } = useTranslation();
  const { ready } = useLibrary();

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background text-xs text-muted-foreground font-mono">
        {t("app.initializing")}
      </div>
    );
  }

  return <Navigate to="/browse" replace />;
}

function BrowsePage() {
  const { t } = useTranslation();
  const { library, ready, closeLibrary, notifyLibraryChanged } = useLibrary();

  // Wait for the initial library probe so a reload does not flash the empty state
  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background text-xs text-muted-foreground font-mono">
        {t("app.initializing")}
      </div>
    );
  }

  if (!library) {
    return <EmptyLibraryPlaceholder />;
  }

  return (
    <LibraryWorkspace
      library={library}
      onLibraryClosed={closeLibrary}
      onLibraryChanged={notifyLibraryChanged}
    />
  );
}

const rootRoute = createRootRoute({
  component: RootLayout,
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: IndexRedirect,
});

// Rendered in its own native window exclusively (see core.Service.OpenSetupWindow).
// Kept detached from the main window navigation history.
const setupRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/setup",
  component: LibrarySetup,
});

const browseRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/browse",
  validateSearch: validateWorkspaceSearch,
  component: BrowsePage,
});

// Rendered in its own native window (see core.Service.OpenSettingsWindow).
const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/settings",
  component: SettingsPage,
});

// Rendered in its own native window (see core.Service.OpenLogsWindow).
const logsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/logs",
  component: LogsPage,
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  setupRoute,
  browseRoute,
  settingsRoute,
  logsRoute,
]);

const hashHistory = createHashHistory();

export const router = createRouter({
  routeTree,
  history: hashHistory,
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

export function App() {
  return <RouterProvider router={router} />;
}
