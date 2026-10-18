import path from "node:path";
import fs from "node:fs";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const req = createRequire(import.meta.url);
const vitePath = req.resolve("vite", { paths: [path.resolve(rootDir, "frontend")] });
const { build } = req(vitePath);

// Pure Node.js standard PKZIP builder
function crc32(buf) {
  let table = crc32.table;
  if (!table) {
    table = crc32.table = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[i] = c;
    }
  }
  let crc = 0 ^ -1;
  for (let i = 0; i < buf.length; i++) {
    crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xff];
  }
  return (crc ^ -1) >>> 0;
}

function createZipBuffer(entries) {
  const localHeaders = [];
  const centralHeaders = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBuf = Buffer.from(entry.name, "utf8");
    const rawData = entry.data;
    const uncompressedSize = rawData.length;
    const checksum = crc32(rawData);
    const compressedData = zlib.deflateRawSync(rawData);
    const compressedSize = compressedData.length;

    // Local Header
    const localHeader = Buffer.alloc(30 + nameBuf.length);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0x0800, 6);
    localHeader.writeUInt16LE(8, 8);
    localHeader.writeUInt16LE(0, 10);
    localHeader.writeUInt16LE(0, 12);
    localHeader.writeUInt32LE(checksum, 14);
    localHeader.writeUInt32LE(compressedSize, 18);
    localHeader.writeUInt32LE(uncompressedSize, 22);
    localHeader.writeUInt16LE(nameBuf.length, 26);
    localHeader.writeUInt16LE(0, 28);
    nameBuf.copy(localHeader, 30);

    // Central Directory Header
    const centralHeader = Buffer.alloc(46 + nameBuf.length);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0x0800, 8);
    centralHeader.writeUInt16LE(8, 10);
    centralHeader.writeUInt16LE(0, 12);
    centralHeader.writeUInt16LE(0, 14);
    centralHeader.writeUInt32LE(checksum, 16);
    centralHeader.writeUInt32LE(compressedSize, 20);
    centralHeader.writeUInt32LE(uncompressedSize, 24);
    centralHeader.writeUInt16LE(nameBuf.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42);
    nameBuf.copy(centralHeader, 46);

    localHeaders.push(localHeader, compressedData);
    centralHeaders.push(centralHeader);

    offset += localHeader.length + compressedData.length;
  }

  const centralDirOffset = offset;
  let centralDirSize = 0;
  for (const h of centralHeaders) centralDirSize += h.length;

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralDirSize, 12);
  eocd.writeUInt32LE(centralDirOffset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...localHeaders, ...centralHeaders, eocd]);
}

function discoverPlugins(pluginsRoot) {
  if (!fs.existsSync(pluginsRoot)) return [];
  const entries = fs.readdirSync(pluginsRoot, { withFileTypes: true });
  const plugins = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const pluginDir = path.resolve(pluginsRoot, entry.name);
    const manifestPath = path.resolve(pluginDir, "manifest.json");
    if (!fs.existsSync(manifestPath)) continue;

    let entryFile = path.resolve(pluginDir, "src/index.tsx");
    if (!fs.existsSync(entryFile)) {
      entryFile = path.resolve(pluginDir, "src/index.ts");
    }
    if (!fs.existsSync(entryFile)) continue;

    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    plugins.push({
      id: manifest.id,
      name: manifest.name,
      version: manifest.version,
      dir: pluginDir,
      entry: entryFile,
      manifestPath,
      manifest,
    });
  }

  return plugins;
}

async function run() {
  const pluginsRoot = path.resolve(rootDir, "plugins");
  const distPluginsRoot = path.resolve(rootDir, "dist/plugins");
  const releasesDir = path.resolve(distPluginsRoot, "releases");

  fs.mkdirSync(releasesDir, { recursive: true });

  const discovered = discoverPlugins(pluginsRoot);
  console.log(`Discovered ${discovered.length} plugins in ${pluginsRoot}`);

  const registry = [];

  for (const plugin of discovered) {
    const pluginOutDir = path.resolve(distPluginsRoot, plugin.id);
    fs.mkdirSync(pluginOutDir, { recursive: true });

    console.log(`Building plugin ${plugin.id} (v${plugin.version})...`);
    await build({
      configFile: false,
      build: {
        lib: {
          entry: plugin.entry,
          formats: ["es"],
          fileName: () => "index.js",
        },
        outDir: pluginOutDir,
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

    // Copy manifest.json to plugin outDir
    const destManifestPath = path.resolve(pluginOutDir, "manifest.json");
    fs.copyFileSync(plugin.manifestPath, destManifestPath);

    // Copy style file if declared
    if (plugin.manifest.style && fs.existsSync(path.resolve(plugin.dir, plugin.manifest.style))) {
      fs.copyFileSync(
        path.resolve(plugin.dir, plugin.manifest.style),
        path.resolve(pluginOutDir, plugin.manifest.style)
      );
    }

    // Package into .zip release artifact
    const zipEntries = [
      {
        name: "manifest.json",
        data: fs.readFileSync(destManifestPath),
      },
      {
        name: "index.js",
        data: fs.readFileSync(path.resolve(pluginOutDir, "index.js")),
      },
    ];

    if (plugin.manifest.style && fs.existsSync(path.resolve(pluginOutDir, plugin.manifest.style))) {
      zipEntries.push({
        name: plugin.manifest.style,
        data: fs.readFileSync(path.resolve(pluginOutDir, plugin.manifest.style)),
      });
    }

    const zipFileName = `${plugin.id}-v${plugin.version}.zip`;
    const zipFilePath = path.resolve(releasesDir, zipFileName);
    const zipBuffer = createZipBuffer(zipEntries);
    fs.writeFileSync(zipFilePath, zipBuffer);

    console.log(`  -> Bundled ${pluginOutDir}/index.js`);
    console.log(`  -> Packaged ${zipFilePath} (${zipBuffer.length} bytes)`);

    // Prepare registry entry
    registry.push({
      ...plugin.manifest,
      assetFileName: zipFileName,
      manifestUrl: `/api/plugins/${plugin.id}/manifest.json`,
      downloadUrl: `/api/plugins/${plugin.id}/download`,
      updatedAt: new Date().toISOString(),
    });
  }

  // Write index.min.json & registry.json for repo distribution
  const indexMinPath = path.resolve(distPluginsRoot, "index.min.json");
  const registryData = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    plugins: registry,
  };
  fs.writeFileSync(indexMinPath, JSON.stringify(registryData));
  fs.writeFileSync(path.resolve(distPluginsRoot, "registry.json"), JSON.stringify(registryData, null, 2));

  console.log(`Generated plugin index at ${indexMinPath} with ${registry.length} plugins.`);
}

run().catch((err) => {
  console.error("Plugin build failed:", err);
  process.exit(1);
});
