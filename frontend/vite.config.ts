import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import wails from "@wailsio/runtime/plugins/vite";

// https://vite.dev/config/
export default defineConfig({
  server: {
    host: "127.0.0.1",
    port: Number(process.env.WAILS_VITE_PORT) || 9245,
    strictPort: true,
  },
  resolve: {
    // Workspace packages (@bowerbird/plugin-sdk, @workspace/ui) resolve to
    // TypeScript sources via tsconfig `paths`; without this, Vite falls back to
    // Node module resolution and requires built `dist` output that dev never
    // produces.
    tsconfigPaths: true,
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
  plugins: [react(), tailwindcss(), wails("./bindings")],
});
