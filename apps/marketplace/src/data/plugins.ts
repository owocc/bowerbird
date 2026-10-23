import type { PluginManifest, PluginKind } from "@bowerbird/plugin-sdk";
import * as React from "react";

export interface PluginVersionHistory {
  version: string;
  date: string;
  notes: string[];
}

export interface MarketplacePlugin extends PluginManifest {
  manifestUrl: string;
  downloadUrl: string;
  iconName: "file-text" | "music" | "table" | "camera" | "box" | "sparkles" | "code" | "database" | "palette" | "image" | "video" | string;
  longDescription: string;
  category: "preview" | "metadata" | string;
  subCategory?: "document" | "media" | "data" | "code" | "ai" | string;
  changelog: PluginVersionHistory[];
  featured?: boolean;
  downloadsCount: number;
  rating: number;
  assetFileName?: string;
  updatedAt?: string;
  cover_url?: string;
  screenshots?: string[];
  tagline?: string;
  /** Bundled with the desktop app; shown in the store with a special marker. */
  builtin?: boolean;
}

export const BUILTIN_MARKETPLACE_PLUGINS: MarketplacePlugin[] = [
  {
    id: "builtin.image",
    name: "Image Viewer",
    tagline: "高精度图像检视，支持触控板缩放、平移与小地图",
    version: "1.0.0",
    description:
      "High-precision image viewer with damped trackpad pinch-to-zoom, 2D pan, interactive MiniMap, and borderless inspector preview.",
    author: "Bowerbird Team",
    kind: "preview",
    category: "preview",
    subCategory: "media",
    priority: 100,
    extensions: ["png", "jpg", "jpeg", "webp", "gif", "bmp", "svg", "ico", "tiff", "tif", "avif"],
    mimePrefixes: ["image/"],
    supportsZoom: true,
    main: "index.js",
    license: "MIT",
    iconName: "image",
    featured: false,
    builtin: true,
    downloadsCount: 0,
    rating: 5,
    manifestUrl: "/api/plugins/builtin.image/manifest.json",
    downloadUrl: "/api/plugins/builtin.image/download",
    cover_url: "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?w=1200&h=800&fit=crop",
    screenshots: [
      "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?w=900&h=600&fit=crop",
      "https://images.unsplash.com/photo-1472214103451-9374bd1c798e?w=900&h=600&fit=crop",
    ],
    longDescription: `### 核心功能 (Key Features)
- **触控板阻尼缩放**: 双指捏合缩放 25%–800%，缩放后支持二维平移。
- **交互式小地图**: 放大超过 125% 时显示 MiniMap，快速定位画面。
- **无边框检视预览**: 在右侧属性栏以自适应方式呈现图像。
- **内置核心**: 随 Bowerbird 桌面端一同提供，可在偏好设置中启用或禁用。`,
    changelog: [
      {
        version: "1.0.0",
        date: "2026-10-18",
        notes: ["随应用内置的核心图像检视器", "支持触控板缩放、平移与小地图"],
      },
    ],
  },
  {
    id: "builtin.video",
    name: "Video Player",
    tagline: "多引擎视频播放，支持 HLS / MPEG-TS / DASH 与逐帧控制",
    version: "1.0.0",
    description:
      "Multi-engine video player (HLS, MPEG-TS/FLV, DASH & HTML5 Native) with frame-accurate controls and automatic cover color extraction.",
    author: "Bowerbird Team",
    kind: "preview",
    category: "preview",
    subCategory: "media",
    priority: 90,
    extensions: [
      "mp4",
      "mov",
      "qt",
      "webm",
      "mkv",
      "avi",
      "m4v",
      "flv",
      "f4v",
      "mts",
      "m2ts",
      "m3u8",
      "m3u",
      "mpd",
      "ogv",
      "ogm",
      "3gp",
      "3g2",
      "wmv",
      "asf",
      "mpg",
      "mpeg",
      "m2v",
      "vob",
      "rmvb",
      "rm",
    ],
    mimePrefixes: [
      "video/",
      "application/vnd.apple.mpegurl",
      "application/x-mpegurl",
      "application/dash+xml",
    ],
    supportsZoom: false,
    main: "index.js",
    license: "MIT",
    iconName: "video",
    featured: false,
    builtin: true,
    downloadsCount: 0,
    rating: 5,
    manifestUrl: "/api/plugins/builtin.video/manifest.json",
    downloadUrl: "/api/plugins/builtin.video/download",
    cover_url: "https://images.unsplash.com/photo-1485846234645-a62644f84728?w=1200&h=800&fit=crop",
    screenshots: [
      "https://images.unsplash.com/photo-1485846234645-a62644f84728?w=900&h=600&fit=crop",
      "https://images.unsplash.com/photo-1478720568477-152d9b164e26?w=900&h=600&fit=crop",
    ],
    longDescription: `### 核心功能 (Key Features)
- **多引擎播放**: 自动选择 HLS、MPEG-TS/FLV、DASH 或 HTML5 原生解码。
- **精确控制**: 0.25x–8x 变速、±5s 跳转、循环与全屏。
- **封面取色**: 自动提取首帧封面色彩用于资源库展示。
- **内置核心**: 随 Bowerbird 桌面端一同提供，可在偏好设置中启用或禁用。`,
    changelog: [
      {
        version: "1.0.0",
        date: "2026-10-18",
        notes: ["随应用内置的核心视频播放器", "支持 HLS / MPEG-TS / DASH 与原生播放"],
      },
    ],
  },
];

