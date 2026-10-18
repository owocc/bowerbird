import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const vitePath = require.resolve("vite", { paths: [path.resolve(__dirname, "../frontend")] });
const { build } = require(vitePath);
const rootDir = path.resolve(__dirname, "..");

const plugins = [
  {
    name: "official.markdown-preview",
    dir: path.resolve(rootDir, "plugins/markdown-preview"),
    entry: path.resolve(rootDir, "plugins/markdown-preview/src/index.tsx"),
  },
  {
    name: "official.audio-player",
    dir: path.resolve(rootDir, "plugins/audio-player"),
    entry: path.resolve(rootDir, "plugins/audio-player/src/index.tsx"),
  },
];

for (const plugin of plugins) {
  console.log(`Building plugin ${plugin.name}...`);
  await build({
    configFile: false,
    build: {
      lib: {
        entry: plugin.entry,
        formats: ["es"],
        fileName: () => "index.js",
      },
      outDir: plugin.dir,
      emptyOutDir: false,
      minify: false,
      rollupOptions: {
        external: ["react", "react-dom", "react/jsx-runtime"],
        output: {
          exports: "named",
        },
      },
    },
    resolve: {
      alias: {
        "@bowerbird/plugin-sdk": path.resolve(rootDir, "packages/plugin-sdk/src/index.ts"),
      },
    },
  });
  console.log(`Successfully built ${plugin.name} -> ${plugin.dir}/index.js`);
}
