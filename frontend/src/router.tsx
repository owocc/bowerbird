import { useState, useEffect } from "react";
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
import { ThemeProvider } from "@/components/theme-provider";

function RootLayout() {
  return (
    <ThemeProvider defaultTheme="system" storageKey="bowerbird-ui-theme">
      <div className="min-h-screen bg-background text-foreground antialiased font-sans flex flex-col">
        <Outlet />
      </div>
    </ThemeProvider>
  );
}

function HomePage() {
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
        console.error("检查活动资源库失败:", err);
      } finally {
        setInitializing(false);
      }
    }
    checkLibrary();
  }, []);

  if (initializing) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background text-xs text-muted-foreground font-mono">
        正在初始化 Bowerbird...
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

const routeTree = rootRoute.addChildren([indexRoute]);

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
