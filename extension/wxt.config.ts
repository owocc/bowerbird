import { defineConfig } from "wxt";
import tailwindcss from "@tailwindcss/vite";

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  vite: () => ({
    plugins: [tailwindcss()],
  }),
  manifest: {
    name: "Bowerbird Web Clipper",
    description: "Save images, screenshots, and bookmarks directly to your Bowerbird desktop asset library.",
    version: "1.0.0",
    permissions: [
      "activeTab",
      "contextMenus",
      "storage",
      "tabs",
      "scripting",
    ],
    host_permissions: [
      "http://127.0.0.1/*",
      "http://localhost/*",
      "<all_urls>",
    ],
    action: {
      default_title: "Bowerbird Web Clipper",
    },
  },
});
