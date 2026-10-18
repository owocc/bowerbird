import { createRouter as createTanStackRouter, type Router } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export type AppRouter = Router<typeof routeTree>;

export function getRouter(): AppRouter {
  const router = createTanStackRouter({
    routeTree,
    scrollRestoration: true,
  });
  return router;
}

declare module "@tanstack/react-router" {
  interface Register {
    router: AppRouter;
  }
}
