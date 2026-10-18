import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const req = createRequire(import.meta.url);
const vitePath = req.resolve("vite", { paths: [path.resolve(__dirname, "../frontend")] });
const { build } = req(vitePath);
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
  {
    name: "official.prompt-metadata",
    dir: path.resolve(rootDir, "plugins/prompt-metadata"),
    entry: path.resolve(rootDir, "plugins/prompt-metadata/src/index.tsx"),
  },
];

async function run() {
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

  // Also copy to web/public/plugins-dist for marketplace hosting
  const webDistDir = path.resolve(rootDir, `web/public/plugins-dist/${plugin.name}`);
  fs.mkdirSync(webDistDir, { recursive: true });
  fs.copyFileSync(path.resolve(plugin.dir, "index.js"), path.resolve(webDistDir, "index.js"));
  fs.copyFileSync(path.resolve(plugin.dir, "manifest.json"), path.resolve(webDistDir, "manifest.json"));
  console.log(`Synced to web/public/plugins-dist/${plugin.name}`);
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
