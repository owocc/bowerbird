import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function marketplaceApiPlugin() {
  return {
    name: "marketplace-api-middleware",
    configureServer(server: any) {
      server.middlewares.use(async (req: any, res: any, next: any) => {
        const reqUrl = req.url || "";
        if (!reqUrl.startsWith("/api/plugins")) {
          return next();
        }

        const fullUrl = `http://${req.headers.host || "localhost:3000"}${reqUrl}`;
        const headers = new Headers();
        for (const [key, val] of Object.entries(req.headers)) {
          if (Array.isArray(val)) {
            val.forEach((v) => headers.append(key, v));
          } else if (val) {
            headers.set(key, val as string);
          }
        }
        let body: Uint8Array | null = null;
        if (req.method !== "GET" && req.method !== "HEAD") {
          const chunks: any[] = [];
          for await (const chunk of req) {
            chunks.push(chunk);
          }
          body = new Uint8Array(Buffer.concat(chunks));
        }

        const webRequest = new Request(fullUrl, {
          method: req.method,
          headers,
          body: body ? (body as unknown as BodyInit) : undefined,
        });

        try {
          const { handlePluginApiRequest } = await server.ssrLoadModule("./src/lib/server-api.ts");
          const webResponse = await handlePluginApiRequest(webRequest);

          res.statusCode = webResponse.status;
          webResponse.headers.forEach((val: string, key: string) => {
            res.setHeader(key, val);
          });

          const buf = Buffer.from(await webResponse.arrayBuffer());
          res.end(buf);
        } catch (err: any) {
          console.error("Vite API middleware error:", err);
          res.statusCode = 500;
          res.end(JSON.stringify({ error: err?.message || "Internal server error" }));
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
