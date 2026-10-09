import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
  Outlet,
  createHashHistory,
} from "@tanstack/react-router";
import { GetActiveLibrary } from "../bindings/bowerbird/core/service";
import type { LibraryInfo } from "../bindings/bowerbird/core/models";
import { LibrarySetup } from "@/components/LibrarySetup";
import { LibraryWorkspace } from "@/components/LibraryWorkspace";
import { SettingsPage } from "@/components/SettingsPage";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { useSettingsShortcut } from "@/hooks/useSettingsShortcut";
import { useAppShortcuts } from "@/hooks/useAppShortcuts";

function RootLayout() {
  // App-local Cmd/Ctrl+ shortcut for the settings window, active on every route.
  useSettingsShortcut();
  // Standard window/app shortcuts on the platforms that draw their own menu
  // (Windows and Linux); macOS gets them from its native menu.
  useAppShortcuts();

  return (
    <ThemeProvider defaultTheme="system" storageKey="bowerbird-ui-theme">
      <div className="min-h-screen bg-background text-foreground antialiased font-sans flex flex-col">
        <Outlet />
      </div>
      <Toaster position="bottom-right" richColors />
    </ThemeProvider>
  );
}

function HomePage() {
  const { t } = useTranslation();
  const [activeLibrary, setActiveLibrary] = useState<LibraryInfo | null>(null);
  const [initializing, setInitializing] = useState(true);

  useEffect(() => {
    async function checkLibrary() {
      try {
        const lib = await GetActiveLibrary();
        if (lib) {
          setActiveLibrary(lib);
        }
      } catch (err) {
        console.error("Failed to check active library:", err);
      } finally {
        setInitializing(false);
      }
    }
    checkLibrary();
  }, []);

  if (initializing) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background text-xs text-muted-foreground font-mono">
        {t("app.initializing")}
      </div>
    );
  }

  if (!activeLibrary) {
    return <LibrarySetup onLibraryOpened={(lib) => setActiveLibrary(lib)} />;
  }

  return (
    <LibraryWorkspace
      library={activeLibrary}
      onLibraryClosed={() => setActiveLibrary(null)}
      onLibraryChanged={(lib) => setActiveLibrary(lib)}
    />
  );
}

const rootRoute = createRootRoute({
  component: RootLayout,
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: HomePage,
});

// Rendered in its own native window (see core.Service.OpenSettingsWindow).
const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/settings",
  component: SettingsPage,
});

const routeTree = rootRoute.addChildren([indexRoute, settingsRoute]);

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
