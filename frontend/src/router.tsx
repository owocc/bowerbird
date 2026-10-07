import {
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
  Outlet,
  createHashHistory,
} from "@tanstack/react-router";

function RootLayout() {
  return (
    <div className="min-h-screen bg-background text-foreground antialiased font-sans flex flex-col">
      <Outlet />
    </div>
  );
}

function HomePage() {
  return (
    <main className="flex-1 flex items-center justify-center p-8 select-none">
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">bowerbird</h1>
        <p className="text-sm text-muted-foreground">Ready to build.</p>
      </div>
    </main>
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
