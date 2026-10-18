import handler from "@tanstack/react-start/server-entry";
import { handlePluginApiRequest } from "./lib/server-api";

export default {
  async fetch(request: Request, env: any, ctx: any) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/plugins")) {
      return handlePluginApiRequest(request, env || process.env);
    }
    return (handler as any).fetch(request, env, ctx);
  },
};