export function isBuiltinMarketplacePlugin(plugin: { id: string; builtin?: boolean }): boolean {
  return Boolean(plugin.builtin) || plugin.id.startsWith("builtin.");
}

export function mergeBuiltinPlugins<T extends { id: string; builtin?: boolean }>(
  plugins: T[]
): T[] {
  const ids = new Set(plugins.map((p) => p.id));
  const missing = BUILTIN_MARKETPLACE_PLUGINS.filter((p) => !ids.has(p.id)) as unknown as T[];
  return [
    ...missing,
    ...plugins.map((p) =>
      isBuiltinMarketplacePlugin(p) ? { ...p, builtin: true } : p
    ),
  ];
}

export const INITIAL_OFFICIAL_PLUGINS: MarketplacePlugin[] = [
  // 1. Markdown Preview (Featured Hero 1)
  {
    id: "official.markdown-preview",
    name: "Markdown Preview",
    tagline: "丰富格式 GFM 实时渲染、大纲导航与前置元数据检验",
    version: "1.0.0",
    description: "Rich Markdown preview with syntax highlighting, task lists, frontmatter inspection, and table of contents outline.",
    author: "Bowerbird Team",
    kind: "preview",
    category: "preview",
    subCategory: "document",
    priority: 50,
    extensions: ["md", "markdown", "mdown", "mkd", "mdwn", "mdt"],
    mimePrefixes: ["text/markdown", "text/x-markdown"],
    supportsZoom: false,
    main: "index.js",
    license: "MIT",
    iconName: "file-text",
    featured: true,
    downloadsCount: 1420,
    rating: 4.9,
    manifestUrl: "/api/plugins/official.markdown-preview/manifest.json",
    downloadUrl: "/api/plugins/official.markdown-preview/download",
    cover_url: "https://images.unsplash.com/photo-1455390582262-044cdead277a?w=1200&h=800&fit=crop",
    screenshots: [
      "https://images.unsplash.com/photo-1455390582262-044cdead277a?w=900&h=600&fit=crop",
      "https://images.unsplash.com/photo-1517694712202-14dd9538aa97?w=900&h=600&fit=crop",
      "https://images.unsplash.com/photo-1555066931-4365d14bab8c?w=900&h=600&fit=crop",
    ],
    longDescription: `### 核心功能 (Key Features)
- **GitHub Flavored Markdown (GFM)**: 渲染数据表格、代办任务清单、删除线、引用块与代码块语法色彩高亮。
- **YAML Frontmatter 自动解析**: 自动识别并结构化提取文档头部 Frontmatter (标题、日期、作者、标签)，在检视面板优雅呈现。
- **动态文档多级大纲 (TOC)**: 自动提取 H1-H6 多级标题树，支持点击瞬时平滑滚动定位。
- **视口平滑缩放与拖拽**: 支持鼠标滚轮与快捷键交互式视口缩放控制。
- **一键复制渲染格式与源码**: 快速动作提取干净格式化文本或原始 Markdown 代码。`,
    changelog: [
      {
        version: "1.0.0",
        date: "2026-10-18",
        notes: [
          "首发正式版，基于 @bowerbird/plugin-sdk 深度集成",
          "支持交互式视口缩放与大纲目录导航",
          "集成右侧检视器 YAML frontmatter 属性徽章",
        ],
      },
    ],
  },

  // 2. Audio Player (Featured Hero 2)
  {
    id: "official.audio-player",
    name: "Audio Player",
    tagline: "现代波形音频播放器，支持变速与 ID3 标签检视",
    version: "1.0.0",
    description: "Interactive audio player with waveform scrubber, playback rate, volume control, and ID3 metadata display.",
    author: "Bowerbird Team",
    kind: "preview",
    category: "preview",
    subCategory: "media",
    priority: 60,
    extensions: ["mp3", "wav", "ogg", "flac", "m4a", "aac", "webm"],
    mimePrefixes: ["audio/"],
    supportsZoom: false,
    main: "index.js",
    license: "MIT",
    iconName: "music",
    featured: true,
    downloadsCount: 980,
    rating: 4.8,
    manifestUrl: "/api/plugins/official.audio-player/manifest.json",
    downloadUrl: "/api/plugins/official.audio-player/download",
    cover_url: "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=1200&h=800&fit=crop",
    screenshots: [
      "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=900&h=600&fit=crop",
      "https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=900&h=600&fit=crop",
      "https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?w=900&h=600&fit=crop",
    ],
    longDescription: `### 核心功能 (Key Features)
- **多格式原生音频流**: 原生解码 MP3、WAV、FLAC、OGG、M4A、AAC 以及 WebM 音频。
- **毫秒级交互式波形条**: 实时波形拖拽定位、当前播放与剩余时间高精显示，支持空格键播放/暂停及左右箭头快进快退。
- **变速与音量均衡**: 0.5x、1x、1.25x、1.5x、2x 无损变调变速播放，静音切换与平滑音量控制。
- **右侧 ID3 元数据卡片**: 实时解析显示比特率、采样率、声道、持续时间以及音频封面。`,
    changelog: [
      {
        version: "1.0.0",
        date: "2026-10-18",
        notes: [
          "首发正式版，提供丝滑音频波形拖拽与时间显示",
          "支持多档无损变速播放与本地音量记忆",
          "完善侧边栏 ID3 详细元数据识别与解析",
        ],
      },
    ],
  },

  // 3. AI Prompt Metadata (Featured Hero 3)
  {
    id: "official.prompt-metadata",
    name: "AI Prompt Metadata",
    tagline: "全库记录并检索 Midjourney、SD 与大模型生图提示词",
    version: "1.0.0",
    description: "Extends asset metadata with a dedicated Prompt field for recording and searching AI generation prompts.",
    author: "Bowerbird Team",
    kind: "metadata",
    category: "metadata",
    subCategory: "ai",
    priority: 50,
    extensions: [],
    supportsZoom: false,
    main: "index.js",
    license: "MIT",
    iconName: "sparkles",
    featured: true,
    downloadsCount: 2310,
    rating: 4.95,
    manifestUrl: "/api/plugins/official.prompt-metadata/manifest.json",
    downloadUrl: "/api/plugins/official.prompt-metadata/download",
    cover_url: "https://images.unsplash.com/photo-1620712943543-bcc4688e7485?w=1200&h=800&fit=crop",
    screenshots: [
      "https://images.unsplash.com/photo-1620712943543-bcc4688e7485?w=900&h=600&fit=crop",
      "https://images.unsplash.com/photo-1677442136019-21780ecad995?w=900&h=600&fit=crop",
      "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=900&h=600&fit=crop",
    ],
    longDescription: `### 核心功能 (Key Features)
- **专属生图 Prompt 字段**: 为 Midjourney、Stable Diffusion、DALL-E、ComfyUI 或大模型生成的素材资产记录完整正反向提示词与生成参数。
- **一键精准剪贴板复制**: 快速提取长提示词文本，附带字符数与词数即时统计。
- **无缝嵌入检视器侧边栏**: 在 Bowerbird 右侧属性栏无缝渲染轻量优雅的折叠面板，即输即存。
- **全库索引关键字搜索**: 记录的 Prompt 将同步写入资产清单，支持在主界面通过任意词汇全局秒搜素材。`,
    changelog: [
      {
        version: "1.0.0",
        date: "2026-10-18",
        notes: [
          "首发正式版，作为模块化元数据扩展上线",
          "支持即时输入自动持久化保存与字数统计",
          "完全自适应 Dark 与 Light 双主题色彩",
        ],
      },
    ],
  },

  // 4. Table & CSV Studio
  {
    id: "official.csv-viewer",
    name: "Table & CSV Studio",
    tagline: "千万行大数据表格虚拟滚动、表头排序与分列筛选",
    version: "1.0.0",
    description: "Fast virtualized spreadsheet grid preview for CSV, TSV, and delimited tabular datasets with column sorting and filtering.",
    author: "Bowerbird Team",
    kind: "preview",
    category: "preview",
    subCategory: "data",
    priority: 55,
    extensions: ["csv", "tsv", "tab", "psv"],
    mimePrefixes: ["text/csv", "text/tab-separated-values"],
    supportsZoom: false,
    main: "index.js",
    license: "MIT",
    iconName: "table",
    featured: false,
    downloadsCount: 860,
    rating: 4.86,
    manifestUrl: "/api/plugins/official.csv-viewer/manifest.json",
    downloadUrl: "/api/plugins/official.csv-viewer/download",
    cover_url: "https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=1200&h=800&fit=crop",
    screenshots: [
      "https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=900&h=600&fit=crop",
      "https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=900&h=600&fit=crop",
    ],
    longDescription: `### 核心功能 (Key Features)
- **高性能虚拟网格**: 极速加载千万行 CSV / TSV 数据，内存开销低，滚屏丝滑不卡顿。
- **智能表头推导与排序**: 自动推导数据类型 (数值、日期、布尔、文本)，支持点击表头多级升降序排序。
- **列宽自适应与冻结首列**: 支持拖拽调整列宽，固定首列方便长表格横向对照阅读。
- **一键转写 JSON**: 提供快捷工具将选中行列快速转换为格式化 JSON 对象并复制。`,
    changelog: [
      {
        version: "1.0.0",
        date: "2026-10-18",
        notes: [
          "首发正式版，支持标准 CSV、TSV 及自定义分隔符",
          "引入轻量级虚拟网格渲染引擎",
        ],
      },
    ],
  },

  // 5. EXIF & Lens Inspector
  {
    id: "official.image-exif",
    name: "EXIF & Camera Inspector",
    tagline: "相机机型、镜头焦段、曝光参数与 GPS 地理透视",
    version: "1.0.0",
    description: "Reads comprehensive EXIF metadata including camera model, lens, aperture, shutter speed, ISO, focal length, and GPS coordinates.",
    author: "Bowerbird Community",
    kind: "metadata",
    category: "metadata",
    subCategory: "media",
    priority: 50,
    extensions: ["jpg", "jpeg", "png", "webp", "tiff", "heic", "raw", "dng", "cr2", "nef"],
    mimePrefixes: ["image/"],
    supportsZoom: false,
    main: "index.js",
    license: "MIT",
    iconName: "camera",
    featured: false,
    downloadsCount: 1540,
    rating: 4.91,
    manifestUrl: "/api/plugins/official.image-exif/manifest.json",
    downloadUrl: "/api/plugins/official.image-exif/download",
    cover_url: "https://images.unsplash.com/photo-1516035069371-29a1b244cc32?w=1200&h=800&fit=crop",
    screenshots: [
      "https://images.unsplash.com/photo-1516035069371-29a1b244cc32?w=900&h=600&fit=crop",
      "https://images.unsplash.com/photo-1507238691740-187a5b1d37b8?w=900&h=600&fit=crop",
    ],
    longDescription: `### 核心功能 (Key Features)
- **摄影三要素精细解析**: 毫秒呈现快门速度、光圈值、ISO 感光度、镜头焦距及测光模式。
- **机身与镜头规格型号**: 自动识别 Sony、Canon、Nikon、Fujifilm、Leica 等品牌机身与原厂镜头型号。
- **GPS 坐标与拍摄时间**: 解析原始经纬度坐标与卫星时间戳，支持一键在地图中定位拍摄地。
- **直方图明度参考**: 实时计算生成 RGB 与明度直方图分布图谱。`,
    changelog: [
      {
        version: "1.0.0",
        date: "2026-10-18",
        notes: [
          "首发正式版，全兼容 RAW、HEIC 与标准 JPG/PNG 格式",
          "新增拍摄地点经纬度一键复制与地图快速预览链接",
        ],
      },
    ],
  },

  // 6. Source Code QuickLook
  {
    id: "official.code-highlighter",
    name: "Source Code QuickLook",
    tagline: "50+ 编程语言高精语法色彩高亮、行号与折叠支持",
    version: "1.0.0",
    description: "Ultra-fast code syntax highlighter supporting TypeScript, Rust, Python, Go, JSON, YAML, CSS, HTML, SQL, and Shell scripts with line numbers.",
    author: "Bowerbird Team",
    kind: "preview",
    category: "preview",
    subCategory: "code",
    priority: 52,
    extensions: ["ts", "tsx", "js", "jsx", "rs", "py", "go", "json", "yaml", "yml", "toml", "sh", "sql", "html", "css", "c", "cpp"],
    mimePrefixes: ["text/", "application/json"],
    supportsZoom: false,
    main: "index.js",
    license: "MIT",
    iconName: "code",
    featured: false,
    downloadsCount: 3120,
    rating: 4.92,
    manifestUrl: "/api/plugins/official.code-highlighter/manifest.json",
    downloadUrl: "/api/plugins/official.code-highlighter/download",
    cover_url: "https://images.unsplash.com/photo-1555066931-4365d14bab8c?w=1200&h=800&fit=crop",
    screenshots: [
      "https://images.unsplash.com/photo-1555066931-4365d14bab8c?w=900&h=600&fit=crop",
      "https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?w=900&h=600&fit=crop",
    ],
    longDescription: `### 核心功能 (Key Features)
- **Monaco 级别代码高亮**: 支持 TypeScript、JavaScript、Python、Rust、Go、C++、JSON、YAML 等主流语言。
- **行号与代码块折叠**: 精致的代码行号栏、快速跳转行号与括号成对指示线。
- **一键格式化与无 BOM 读取**: 智能检测 UTF-8 与不同换行符 (CRLF/LF)，提供快速一键复制代码块。`,
    changelog: [
      {
        version: "1.0.0",
        date: "2026-10-18",
        notes: [
          "首发正式版，集成主流 50+ 语言的高效语法高亮",
          "支持浅色与深色主题的代码高亮动态跟随",
        ],
      },
    ],
  },

  // 7. SQLite Database Explorer
  {
    id: "official.sqlite-viewer",
    name: "SQLite Database Explorer",
    tagline: "无需外部客户端，直接在视口浏览表结构并执行 SQL",
    version: "1.0.0",
    description: "Inspect local SQLite databases without external tools. Browse tables, view schema DDL, filter records, and execute custom SELECT queries.",
    author: "Bowerbird Community",
    kind: "preview",
    category: "preview",
    subCategory: "data",
    priority: 50,
    extensions: ["sqlite", "db", "sqlite3"],
    supportsZoom: false,
    main: "index.js",
    license: "MIT",
    iconName: "database",
    featured: false,
    downloadsCount: 740,
    rating: 4.87,
    manifestUrl: "/api/plugins/official.sqlite-viewer/manifest.json",
    downloadUrl: "/api/plugins/official.sqlite-viewer/download",
    cover_url: "https://images.unsplash.com/photo-1558494949-ef010cbdcc31?w=1200&h=800&fit=crop",
    screenshots: [
      "https://images.unsplash.com/photo-1558494949-ef010cbdcc31?w=900&h=600&fit=crop",
      "https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=900&h=600&fit=crop",
    ],
    longDescription: `### 核心功能 (Key Features)
- **零依赖本地读取**: 纯客户端 WASM 引擎解析 SQLite 二进制数据，免装外部软件。
- **表结构与 DDL 清晰可见**: 快速列举全部数据表、视图及触发器，查看字段类型与主外键约束。
- **安全沙箱查询执行**: 支持直接在面板输入 SELECT 语句并以表格形式即时检视结果。`,
    changelog: [
      {
        version: "1.0.0",
        date: "2026-10-18",
        notes: [
          "首发正式版，内置 sql.js WASM 运行时驱动",
          "支持安全只读查询与表行数即时统计",
        ],
      },
    ],
  },

  // 8. Palette Extractor & Contrast
  {
    id: "official.color-palette",
    name: "Palette Extractor & Contrast",
    tagline: "8 色主色调提取、WCAG 无障碍对比度与色彩色盘",
    version: "1.0.0",
    description: "Extracts 8-swatch harmonious color palettes from visual assets, displays HEX/RGB/HSL codes, and analyzes foreground/background contrast ratios.",
    author: "Bowerbird Team",
    kind: "metadata",
    category: "metadata",
    subCategory: "media",
    priority: 52,
    extensions: [],
    supportsZoom: false,
    main: "index.js",
    license: "MIT",
    iconName: "palette",
    featured: false,
    downloadsCount: 1290,
    rating: 4.89,
    manifestUrl: "/api/plugins/official.color-palette/manifest.json",
    downloadUrl: "/api/plugins/official.color-palette/download",
    cover_url: "https://images.unsplash.com/photo-1541701494587-cb58502866ab?w=1200&h=800&fit=crop",
    screenshots: [
      "https://images.unsplash.com/photo-1541701494587-cb58502866ab?w=900&h=600&fit=crop",
      "https://images.unsplash.com/photo-1513542789411-b6a5d4f31634?w=900&h=600&fit=crop",
    ],
    longDescription: `### 核心功能 (Key Features)
- **K-Means 聚类主色提取**: 自动从图片提取 8 个核心色块与主色调占比。
- **多格式色值一键复制**: 鼠标悬浮查看 HEX、RGB、HSL、OKLCH 色值，点击直接复制。
- **WCAG 2.1 无障碍合规性**: 自动测试与白底、黑底的文字对比度级别 (AA/AAA)，设计更友好。`,
    changelog: [
      {
        version: "1.0.0",
        date: "2026-10-18",
        notes: [
          "首发正式版，提供 8 色主色提取与色值快速复制",
          "支持 WCAG AA/AAA 对比度评级标识",
        ],
      },
    ],
  },

  // 9. PDF Multi-Page Preview
  {
    id: "official.pdf-inspector",
    name: "PDF Multi-Page Preview",
    tagline: "高清多页 PDF 翻页浏览、大纲书签与文本选取",
    version: "1.0.0",
    description: "High-resolution PDF renderer supporting page navigation, continuous scroll, text selection, and document outline extraction.",
    author: "Bowerbird Team",
    kind: "preview",
    category: "preview",
    subCategory: "document",
    priority: 58,
    extensions: ["pdf"],
    mimePrefixes: ["application/pdf"],
    supportsZoom: true,
    main: "index.js",
    license: "MIT",
    iconName: "file-text",
    featured: false,
    downloadsCount: 1820,
    rating: 4.93,
    manifestUrl: "/api/plugins/official.pdf-inspector/manifest.json",
    downloadUrl: "/api/plugins/official.pdf-inspector/download",
    cover_url: "https://images.unsplash.com/photo-1568667256549-094345857637?w=1200&h=800&fit=crop",
    screenshots: [
      "https://images.unsplash.com/photo-1568667256549-094345857637?w=900&h=600&fit=crop",
      "https://images.unsplash.com/photo-1455390582262-044cdead277a?w=900&h=600&fit=crop",
    ],
    longDescription: `### 核心功能 (Key Features)
- **高清矢量级缩放渲染**: 保持 PDF 文字和图表纤毫毕现，支持 25% 至 400% 平滑缩放。
- **多页翻页与跳页控件**: 快速翻页、缩略图抽屉预览及按页码精准跳转。
- **书签大纲层级视图**: 自动提取 PDF 内置书签目录，一键触达章节内容。`,
    changelog: [
      {
        version: "1.0.0",
        date: "2026-10-18",
        notes: [
          "首发正式版，集成现代化 PDF.js 高清渲染核心",
          "支持书签目录导航与多页平滑缩放",
        ],
      },
    ],
  },

  // 10. 3D Model Viewport
  {
    id: "official.3d-model-viewer",
    name: "3D Model Viewport",
    tagline: "WebGL 360° 交互式 3D 模型轨道旋转、光照与线框模式",
    version: "1.0.0",
    description: "WebGL-powered interactive 3D model viewer for GLTF, GLB, OBJ, and STL files with 360-degree orbit controls, PBR materials, and wireframe mode.",
    author: "Bowerbird Community",
    kind: "preview",
    category: "preview",
    subCategory: "media",
    priority: 50,
    extensions: ["gltf", "glb", "obj", "stl"],
    supportsZoom: true,
    main: "index.js",
    license: "MIT",
    iconName: "box",
    featured: false,
    downloadsCount: 1100,
    rating: 4.94,
    manifestUrl: "/api/plugins/official.3d-model-viewer/manifest.json",
    downloadUrl: "/api/plugins/official.3d-model-viewer/download",
    cover_url: "https://images.unsplash.com/photo-1634017839464-5c339ebe3cb4?w=1200&h=800&fit=crop",
    screenshots: [
      "https://images.unsplash.com/photo-1634017839464-5c339ebe3cb4?w=900&h=600&fit=crop",
      "https://images.unsplash.com/photo-1555066931-4365d14bab8c?w=900&h=600&fit=crop",
    ],
    longDescription: `### 核心功能 (Key Features)
- **WebGL 三维轨道交互**: 鼠标拖拽 360 度自由旋转视口，双指捏合缩放与右键平移。
- **PBR 物理材质与光影**: 完整支持漫反射、粗糙度、金属度及法线贴图渲染。
- **线框模式与网格骨骼**: 支持一键切换 Wireframe 线框透视，检查三维模型拓扑结构。`,
    changelog: [
      {
        version: "1.0.0",
        date: "2026-10-18",
        notes: [
          "首发正式版，支持 GLTF、GLB、OBJ 及 STL 模型格式",
          "新增线框渲染与光照强度动态调整",
        ],
      },
    ],
  },
];

