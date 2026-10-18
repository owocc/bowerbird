import type { AppItem } from "../lib/types";

export const APPS_DATA: AppItem[] = [
  // 1. Hero 1 / Featured: Linear
  {
    id: "linear",
    name: "Linear",
    tagline: "现代高效的项目管理与敏捷跟踪工具",
    url: "https://linear.app",
    category: "web",
    categories: ["WEB", "工具", "效率"],
    developer: "Linear Orbit, Inc.",
    icon_url: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=128&h=128&fit=crop&crop=faces",
    cover_url: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=1200&h=800&fit=crop",
    preview_features: [
      "键盘优先的高性能工作流与无缝键盘快捷键",
      "周期、路线图、项目与子任务双向关联",
      "Git、GitHub、GitLab 及 CI/CD 自动化即时集成",
    ],
    description:
      "Linear 是专为高绩效软件团队打造的现代项目管理系统。它将极速性能、优雅交互与工程最佳实践相结合，消除协作阻碍，助力团队以闪电般速度交付高质量软件。",
    rating: 4.9,
    rating_count: "12.8k",
    age_rating: "4+",
    price: "免费 · 基础版",
    size: "Web App",
    compatibility: "现代桌面与移动端 Web 浏览器",
    languages: "英语",
    version: "2026.10",
    version_date: "2026年10月",
    release_notes: "新增跨团队路线图视图，优化实时协作同步引擎与离线操作持久化队列。",
    featured: true,
    trending: true,
    screenshots: [
      "https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=900&h=600&fit=crop",
      "https://images.unsplash.com/photo-1507238691740-187a5b1d37b8?w=900&h=600&fit=crop",
      "https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=900&h=600&fit=crop",
    ],
    device_screenshots: {
      pc: "https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=900&h=600&fit=crop",
      tablet: "https://images.unsplash.com/photo-1507238691740-187a5b1d37b8?w=900&h=600&fit=crop",
      mobile: "https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=900&h=600&fit=crop",
    },
  },

  // 2. Hero 2 / Featured: Raycast
  {
    id: "raycast",
    name: "Raycast",
    tagline: "极速可扩展的下一代生产力桌面启动器",
    url: "https://raycast.com",
    category: "tools",
    categories: ["工具", "效率", "开发"],
    developer: "Raycast Technologies",
    icon_url: "https://images.unsplash.com/photo-1634017839464-5c339ebe3cb4?w=128&h=128&fit=crop",
    cover_url: "https://images.unsplash.com/photo-1634017839464-5c339ebe3cb4?w=1200&h=800&fit=crop",
    preview_features: [
      "毫秒级指令响应与智能模糊搜索",
      "超过 1,000+ 开源社区插件一键安装扩展",
      "内建 AI 智能对话、文本转写与上下文代码重构",
    ],
    description:
      "Raycast 彻底革新了工作站的使用体验。通过按键即可完成窗口管理、剪贴板历史搜索、脚本运行、Git 管理以及与 Figma、GitHub 等工具深度联动。",
    rating: 4.95,
    rating_count: "24.5k",
    age_rating: "4+",
    price: "免费 · 支持 Pro",
    size: "Web / Desktop",
    compatibility: "macOS / Windows / Web 扩展",
    languages: "英语",
    version: "1.82.0",
    version_date: "2026年10月",
    release_notes: "全面升级 Raycast Extensions API v2，增强多模态窗口渲染支持。",
    featured: true,
    trending: true,
    screenshots: [
      "https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?w=900&h=600&fit=crop",
      "https://images.unsplash.com/photo-1555066931-4365d14bab8c?w=900&h=600&fit=crop",
      "https://images.unsplash.com/photo-1517694712202-14dd9538aa97?w=900&h=600&fit=crop",
    ],
    device_screenshots: {
      pc: "https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?w=900&h=600&fit=crop",
      tablet: "https://images.unsplash.com/photo-1555066931-4365d14bab8c?w=900&h=600&fit=crop",
      mobile: "https://images.unsplash.com/photo-1517694712202-14dd9538aa97?w=900&h=600&fit=crop",
    },
  },

  // 3. Hero 3 / Featured: Claude
  {
    id: "claude",
    name: "Claude",
    tagline: "Anthropic 打造的下一代安全前沿智能助手",
    url: "https://claude.ai",
    category: "ai",
    categories: ["AI", "智能", "科研"],
    developer: "Anthropic PBC",
    icon_url: "https://images.unsplash.com/photo-1620712943543-bcc4688e7485?w=128&h=128&fit=crop",
    cover_url: "https://images.unsplash.com/photo-1620712943543-bcc4688e7485?w=1200&h=800&fit=crop",
    preview_features: [
      "业界领先的 200K+ 超长上下文理解与深度推理",
      "Artifacts 交互沙箱实时运行 React、SVG 与图表",
      "卓越的代码编写、长文撰写与学术科研论文研判",
    ],
    description:
      "Claude 是由 Anthropic 开发的尖端人工智能系统，在编码、创意写作、多语言逻辑推理及长文分析方面表现出众，注重可靠性与可解释性。",
    rating: 4.92,
    rating_count: "38.6k",
    age_rating: "12+",
    price: "免费 · 支持 Pro",
    size: "Web App",
    compatibility: "所有现代浏览器 / iOS / Android",
    languages: "简体中文、英语等多语言",
    version: "3.5 Sonnet",
    version_date: "2026年10月",
    release_notes: "上线交互式 Artifacts 多端视窗同步，增强长代码项目整体结构感知。",
    featured: true,
    trending: true,
    screenshots: [
      "https://images.unsplash.com/photo-1677442136019-21780ecad995?w=900&h=600&fit=crop",
      "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=900&h=600&fit=crop",
      "https://images.unsplash.com/photo-1620712943543-bcc4688e7485?w=900&h=600&fit=crop",
    ],
    device_screenshots: {
      pc: "https://images.unsplash.com/photo-1677442136019-21780ecad995?w=900&h=600&fit=crop",
      tablet: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=900&h=600&fit=crop",
      mobile: "https://images.unsplash.com/photo-1620712943543-bcc4688e7485?w=900&h=600&fit=crop",
    },
  },

  // 4. Web: Figma
  {
    id: "figma",
    name: "Figma",
    tagline: "全团队协作的界面设计与原型利器",
    url: "https://figma.com",
    category: "web",
    categories: ["WEB", "设计", "协作"],
    developer: "Figma, Inc.",
    icon_url: "https://images.unsplash.com/photo-1541701494587-cb58502866ab?w=128&h=128&fit=crop",
    cover_url: "https://images.unsplash.com/photo-1541701494587-cb58502866ab?w=1200&h=800&fit=crop",
    preview_features: [
      "原生 WebGL 渲染引擎，万级图层秒开丝滑缩放",
      "设计系统与组件变体状态精准驱动",
      "FigJam 协作白板与 Dev Mode 研发模式",
    ],
    description:
      "Figma 是全球设计师与产品团队信赖的协作设计平台。从早期构思、高保真原型交互到最终切图与代码交付，全流程云端同步协作。",
    rating: 4.88,
    rating_count: "45.1k",
    age_rating: "4+",
    price: "免费 · 支持专业版",
    size: "Web App",
    compatibility: "现代桌面浏览器 / iPad / 桌面客户端",
    languages: "简体中文、英语、日语",
    version: "124.0",
    version_date: "2026年9月",
    release_notes: "Dev Mode 增加全新 CSS 现代语法提取与自动间距感知。",
    featured: false,
    trending: true,
    screenshots: [
      "https://images.unsplash.com/photo-1581291518857-4e27b48ff24e?w=900&h=600&fit=crop",
      "https://images.unsplash.com/photo-1507238691740-187a5b1d37b8?w=900&h=600&fit=crop",
    ],
  },

  // 5. Web: Notion
  {
    id: "notion",
    name: "Notion",
    tagline: "集成笔记、文档、知识库与项目管理的通用工作空间",
    url: "https://notion.so",
    category: "web",
    categories: ["WEB", "效率", "知识库"],
    developer: "Notion Labs, Inc.",
    icon_url: "https://images.unsplash.com/photo-1517842645767-c639042777db?w=128&h=128&fit=crop",
    cover_url: "https://images.unsplash.com/photo-1517842645767-c639042777db?w=1200&h=800&fit=crop",
    preview_features: [
      "高度自由的块级 (Block) 排版与拖拽组件",
      "多维数据表格 (看板、时间线、日历、画廊)",
      "内置 Notion AI 智能摘要、重构与内容生成",
    ],
    description:
      "Notion 将个人笔记、团队 Wiki、敏捷看板与数据库融为一体，支持千变万化的自定义布局与自动化工作流，是现代数字工作者的首选数字花园。",
    rating: 4.85,
    rating_count: "52.3k",
    age_rating: "4+",
    price: "免费 · 支持团队版",
    size: "Web App",
    compatibility: "Web / iOS / Android / macOS / Windows",
    languages: "简体中文、英语等多语言",
    version: "2.44",
    version_date: "2026年10月",
    release_notes: "支持全新多维表格公式属性 2.0 与双向关系图谱渲染。",
    featured: false,
    trending: true,
    screenshots: [
      "https://images.unsplash.com/photo-1499750310107-5fef28a66643?w=900&h=600&fit=crop",
      "https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=900&h=600&fit=crop",
    ],
  },

  // 6. Web: Excalidraw
  {
    id: "excalidraw",
    name: "Excalidraw",
    tagline: "极简手绘质感虚拟白板与架构图绘制工具",
    url: "https://excalidraw.com",
    category: "web",
    categories: ["WEB", "工具", "图形"],
    developer: "Excalidraw Open Source Community",
    icon_url: "https://images.unsplash.com/photo-1513542789411-b6a5d4f31634?w=128&h=128&fit=crop",
    cover_url: "https://images.unsplash.com/photo-1513542789411-b6a5d4f31634?w=1200&h=800&fit=crop",
    preview_features: [
      "经典手绘线描质感与无限平铺画布",
      "端到端端加密的实时多玩家协作协同",
      "一键导出高清 PNG、SVG 与免安装即开即用",
    ],
    description:
      "Excalidraw 是一款轻量开源的虚拟白板工具，具备令人心动的手绘风格。无论是快速绘制系统架构草图、流程图还是思维碰撞，均可随心所欲挥洒创意。",
    rating: 4.93,
    rating_count: "18.7k",
    age_rating: "4+",
    price: "免费 · 开源",
    size: "Web App",
    compatibility: "现代桌面与平板浏览器",
    languages: "简体中文、英语等多语言",
    version: "0.18.0",
    version_date: "2026年10月",
    release_notes: "支持画板贴纸图库在线搜索，新增 Mermaid 语法一键转手绘图。",
    featured: false,
    trending: true,
    screenshots: [
      "https://images.unsplash.com/photo-1513542789411-b6a5d4f31634?w=900&h=600&fit=crop",
      "https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=900&h=600&fit=crop",
    ],
  },

  // 7. Web: Photopea
  {
    id: "photopea",
    name: "Photopea",
    tagline: "浏览器内的全功能专业级 PSD / 图像编辑器",
    url: "https://photopea.com",
    category: "web",
    categories: ["WEB", "设计", "工具"],
    developer: "Ivan Kutskir",
    icon_url: "https://images.unsplash.com/photo-1579783902614-a3fb3927b675?w=128&h=128&fit=crop",
    cover_url: "https://images.unsplash.com/photo-1579783902614-a3fb3927b675?w=1200&h=800&fit=crop",
    preview_features: [
      "100% 浏览器本地计算，原生支持 PSD、AI、Sketch、XD 格式",
      "支持图层蒙版、滤镜通道、钢笔矢量路径与魔棒智能抠图",
      "免安装无需注册，即开即用保护本地隐私",
    ],
    description:
      "Photopea 带来了接近桌面专业图像处理软件的强大功能。完全运行于客户端沙箱内，无需上传服务器，提供完整的图层管理与调色工具集。",
    rating: 4.87,
    rating_count: "28.4k",
    age_rating: "4+",
    price: "免费 · 广告支持",
    size: "Web App",
    compatibility: "桌面浏览器 (Chrome, Edge, Safari, Firefox)",
    languages: "简体中文、英语等多语言",
    version: "5.4",
    version_date: "2026年9月",
    release_notes: "增强 RAW 格式解析速度与智能补全笔刷算法。",
    featured: false,
    trending: false,
    screenshots: [
      "https://images.unsplash.com/photo-1579783902614-a3fb3927b675?w=900&h=600&fit=crop",
      "https://images.unsplash.com/photo-1541701494587-cb58502866ab?w=900&h=600&fit=crop",
    ],
  },

  // 8. Web: v0.dev
  {
    id: "v0-dev",
    name: "v0.dev",
    tagline: "由自然语言智能生成 React + Tailwind 前端界面",
    url: "https://v0.dev",
    category: "web",
    categories: ["WEB", "AI", "开发"],
    developer: "Vercel, Inc.",
    icon_url: "https://images.unsplash.com/photo-1555066931-4365d14bab8c?w=128&h=128&fit=crop",
    cover_url: "https://images.unsplash.com/photo-1555066931-4365d14bab8c?w=1200&h=800&fit=crop",
    preview_features: [
      "输入提示词秒级生成 shadcn/ui 与 Tailwind CSS 代码",
      "可视化多视口实时响应式预览与交互调试",
      "一键复制代码或通过 npx 命令同步到现有项目工程",
    ],
    description:
      "v0.dev 是 Vercel 打造的生成式 UI 革命工具。只需向 AI 描述页面构想，系统即可生成语义规范、开箱即用的前端组件代码。",
    rating: 4.84,
    rating_count: "15.9k",
    age_rating: "4+",
    price: "免费 · 支持积分充值",
    size: "Web App",
    compatibility: "现代桌面浏览器",
    languages: "英语",
    version: "2.1",
    version_date: "2026年10月",
    release_notes: "升级前端代码大模型基座，提升复杂交互与状态管理的稳定性。",
    featured: false,
    trending: true,
    screenshots: [
      "https://images.unsplash.com/photo-1555066931-4365d14bab8c?w=900&h=600&fit=crop",
      "https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?w=900&h=600&fit=crop",
    ],
  },

  // 9. Tools: Markdown Preview (Official Bowerbird)
  {
    id: "markdown-preview",
    name: "Markdown Preview",
    tagline: "丰富格式 GFM 实时渲染、大纲导航与前置元数据检验",
    url: "https://bowerbird.app",
    category: "tools",
    categories: ["工具", "文档", "效率"],
    developer: "Bowerbird Team",
    icon_url: "https://images.unsplash.com/photo-1455390582262-044cdead277a?w=128&h=128&fit=crop",
    cover_url: "https://images.unsplash.com/photo-1455390582262-044cdead277a?w=1200&h=800&fit=crop",
    preview_features: [
      "GitHub Flavored Markdown 代码块高亮与任务清单支持",
      "自动提取 YAML Frontmatter 元数据展示标签",
      "动态 H1-H6 多级大纲快速跳转与视口平滑缩放",
    ],
    description:
      "Markdown Preview 专为 Markdown 创作者与开发者量身打造，支持一键切换渲染与源码视图，并可无缝嵌入 Bowerbird 本地工作流。",
    rating: 4.9,
    rating_count: "3.4k",
    age_rating: "4+",
    price: "免费 · 官方插件",
    size: "Web / Plugin",
    compatibility: "Bowerbird Desktop & 浏览器端",
    languages: "简体中文、英语",
    version: "1.0.0",
    version_date: "2026年10月",
    release_notes: "首发官方正式版，提供大纲跳转与 YAML frontmatter 检视器支持。",
    featured: false,
    trending: true,
    screenshots: [
      "https://images.unsplash.com/photo-1455390582262-044cdead277a?w=900&h=600&fit=crop",
      "https://images.unsplash.com/photo-1517694712202-14dd9538aa97?w=900&h=600&fit=crop",
    ],
  },

  // 10. Tools: CyberChef
  {
    id: "cyberchef",
    name: "CyberChef",
    tagline: "网络瑞士军刀：加解密、编解码与数据格式转换",
    url: "https://gchq.github.io/CyberChef/",
    category: "tools",
    categories: ["工具", "安全", "开发"],
    developer: "GCHQ (Government Communications Headquarters)",
    icon_url: "https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?w=128&h=128&fit=crop",
    cover_url: "https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?w=1200&h=800&fit=crop",
    preview_features: [
      "超过 300+ 种数据处理操作任意组合流水线",
      "Base64、Hex、URL、AES、RSA、DES、哈希校验全覆盖",
      "完全在浏览器本地离线运行，严密保障数据安全性",
    ],
    description:
      "CyberChef 是一款简单直观的网络应用，用于在 Web 浏览器中执行各类网络分析与数据运算，包括 XOR、Base64、正则表达式提取以及网络流量解码。",
    rating: 4.94,
    rating_count: "19.3k",
    age_rating: "4+",
    price: "免费 · 开源",
    size: "Web App",
    compatibility: "现代 Web 浏览器",
    languages: "英语",
    version: "10.19.0",
    version_date: "2026年9月",
    release_notes: "新增现代密码学哈希函数与大型输入流分块处理支持。",
    featured: false,
    trending: true,
    screenshots: [
      "https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?w=900&h=600&fit=crop",
      "https://images.unsplash.com/photo-1555066931-4365d14bab8c?w=900&h=600&fit=crop",
    ],
  },

  // 11. Tools: Audio Player (Official Bowerbird)
  {
    id: "audio-player",
    name: "Audio Player",
    tagline: "现代波形音频播放器，支持变速与 ID3 标签检视",
    url: "https://bowerbird.app",
    category: "tools",
    categories: ["工具", "音频", "多媒体"],
    developer: "Bowerbird Team",
    icon_url: "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=128&h=128&fit=crop",
    cover_url: "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=1200&h=800&fit=crop",
    preview_features: [
      "交互式音频频谱与毫秒级精准波形拖拽定位",
      "ID3 音频元数据解析 (歌名、歌手、唱片封面)",
      "0.5x 至 2.5x 无损变速播放与声道平衡调节",
    ],
    description:
      "Audio Player 专为音乐创作者、播客制作者与音效设计师设计，直观呈现音频波形细节，并支持一键检测采样率与编码格式。",
    rating: 4.88,
    rating_count: "2.1k",
    age_rating: "4+",
    price: "免费 · 官方插件",
    size: "Web / Plugin",
    compatibility: "Bowerbird Desktop & 浏览器端",
    languages: "简体中文、英语",
    version: "1.0.0",
    version_date: "2026年10月",
    release_notes: "首发官方版本，支持 MP3、WAV、OGG、FLAC、M4A 格式解析。",
    featured: false,
    trending: false,
    screenshots: [
      "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=900&h=600&fit=crop",
      "https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=900&h=600&fit=crop",
    ],
  },

  // 12. Tools: JSON Studio
  {
    id: "json-studio",
    name: "JSON Studio",
    tagline: "现代可视化 JSON 树形格式化、差异对比与模式校验",
    url: "https://jsonformatter.org",
    category: "tools",
    categories: ["工具", "开发", "数据"],
    developer: "DataTools Lab",
    icon_url: "https://images.unsplash.com/photo-1558494949-ef010cbdcc31?w=128&h=128&fit=crop",
    cover_url: "https://images.unsplash.com/photo-1558494949-ef010cbdcc31?w=1200&h=800&fit=crop",
    preview_features: [
      "千万行超大 JSON 虚拟滚动与语法实时修复校验",
      "双面板 Visual Diff 差异高亮与 JSONPath 表达式查询",
      "一键生成 TypeScript 类型接口与 Go / Rust 结构体",
    ],
    description:
      "JSON Studio 是全栈工程师处理 API 响应与配置文件的强力帮手。集格式化、压缩、错误定位、架构校验与类型推导于一身。",
    rating: 4.91,
    rating_count: "14.2k",
    age_rating: "4+",
    price: "免费 · 开源",
    size: "Web App",
    compatibility: "所有现代浏览器",
    languages: "简体中文、英语",
    version: "3.2.0",
    version_date: "2026年9月",
    release_notes: "新增 JSON Schema 验证与离线模式本地缓存。",
    featured: false,
    trending: true,
    screenshots: [
      "https://images.unsplash.com/photo-1558494949-ef010cbdcc31?w=900&h=600&fit=crop",
      "https://images.unsplash.com/photo-1517694712202-14dd9538aa97?w=900&h=600&fit=crop",
    ],
  },

  // 13. Tools: Regex101
  {
    id: "regex101",
    name: "Regex101",
    tagline: "在线正则表达式实时调试、详细解释与基准测试",
    url: "https://regex101.com",
    category: "tools",
    categories: ["工具", "开发", "学习"],
    developer: "Firas Dib",
    icon_url: "https://images.unsplash.com/photo-1507238691740-187a5b1d37b8?w=128&h=128&fit=crop",
    cover_url: "https://images.unsplash.com/photo-1507238691740-187a5b1d37b8?w=1200&h=800&fit=crop",
    preview_features: [
      "实时色彩高亮与捕获组 (Capture Groups) 索引分析",
      "支持 PCRE2、JavaScript、Python、Golang 等多正则引擎",
      "逐字符原理拆解与灾难性回溯 (Catastrophic Backtracking) 诊断",
    ],
    description:
      "Regex101 是全球工程师学习与编写正则表达式的终极助手。提供步进解释、匹配结果统计以及社区模式库分享能力。",
    rating: 4.96,
    rating_count: "33.7k",
    age_rating: "4+",
    price: "免费 · 支持赞助",
    size: "Web App",
    compatibility: "现代桌面与移动端浏览器",
    languages: "英语、德语",
    version: "2.8",
    version_date: "2026年8月",
    release_notes: "升级至 PCRE 10.43 引擎并改进回溯追踪诊断器性能。",
    featured: false,
    trending: false,
    screenshots: [
      "https://images.unsplash.com/photo-1507238691740-187a5b1d37b8?w=900&h=600&fit=crop",
      "https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?w=900&h=600&fit=crop",
    ],
  },

  // 14. AI: ChatGPT
  {
    id: "chatgpt",
    name: "ChatGPT",
    tagline: "OpenAI 打造的领先对话式通用智能引擎",
    url: "https://chatgpt.com",
    category: "ai",
    categories: ["AI", "智能", "助手"],
    developer: "OpenAI, Inc.",
    icon_url: "https://images.unsplash.com/photo-1677442136019-21780ecad995?w=128&h=128&fit=crop",
    cover_url: "https://images.unsplash.com/photo-1677442136019-21780ecad995?w=1200&h=800&fit=crop",
    preview_features: [
      "GPT-4o 多模态实时语音对话与视觉图文理解",
      "代码解释器 (Advanced Data Analysis) 在线运行 Python",
      "自定义 GPTs 应用生态与企业知识库接入",
    ],
    description:
      "ChatGPT 驱动了全球人工智能应用浪潮。无论是日常问答、长篇构思、复杂算法推演还是图像生成，均能提供自然连贯的解答。",
    rating: 4.89,
    rating_count: "89.4k",
    age_rating: "12+",
    price: "免费 · 支持 Plus",
    size: "Web App",
    compatibility: "Web / iOS / Android / macOS / Windows",
    languages: "简体中文、英语等多语言",
    version: "GPT-4o",
    version_date: "2026年10月",
    release_notes: "改进高级语音模式的自然语气流与情感辨识能力。",
    featured: false,
    trending: true,
    screenshots: [
      "https://images.unsplash.com/photo-1677442136019-21780ecad995?w=900&h=600&fit=crop",
      "https://images.unsplash.com/photo-1620712943543-bcc4688e7485?w=900&h=600&fit=crop",
    ],
  },

  // 15. AI: Perplexity
  {
    id: "perplexity",
    name: "Perplexity AI",
    tagline: "附带实时网络引文的智能问答与科研搜索引擎",
    url: "https://perplexity.ai",
    category: "ai",
    categories: ["AI", "搜索", "科研"],
    developer: "Perplexity, Inc.",
    icon_url: "https://images.unsplash.com/photo-1508739773434-c26b3d09e071?w=128&h=128&fit=crop",
    cover_url: "https://images.unsplash.com/photo-1508739773434-c26b3d09e071?w=1200&h=800&fit=crop",
    preview_features: [
      "全网实时多源交叉验证并标注详尽参考来源引用",
      "Pro Search 交互式追问澄清复杂多步科研难题",
      "支持切换 Claude、GPT-4o、Sonar 模型思考模式",
    ],
    description:
      "Perplexity 重新定义了信息检索的方式。它不仅仅返回链接列表，而是即时阅读数十篇网页并提炼出条理分明的精准回答，并附带可溯源标注。",
    rating: 4.91,
    rating_count: "31.2k",
    age_rating: "4+",
    price: "免费 · 支持 Pro",
    size: "Web App",
    compatibility: "Web / iOS / Android",
    languages: "简体中文、英语等多语言",
    version: "4.1",
    version_date: "2026年10月",
    release_notes: "上线自定义 Collections 知识合辑共享与跨库引用检索功能。",
    featured: false,
    trending: true,
    screenshots: [
      "https://images.unsplash.com/photo-1508739773434-c26b3d09e071?w=900&h=600&fit=crop",
      "https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=900&h=600&fit=crop",
    ],
  },

  // 16. AI: Cursor
  {
    id: "cursor",
    name: "Cursor",
    tagline: "为结对编程深度定制的 AI 智能代码编辑器",
    url: "https://cursor.com",
    category: "ai",
    categories: ["AI", "开发", "工具"],
    developer: "Anysphere, Inc.",
    icon_url: "https://images.unsplash.com/photo-1555066931-4365d14bab8c?w=128&h=128&fit=crop",
    cover_url: "https://images.unsplash.com/photo-1555066931-4365d14bab8c?w=1200&h=800&fit=crop",
    preview_features: [
      "基于代码库全局向量语义感知多文件智能补全与重构",
      "Cmd+K 在线局部生成修改，Cmd+L 对话上下文全代码审阅",
      "无缝继承全部 VS Code 扩展与个人键盘配置偏好",
    ],
    description:
      "Cursor 带来革命性的开发效率飞跃。它深入理解整个代码仓库上下文，让开发者专注于架构与业务逻辑，由 AI 代劳样板代码与复杂排错。",
    rating: 4.96,
    rating_count: "29.8k",
    age_rating: "4+",
    price: "免费 · 支持 Pro",
    size: "Desktop / Web",
    compatibility: "macOS / Windows / Linux",
    languages: "简体中文、英语等多语言",
    version: "0.42.0",
    version_date: "2026年10月",
    release_notes: "引入 Composer 多文件协同编写新模式，支持跨模块同步修改。",
    featured: false,
    trending: true,
    screenshots: [
      "https://images.unsplash.com/photo-1555066931-4365d14bab8c?w=900&h=600&fit=crop",
      "https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?w=900&h=600&fit=crop",
    ],
  },

  // 17. AI: DeepSeek
  {
    id: "deepseek",
    name: "DeepSeek",
    tagline: "全开源高智力逻辑推理与前沿深度思考大模型",
    url: "https://chat.deepseek.com",
    category: "ai",
    categories: ["AI", "科研", "开源"],
    developer: "杭州深度求索 (DeepSeek AI)",
    icon_url: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=128&h=128&fit=crop",
    cover_url: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=1200&h=800&fit=crop",
    preview_features: [
      "DeepSeek-V3 拥有业界顶尖的数学竞赛与代码推理能力",
      "全量权重与技术报告完全开源，普惠全球开发者",
      "超高并发低延迟响应与长思维链 (CoT) 深度自省",
    ],
    description:
      "DeepSeek 专注于通用人工智能 (AGI) 基础模型的极致探索，在代码生成、中文语境深度理解和数学解题评测中稳居行业第一梯队。",
    rating: 4.93,
    rating_count: "27.5k",
    age_rating: "4+",
    price: "免费开放使用",
    size: "Web App",
    compatibility: "现代桌面与移动端浏览器",
    languages: "简体中文、英语",
    version: "V3",
    version_date: "2026年10月",
    release_notes: "正式发布 V3 架构，全面强化代码重构与逻辑严密性。",
    featured: false,
    trending: true,
    screenshots: [
      "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=900&h=600&fit=crop",
      "https://images.unsplash.com/photo-1677442136019-21780ecad995?w=900&h=600&fit=crop",
    ],
  },

  // 18. Games: 2048 Web
  {
    id: "2048-game",
    name: "2048 Web",
    tagline: "极简纯粹、风靡全球的经典数字方块合并益智游戏",
    url: "https://play2048.co",
    category: "games",
    categories: ["游戏", "益智", "经典"],
    developer: "Gabriele Cirulli",
    icon_url: "https://images.unsplash.com/photo-1611996575749-79a3a250f948?w=128&h=128&fit=crop",
    cover_url: "https://images.unsplash.com/photo-1611996575749-79a3a250f948?w=1200&h=800&fit=crop",
    preview_features: [
      "简单键盘方向键或手机滑动操作，令人欲罢不能",
      "纯前端零依赖本地运行，支持分数记录持久化",
      "经典极简主义色彩阶梯设计",
    ],
    description:
      "2048 是一款风靡全球的数学解谜游戏。通过滑动方块让相同数字在相撞时双倍合并，目标是拼出最终令人惊艳的 2048 黄金方块！",
    rating: 4.88,
    rating_count: "78.2k",
    age_rating: "4+",
    price: "免费 · 即开即玩",
    size: "Web Game",
    compatibility: "所有现代浏览器与触屏设备",
    languages: "英语、简体中文",
    version: "1.0",
    version_date: "2026年",
    release_notes: "支持无广告流畅畅玩体验与撤销辅助模式。",
    featured: false,
    trending: true,
    screenshots: [
      "https://images.unsplash.com/photo-1611996575749-79a3a250f948?w=900&h=600&fit=crop",
      "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=900&h=600&fit=crop",
    ],
  },

  // 19. Games: Chess.com
  {
    id: "chess-web",
    name: "Chess.com",
    tagline: "全球最大在线国际象棋对弈、战术谜题与名师课程",
    url: "https://chess.com",
    category: "games",
    categories: ["游戏", "棋类", "竞技"],
    developer: "Chess.com, LLC",
    icon_url: "https://images.unsplash.com/photo-1529699211952-734e80c4d42b?w=128&h=128&fit=crop",
    cover_url: "https://images.unsplash.com/photo-1529699211952-734e80c4d42b?w=1200&h=800&fit=crop",
    preview_features: [
      "毫秒级匹配千万全球棋手进行快棋、超快棋与慢棋对决",
      "深度引擎战术复盘分析，准确指出关键错着与最佳妙手",
      "海量开局库指南与残局练习挑战",
    ],
    description:
      "无论是初学者还是特级大师，Chess.com 都为您提供世界顶级棋艺竞技舞台。享受严密的防作弊监测、趣味排位赛及大师锦标赛直播。",
    rating: 4.95,
    rating_count: "64.3k",
    age_rating: "4+",
    price: "免费 · 支持会员",
    size: "Web Game",
    compatibility: "现代桌面与移动浏览器",
    languages: "简体中文、英语等多语言",
    version: "2026.10",
    version_date: "2026年10月",
    release_notes: "优化复盘复盘引擎评估速度与三维棋子皮肤光影。",
    featured: false,
    trending: true,
    screenshots: [
      "https://images.unsplash.com/photo-1529699211952-734e80c4d42b?w=900&h=600&fit=crop",
      "https://images.unsplash.com/photo-1507238691740-187a5b1d37b8?w=900&h=600&fit=crop",
    ],
  },
];

