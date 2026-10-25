import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import Icons from "unplugin-icons/vite";

// https://vite.dev/config/
export default defineConfig({
  server: {
    host: "127.0.0.1",
    port: Number(process.env.MYGO_VITE_PORT) || 9245,
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
  plugins: [
    react(),
    tailwindcss(),
    // Icons: `import Icon from "~icons/ri/play-line"` compiles to an inline
    // React SVG component (tree-shakeable, no icon font / sprite payload).
    Icons({ compiler: "jsx", jsx: "react" }),
  ],
});