export const OFFICIAL_PLUGINS = INITIAL_OFFICIAL_PLUGINS;

export const PLUGIN_CATEGORIES_CONFIG = [
  { id: "all", name: "全部插件", enName: "All Plugins", icon: "LayoutGrid" },
  { id: "preview", name: "预览插件", enName: "Preview Plugins", icon: "AppWindow" },
  { id: "metadata", name: "元数据插件", enName: "Metadata Plugins", icon: "Sparkles" },
  { id: "document", name: "文档与文本", enName: "Documents", icon: "FileText" },
  { id: "media", name: "音视频媒体", enName: "Media & Audio", icon: "Music" },
  { id: "code", name: "开发与代码", enName: "Dev & Code", icon: "Code" },
  { id: "data", name: "数据与表格", enName: "Data & Tables", icon: "Table" },
] as const;

export function getAllPlugins(options?: { category?: string }): MarketplacePlugin[] {
  const catalog = mergeBuiltinPlugins(INITIAL_OFFICIAL_PLUGINS);
  if (!options || !options.category || options.category === "all" || options.category === "全部") {
    return catalog;
  }
  const cat = options.category.toLowerCase();
  return catalog.filter((plugin) => {
    if (plugin.category.toLowerCase() === cat) return true;
    if (plugin.kind.toLowerCase() === cat) return true;
    if (plugin.subCategory && plugin.subCategory.toLowerCase() === cat) return true;
    return false;
  });
}