export const CATEGORIES_CONFIG = [
  { id: "all", name: "全部", enName: "All", icon: "LayoutGrid" },
  { id: "tools", name: "工具", enName: "Tools", icon: "Wrench" },
  { id: "ai", name: "AI", enName: "AI", icon: "Sparkles" },
  { id: "web", name: "WEB", enName: "Web", icon: "Globe" },
  { id: "games", name: "游戏", enName: "Games", icon: "Gamepad2" },
] as const;

export function getAllApps(options?: { category?: string }): AppItem[] {
  if (!options || !options.category || options.category === "all" || options.category === "全部") {
    return APPS_DATA;
  }
  const cat = options.category.toLowerCase();
  return APPS_DATA.filter((app) => {
    if (app.category.toLowerCase() === cat) return true;
    return app.categories.some((c) => c.toLowerCase() === cat);
  });
}

export function getAppById(id: string): AppItem | undefined {
  return APPS_DATA.find((a) => a.id === id);
}

export function searchApps(query: string): AppItem[] {
  if (!query || !query.trim()) return APPS_DATA;
  const q = query.toLowerCase().trim();
  return APPS_DATA.filter((app) => {
    return (
      app.name.toLowerCase().includes(q) ||
      app.tagline.toLowerCase().includes(q) ||
      app.description.toLowerCase().includes(q) ||
      app.developer.toLowerCase().includes(q) ||
      app.category.toLowerCase().includes(q) ||
      app.categories.some((c) => c.toLowerCase().includes(q))
    );
  });
}
