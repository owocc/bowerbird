import { defineConfig, loadEnv } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { cloudflare } from "@cloudflare/vite-plugin";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  Object.assign(process.env, env);

  return {
    plugins: [
      cloudflare({ viteEnvironment: { name: "ssr" } }),
      tailwindcss(),
      tanstackStart(),
      viteReact(),
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
  };
});