export function getPluginById(id: string): MarketplacePlugin | undefined {
  return mergeBuiltinPlugins(INITIAL_OFFICIAL_PLUGINS).find((p) => p.id === id);
}

export function searchPlugins(query: string, category?: string): MarketplacePlugin[] {
  let list = getAllPlugins(category ? { category } : undefined);
  if (!query || !query.trim()) return list;

  const q = query.toLowerCase().trim();
  return list.filter((plugin) => {
    const matchesName = plugin.name.toLowerCase().includes(q);
    const matchesDesc = plugin.description.toLowerCase().includes(q);
    const matchesTagline = (plugin.tagline || "").toLowerCase().includes(q);
    const matchesAuthor = plugin.author.toLowerCase().includes(q);
    const matchesExt = plugin.extensions.some((ext) => ext.toLowerCase().includes(q));
    const matchesCategory = plugin.category.toLowerCase().includes(q);
    const matchesSub = (plugin.subCategory || "").toLowerCase().includes(q);
    return matchesName || matchesDesc || matchesTagline || matchesAuthor || matchesExt || matchesCategory || matchesSub;
  });
}

export function usePluginsCatalog(): {
  plugins: MarketplacePlugin[];
  loading: boolean;
  refresh: () => Promise<void>;
} {
  const [plugins, setPlugins] = React.useState<MarketplacePlugin[]>(
    mergeBuiltinPlugins(INITIAL_OFFICIAL_PLUGINS)
  );
  const [loading, setLoading] = React.useState<boolean>(false);

  const fetchPlugins = React.useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/plugins");
      if (res.ok) {
        const data = (await res.json()) as { plugins: MarketplacePlugin[] };
        if (Array.isArray(data.plugins) && data.plugins.length > 0) {
          setPlugins(mergeBuiltinPlugins(data.plugins));
        }
      }
    } catch {
      // Keep initial plugins fallback
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void fetchPlugins();
  }, [fetchPlugins]);

  return { plugins, loading, refresh: fetchPlugins };
}
