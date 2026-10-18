import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function compareSemVer(v1: string, v2: string): number {
  const p1 = (v1 || "0").replace(/^v/, "").split(".").map(Number);
  const p2 = (v2 || "0").replace(/^v/, "").split(".").map(Number);
  const max = Math.max(p1.length, p2.length);
  for (let i = 0; i < max; i++) {
    const n1 = p1[i] || 0;
    const n2 = p2[i] || 0;
    if (n1 > n2) return 1;
    if (n1 < n2) return -1;
  }
  return 0;
}

function marketplaceApiPlugin() {
  return {
    name: "marketplace-api-middleware",
    configureServer(server: any) {
      server.middlewares.use("/api/plugins/check-updates", async (req: any, res: any) => {
        res.setHeader("Content-Type", "application/json");
        res.setHeader("Access-Control-Allow-Origin", "*");
        res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
        res.setHeader("Access-Control-Allow-Headers", "Content-Type");

        if (req.method === "OPTIONS") {
          res.statusCode = 204;
          res.end();
          return;
        }

        let body = "";
        for await (const chunk of req) {
          body += chunk;
        }

        let queryPlugins: Array<{ id: string; version: string }> = [];
        try {
          const parsed = JSON.parse(body || "{}");
          queryPlugins = parsed.plugins || [];
        } catch {
          queryPlugins = [];
        }

        try {
          const { OFFICIAL_PLUGINS } = await server.ssrLoadModule("./src/data/plugins.ts");
          const updates: any[] = [];
          for (const q of queryPlugins) {
            const found = (OFFICIAL_PLUGINS as any[]).find((p: any) => p.id === q.id);
            if (found) {
              const hasUpdate = compareSemVer(found.version, q.version) > 0;
              if (hasUpdate) {
                updates.push({
                  id: found.id,
                  name: found.name,
                  currentVersion: q.version,
                  latestVersion: found.version,
                  hasUpdate: true,
                  manifestUrl: found.manifestUrl,
                  downloadUrl: found.downloadUrl,
                  changelog: found.changelog?.[0]?.notes || [],
                });
              }
            }
          }
          res.statusCode = 200;
          res.end(JSON.stringify({ updates }));
        } catch (err: any) {
          res.statusCode = 500;
          res.end(JSON.stringify({ error: err?.message || "Internal error" }));
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [
    tailwindcss(),
    tanstackStart(),
    viteReact(),
    marketplaceApiPlugin(),
  ],
  resolve: {
    alias: {
      "~": path.resolve(__dirname, "./src"),
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 3000,
  },
});
