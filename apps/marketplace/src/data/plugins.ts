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
    native: "image",
    license: "MIT",
    iconName: "image",
    featured: false,
    builtin: true,
    downloadsCount: 0,
    rating: 0,
    manifestUrl: "/api/plugins/builtin.image/manifest.json",
    downloadUrl: "/api/plugins/builtin.image/download",
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
    tagline: "mygo native 视频播放：ffmpeg 解码 + GPU 纹理逐帧呈现",
    version: "2.0.0",
    native: "video",
    description:
      "Native video playback rendered by mygo/ui, with ffmpeg frame decoding, mygo audio output and native transport controls.",
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
    license: "MIT",
    iconName: "video",
    featured: false,
    builtin: true,
    downloadsCount: 0,
    rating: 0,
    manifestUrl: "/api/plugins/builtin.video/manifest.json",
    downloadUrl: "/api/plugins/builtin.video/download",
    longDescription: `### 核心功能 (Key Features)
- **mygo native 渲染**: 视频帧解码为 RGBA，由 \`ui.Video\` 直接上传 GPU 纹理，无 WebView / HTML5 video。
- **原生播放控制**: 播放/暂停、±10 秒跳转、进度拖拽定位。
- **同步音频**: 后台用 ffmpeg 提取音轨到临时 WAV，由 mygo 音频输出播放。
- **自动封面**: 资源库导入时继续使用原生首帧提取，供画廊缩略图使用。
- **内置核心**: 随 Bowerbird 桌面端一同提供，可在偏好设置中启用或禁用。`,
    changelog: [
      {
        version: "2.0.0",
        date: "2026-11-08",
        notes: [
          "移除 JS/HTML5 video 插件，改为 mygo/ui 原生视频播放",
          "ffmpeg 解码帧、mygo 音频输出、原生进度与跳转控制",
        ],
      },
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
    version: "2.0.0",
    native: "markdown",
    description: "Native GitHub-flavored Markdown preview rendered with mygo/ui, plus frontmatter and outline inspection.",
    author: "Bowerbird Team",
    kind: "preview",
    category: "preview",
    subCategory: "document",
    priority: 50,
    extensions: ["md", "markdown", "mdown", "mkd", "mdwn", "mdt"],
    mimePrefixes: ["text/markdown", "text/x-markdown"],
    supportsZoom: false,
    license: "MIT",
    iconName: "file-text",
    featured: true,
    downloadsCount: 1420,
    rating: 4.9,
    manifestUrl: "/api/plugins/official.markdown-preview/manifest.json",
    downloadUrl: "/api/plugins/official.markdown-preview/download",
    longDescription: `### 核心功能 (Key Features)
- **GitHub Flavored Markdown (GFM)**: 渲染数据表格、代办任务清单、删除线、引用块与代码块语法色彩高亮。
- **YAML Frontmatter 自动解析**: 自动识别并结构化提取文档头部 Frontmatter (标题、日期、作者、标签)，在检视面板优雅呈现。
- **动态文档多级大纲 (TOC)**: 自动提取 H1-H6 多级标题树，支持点击瞬时平滑滚动定位。
- **视口平滑缩放与拖拽**: 支持鼠标滚轮与快捷键交互式视口缩放控制。
- **一键复制渲染格式与源码**: 快速动作提取干净格式化文本或原始 Markdown 代码。`,
    changelog: [
      {
        version: "2.0.0",
        date: "2026-11-08",
        notes: [
          "重写为 mygo native 渲染：正文由 ui/markdown 绘制，无 React/WebView",
          "inspect 钩子提供 Frontmatter、大纲与字数统计",
        ],
      },
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
    version: "2.0.0",
    native: "audio",
    description: "Native audio playback with spectrum bars, scrubber and technical metadata rendered by mygo/ui.",
    author: "Bowerbird Team",
    kind: "preview",
    category: "preview",
    subCategory: "media",
    priority: 60,
    extensions: ["mp3", "wav", "ogg", "flac", "m4a", "aac", "webm"],
    mimePrefixes: ["audio/"],
    supportsZoom: false,
    license: "MIT",
    iconName: "music",
    featured: true,
    downloadsCount: 980,
    rating: 4.8,
    manifestUrl: "/api/plugins/official.audio-player/manifest.json",
    downloadUrl: "/api/plugins/official.audio-player/download",
    longDescription: `### 核心功能 (Key Features)
- **多格式原生音频流**: 原生解码 MP3、WAV、FLAC、OGG、M4A、AAC 以及 WebM 音频。
- **毫秒级交互式波形条**: 实时波形拖拽定位、当前播放与剩余时间高精显示，支持空格键播放/暂停及左右箭头快进快退。
- **变速与音量均衡**: 0.5x、1x、1.25x、1.5x、2x 无损变调变速播放，静音切换与平滑音量控制。
- **右侧 ID3 元数据卡片**: 实时解析显示比特率、采样率、声道、持续时间以及音频封面。`,
    changelog: [
      {
        version: "2.0.0",
        date: "2026-11-08",
        notes: [
          "重写为 mygo native 渲染：播放与频谱由 Go 内核绘制",
          "inspect 钩子补充时长、比特率、采样率与声道信息",
        ],
      },
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
    version: "2.0.0",
    native: "prompt",
    description: "Native AI prompt field with full-text editor, copy action and inspector statistics.",
    author: "Bowerbird Team",
    kind: "metadata",
    category: "metadata",
    subCategory: "ai",
    priority: 50,
    extensions: [],
    supportsZoom: false,
    license: "MIT",
    iconName: "sparkles",
    featured: true,
    downloadsCount: 2310,
    rating: 4.95,
    manifestUrl: "/api/plugins/official.prompt-metadata/manifest.json",
    downloadUrl: "/api/plugins/official.prompt-metadata/download",
    longDescription: `### 核心功能 (Key Features)
- **专属生图 Prompt 字段**: 为 Midjourney、Stable Diffusion、DALL-E、ComfyUI 或大模型生成的素材资产记录完整正反向提示词与生成参数。
- **限高滚动预览**: 长提示词收纳在固定高度的滚动阅读区内，右侧属性栏不再被超长文本撑爆。
- **弹窗展开全文**: 一键在独立大弹窗中查看与编辑完整提示词（Esc 或点击遮罩关闭），弹窗内同样支持复制。
- **一键精准剪贴板复制**: 标题栏常驻复制按钮，附带“已复制”反馈与降级剪贴板兜底，随时提取整段提示词。
- **无缝嵌入检视器侧边栏**: 在 Bowerbird 右侧属性栏无缝渲染轻量优雅的折叠面板，失焦即存，⌘/Ctrl + Enter 保存、Esc 取消。
- **全库索引关键字搜索**: 记录的 Prompt 将同步写入资产清单，支持在主界面通过任意词汇全局秒搜素材。`,
    changelog: [
      {
        version: "2.0.0",
        date: "2026-11-08",
        notes: [
          "重写为 mygo native 渲染：提示词编辑、复制与全文弹窗全部由宿主原生绘制",
          "inspect 钩子提供字符、词数与行数统计",
        ],
      },
      {
        version: "1.0.1",
        date: "2026-11-03",
        notes: [
          "去除属性标题左侧图标与字符数徽章，标题行更紧凑清爽",
          "提示词阅读区限制最大高度并支持滚动，新增弹窗展开全文",
          "复制按钮改为纯图标，悬停提示 / 图标切换给出复制反馈，保留剪贴板兜底",
          "内联编辑支持失焦自动保存、⌘/Ctrl + Enter 保存与 Esc 取消",
        ],
      },
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

  // 4.5 PSD Studio
  {
    id: "official.psd-preview",
    name: "PSD Studio",
    tagline: "Photoshop 文档合成预览、图层结构与色彩模式一览",
    version: "2.0.0",
    native: "psd",
    description: "Native Photoshop (.psd / .psb) preview: composite decode, zoom and layer tree rendered by mygo/ui.",
    author: "Bowerbird Team",
    kind: "preview",
    category: "preview",
    subCategory: "image",
    priority: 95,
    extensions: ["psd", "psb"],
    mimePrefixes: ["image/vnd.adobe.photoshop", "image/x-photoshop"],
    supportsZoom: true,
    license: "MIT",
    iconName: "file-image",
    featured: true,
    downloadsCount: 0,
    rating: 0,
    manifestUrl: "/api/plugins/official.psd-preview/manifest.json",
    downloadUrl: "/api/plugins/official.psd-preview/download",
    longDescription: `### 核心功能 (Key Features)
- **合成图直读**: 直接还原 Photoshop 存在文件里的合成图，所见即设计师最终拍平的样子，不需要我们复刻图层混合。
- **图层结构**: 读出分组、可见性与层数，方便判断眼前这份是不是被隐藏掉的那一版。
- **文档属性**: 像素尺寸、色彩模式（RGB / CMYK / 灰度）、位深、层数与 alpha 透明。
- **缩略图优先**: 检查器先用文件内嵌缩略图，浏览一屏 PSD 时依然跟手。
- **缩放与拖拽**: 百分比缩放、适应窗口，走宿主统一的缩放控件。`,
    changelog: [
      {
        version: "2.0.0",
        date: "2026-11-08",
        notes: [
          "重写为 mygo native 渲染：合成图、缩放与图层树全部由 Go 绘制",
          "移除浏览器端 PSD 解析器与 canvas 渲染",
        ],
      },
      {
        version: "1.0.0",
        date: "2026-11-02",
        notes: [
          "首发正式版，支持 .psd / .psb",
          "合成图视口 + 图层结构与文档属性检查器",
          "支持复制 PSD 摘要",
        ],
      },
    ],
  },

  // 4.75 Pinterest
  {
    id: "official.pinterest",
    name: "Pinterest",
    tagline: "拖入 Pin 链接即匹配解析，自动保存 /originals/ 原图",
    version: "2.2.0",
    description:
      "Sandboxed zero-build resolver for Pinterest pin URLs and pin.it short links.",
    author: "Bowerbird Team",
    kind: "resolver",
    category: "metadata",
    subCategory: "media",
    priority: 55,
    extensions: [],
    permissions: { network: ["pinterest.com", "*.pinterest.com", "pinterest.*", "*.pinterest.*", "pin.it", "*.pinimg.com", "pinterest.ru", "pinterest.co.kr"], process: [], openExternal: true },
    urlHosts: ["pinterest.com", "*.pinterest.com", "pinterest.*", "*.pinterest.*", "pin.it", "i.pinimg.com", "*.pinimg.com"],
    urlPatterns: [
      "^https?://(?:[a-z0-9-]+\\.)*pinterest\\.[a-z.]+/pin/\\d+",
      "^https?://(?:[a-z0-9-]+\\.)*pinterest\\.[a-z.]+/",
      "^https?://pin\\.it/[A-Za-z0-9]+",
      "^https?://i(?:-[a-z0-9]+)?\\.pinimg\\.com/",
    ],
    supportsZoom: false,
    main: "index.js",
    license: "MIT",
    iconName: "image",
    featured: true,
    downloadsCount: 0,
    rating: 0,
    manifestUrl: "/api/plugins/official.pinterest/manifest.json",
    downloadUrl: "/api/plugins/official.pinterest/download",
    longDescription: `### 核心功能 (Key Features)
- **Pin 链接导入**: 支持各地区 Pinterest 域名以及 pin.it 短链接，粘贴后直接保存对应图片。
- **原图还原**: 自动解析 Pin 页面，优先下载 \`i.pinimg.com/originals/...\`，原图不存在时才回退最大可用尺寸。
- **保留来源页**: 素材的 source URL 仍然是 Pin 页面，方便回溯原收藏。
- **检视器快捷操作**: 当素材来源 URL 是 Pin 链接时，侧边栏提供一键 **Save image**。
- **右键菜单**: 在画布空白处右键，从插件动作中选择 **Save Pinterest Pin…** 即可粘贴链接保存。`,
    changelog: [
      {
        version: "2.2.0",
        date: "2026-11-08",
        notes: [
          "新增 urlHosts / urlPatterns 声明，支持拖入 URL 自动匹配解析",
          "宿主建立域名索引与优先级队列，首个返回候选的插件立即生效",
        ],
      },
      {
        version: "2.1.0",
        date: "2026-11-08",
        notes: [
          "迁移到免构建 plugin.json + index.js 原生沙箱格式",
          "保留 resolveUrl、inspect 与右键动作钩子",
        ],
      },
      {
        version: "1.0.0",
        date: "2026-11-07",
        notes: [
          "首发正式版",
          "支持 Pin 页面解析为 /originals/ 原图并导入资料库",
          "支持 pin.it 短链接与 i.pinimg.com 直链",
        ],
      },
    ],
  },

  // 5. EXIF & Lens Inspector

  // 6. Source Code QuickLook

  // 7. SQLite Database Explorer

  // 8. Palette Extractor & Contrast

  // 9. PDF Multi-Page Preview

  // 10. 3D Model Viewport
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
