<p align="center">
  <a href="README.md">English</a> · <strong>简体中文</strong>
</p>

<div align="center">
  <img src="assets/branding/banner.jpg" alt="BowerBird —— 本地优先的素材与设计库管理器" width="100%">
</div>

<h1 align="center">BowerBird</h1>

<p align="center">
  <strong>你的设计素材库，放在你自己的硬盘上。</strong><br>
  写给那些文件太多、耐心太少的人——一个本地优先的素材管理器。
</p>

---

把 BowerBird 指向一个装着图片和视频的文件夹，它就会变成一个素材库：每个文件当场计算哈希、生成缩略图、提取配色并建立索引。不需要上传，不需要注册，也不经过任何云端——得到的只是一个可以随手搬走、备份或自行同步的 `.library` 包。

BowerBird 是一个跨平台桌面应用，使用 **mygo（Go）** 的 webview 模式与 **React 19 + TypeScript + Tailwind CSS v4** 构建。桌面外壳基于 [mygo](https://github.com/egoist/mygo)；实验性的原生渲染版本位于 `cmd/bowerbird-native/`。

## 功能

### 只导入一次，且永不重复存储

- **内容寻址存储。** 每个素材都用 SHA-256 计算哈希，各自存放在独立目录中（`items/<hash>/original.<ext>`）。同一张图导入两次不占额外空间，两个素材库也不会对"同一张图片"给出不同答案。
- **随处拖入即可导入。** 操作系统级的文件拖放会直接进入导入流程并回传进度事件——拖到窗口、侧边栏或虚拟文件夹上都可以。
- **双存储模型。** 快速的关系查询来自 `index.db`（SQLite）；而每个素材自身还带着 `metadata.json` 与 `thumbnail.jpg`，因此素材库本身是自描述的，数据库只是缓存而不是真相的唯一副本。

### 按画面找图，而不是按文件名

- **自动提取配色。** 导入时会（并会对已有素材库在后台补做）提取主色、6 色感知调色板、颜色模型、是否含 Alpha 通道、宽高比、方向（`landscape` / `portrait` / `square`）、以百万像素计的尺寸，以及 JPEG 的 EXIF 拍摄信息。
- **多维度筛选。** 一个筛选栏涵盖 **文件类型**、**颜色**、**标签**、**虚拟文件夹** 与 **方向**；颜色筛选基于感知 ΔE 匹配，所以"大概是这个蓝"真的能筛出那个蓝——既对预设色板生效，也对素材库里已有的颜色生效。
- **虚拟文件夹与标签。** 同一个素材可以同时被多种方式组织；删除会先进回收站，而不是直接从磁盘抹掉。

### 不离开素材库就能预览一切

- **可插拔的预览架构**（`PreviewPluginRegistry`）：内置 **图片** 与 **视频** 插件，其余格式回落到 **系统图标**。
- **图片** 支持带阻尼的触控板捏合缩放（25%–800%）、放大后的双指平移，以及超过 125% 时出现的交互式小地图。
- **视频** 使用多引擎播放器（hls.js + mpegts.js + dash.js + HTML5 原生），覆盖 HLS、MPEG-TS 与 DASH，配有 shadcn 控制栏——0.25x–8x 倍速、悬停音量、±5 秒快进快退、循环、全屏——并会提取首帧配色，让视频缩略图与画廊风格一致。
- 两种观看方式：**双击** 在工作区内联预览，**空格** 打开全窗口 QuickLook。

### 一个像原生应用一样顺手的画廊

- **等比布局（justified layout）** 在窗口缩放时依然像素级准确，双指捏合缩放的是画廊本身，而不是缩放整个页面。
- **全画布框选** 在任意空白区域都能生效——包括内边距、行间距、末尾留白——并会在拖到边缘时自动滚动。
- **选择顺序被严格保留** 为 FIFO 队列，因此多选预览会按你点选的顺序堆叠 **最后 6 个条目**。
- 右侧检查器使用可折叠的 **手风琴（Accordion）** 分区与无边框自适应预览，让元数据不会挤压图片。

### 把素材拖回你真正的工作流

从 webview 里拖出文件通常只能发布文本格式，因此这部分由 BowerBird 自己按平台实现：

- **Windows**（`core/drag_windows.go`）——取消 webview 的拖拽，改用 `Service.StartDragItems` 传入被拖条目 ID，由 Go 侧构造 shell 数据对象（`SHCreateDataObject` → `CF_HDROP`），并以 `DROPEFFECT_COPY` 调用 `DoDragDrop`。
- **macOS**（`core/drag_darwin.go`）——保留 webview 的拖拽会话，并把剪贴板改写成 `public.file-url` / `NSFilenamesPboardType`。
- **应用内的拖放提示**——侧边栏与主工作区都使用 10% 不透明度的遮罩加虚线边框，既不遮挡文件夹名，也不会让布局跳动。

### 可扩展

- **预览插件是一等公民。** 为任意扩展名注册一个查看器，它就会同时出现在弹窗与检查器中——见 [注册自定义预览插件](#注册自定义预览插件)。
- **插件商店与双通道分发**（`owocc/bowerbird-plugins`）：`main` 分支存放精简的元数据索引，GitHub Releases 存放打包好的 zip，由市场端直接解析，中间不经过任何代理。
- **内置插件同样列在插件商店里并可禁用**（与已安装的插件同列），只有内部兜底插件始终启用。

### 真正握在自己手里的存储

- **素材库就是一个可移植的包**——条目目录加上 `index.db`，仅此而已。
- **应用状态完全分离**——全局界面设置、日志与已安装插件存放在平台各自的用户数据目录（`~/Library/Application Support/bowerbird/`、`%APPDATA%\bowerbird\`、`~/.config/bowerbird/`），因此素材库可以干净到直接交给别人。
- 设置里有一个 **数据与存储** 分区，可一键在 Finder / Explorer 中打开这两个目录。

### 你用什么平台，它就在哪

macOS（arm64 + amd64 通用包）、Windows（免安装可执行文件与带 WebView2 引导的 NSIS 安装包）与 Linux——同一套工作区里还包含移动端应用、用于从网页采集素材的浏览器扩展、插件市场应用与文档站点。

---

## 项目结构

```text
├── main_mygo.go                      # mygo 应用入口（窗口、菜单、托盘、系统级文件拖放路由）
├── mygo.json                         # mygo 构建配置（应用名、bundle id、版本、开发/构建命令）
├── core/                             # Go 后端包
│   ├── models.go                     # 领域模型（Item、ImageMeta、Folder、Tag、LibraryInfo）
│   ├── library.go                    # SQLite 索引、导入流水线、文件夹/标签/回收站增删改查
│   ├── color_extractor.go            # 感知调色板量化器与 EXIF/图片元数据解析
│   ├── asset_server.go               # 为原图、缩略图与系统图标提供本地 HTTP 流式服务
│   ├── service.go                    # 通过 mygo.Bind 暴露给前端的应用服务
│   ├── host.go                       # 桌面运行时抽象（事件、对话框、拖拽、主线程）
│   └── drag_*.go                     # 各平台的系统级拖拽导出与调试追踪
└── frontend/                         # React 19 + Vite + Tailwind v4 前端
    └── src/
        ├── plugins/preview/          # 可插拔的文件预览系统
        │   ├── types.ts              # PreviewPlugin、PreviewViewportProps、PreviewInspectorProps
        │   ├── registry.ts           # PreviewPluginRegistry 单例与插件解析
        │   └── builtin/              # 内置插件（图片、视频、兜底）
        ├── components/
        │   ├── LibraryWorkspace.tsx  # 主三栏可调整工作区
        │   ├── FilterBar.tsx         # 多维度筛选下拉（类型、颜色、标签、文件夹、方向）
        │   ├── JustifiedGallery.tsx  # 像素级等比布局与全画布框选
        │   ├── ItemDetailPanel.tsx   # 无边框自适应预览、色板与手风琴元数据
        │   ├── MultiItemInspector.tsx# 最后 6 项 FIFO 堆叠预览与批量整理
        │   ├── UnifiedPreviewModal.tsx # 由插件驱动的内联与全窗口预览宿主
        │   └── ui/accordion.tsx      # 可折叠的检查器手风琴基础组件
        ├── hooks/
        │   ├── useTrackpadZoom.ts    # 主画廊的触控板捏合缩放 hook
        │   ├── useFileDrop.ts        # 拖放导入状态与进度事件
        │   └── useHistoryNavigation.ts # 基于路由的前进/后退导航
        └── lib/
            ├── host-runtime.ts       # 桌面运行时适配层（事件以 {data} 信封传递）
            ├── workspace-search.ts   # 导航与筛选状态的 URL search schema
```

---

## 预览插件架构

所有文件预览——无论是主界面/全屏弹窗（`UnifiedPreviewModal`）还是右侧检查器（`ItemDetailPanel`）——都通过 `previewRegistry`（`frontend/src/plugins/preview/registry.ts`）解析。

### 内置插件

| 插件 ID | 优先级 | 状态 | 支持格式 | 能力 |
| :--- | :--- | :--- | :--- | :--- |
| `builtin.image` | `100` | 内置（可禁用） | `png, jpg, jpeg, webp, gif, bmp, svg, ico, tiff, tif, avif` | 带阻尼的触控板缩放（`25%`–`800%`）、放大后的双指平移、交互式小地图（`>125%`）、无边框检查器预览 |
| `builtin.video` | `90` | 内置（可禁用） | `mp4, mov, qt, webm, mkv, avi, m4v, flv, f4v, ts, mts, m2ts, m3u8, m3u, mpd, ogv, ogm, 3gp, 3g2, wmv, asf, mpg, mpeg, m2v, vob, rmvb, rm` | 多引擎播放器（**hls.js** + **mpegts.js** + **dash.js** + HTML5 原生）、独立的 shadcn 底部控制栏（`0.25x`–`8x` 倍速菜单、悬停音量滑杆、±5 秒跳转、循环、全屏）、封面/首帧配色提取、检查器内仅显示封面 |
| `builtin.fallback` | `0` | 内部兜底 | `*`（捕获全部） | 通过 `/asset/icon/<ext>` 渲染系统原生文件图标 |

### 注册自定义预览插件

```tsx
import { previewRegistry } from "@/plugins/preview/registry";

previewRegistry.register({
  id: "custom.model3d",
  name: "3D Model Viewer",
  priority: 95,
  extensions: ["glb", "gltf", "obj"],
  supportsZoom: false,
  Viewport: ({ item }) => <My3DCanvas src={item.originalUrl} />,
  InspectorPreview: ({ item, onOpenPreview }) => (
    <div onDoubleClick={onOpenPreview}>3D Preview: {item.filename}</div>
  ),
});
```

---

## 拖拽导出到窗口之外

把素材拖到别的应用是平台相关的，因为从 webview 发起的 HTML5 拖拽只会发布文本格式（`text/plain`、`text/uri-list`）：

- **Windows**（`core/drag_windows.go`）：`frontend/src/lib/drag-out.ts` 取消 webview 的拖拽，并以被拖条目 ID 调用 `Service.StartDragItems`。Go 侧构造 shell 数据对象（`SHCreateDataObject` → `CF_HDROP`），并以 `DROPEFFECT_COPY` 运行 `DoDragDrop`。
- **macOS**（`core/drag_darwin.go`）：保留 webview 的拖拽会话，并把其剪贴板改写成 `public.file-url` / `NSFilenamesPboardType`。
- **应用内拖放视觉**：侧边栏与主工作区都使用不打扰操作的 `10%` 不透明度遮罩加虚线边框（`bg-foreground/10 border-dashed`），既不遮挡文件夹名，也不引起布局位移。

### 拖放追踪

拖放流水线的每一步都会写入用户数据目录下的 `drag-debug.log`（Windows 为 `%APPDATA%\bowerbird\drag-debug.log`，macOS 为 `~/Library/Application Support/bowerbird/drag-debug.log`）。测试期间可通过 `BOWERBIRD_USER_DATA_DIR` 覆盖该目录。

---

## 数据与存储架构规范

BowerBird 在 **用户素材库** 与 **应用状态数据** 之间执行严格的物理隔离：

```text
┌────────────────────────────────────────────────────────┐
│ 1. 用户素材库（可移植容器包）                           │
│    例如 ~/Pictures/Designs.library/                    │
│    ├── items/<hash>/original.<ext>                     │
│    ├── items/<hash>/thumbnail.jpg                      │
│    ├── items/<hash>/metadata.json                      │
│    └── index.db（SQLite 关系缓存）                      │
└────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────┐
│ 2. 应用用户数据目录（<UserDataDir>）                    │
│    macOS:   ~/Library/Application Support/bowerbird/   │
│    Windows: %APPDATA%\bowerbird\                       │
│    Linux:   ~/.config/bowerbird/                       │
│    ├── user_data.json      # 全局界面设置               │
│    ├── app.log             # 诊断运行时日志             │
│    ├── drag-debug.log      # 拖放追踪日志               │
│    └── plugins/            # 已安装的远程插件           │
│        ├── installed.json  # 已安装插件注册表           │
│        └── <plugin-id>/    # 解压后的插件包             │
│            ├── manifest.json                           │
│            └── index.js                                │
└────────────────────────────────────────────────────────┘
```

### 插件生态与分发规范

1. **源码隔离**：
   - 官方插件的源码位于 `plugins/<plugin-id>/`（`src/index.tsx`、`manifest.json`、`package.json`）。
   - 构建产物严格输出到 `dist/plugins/`（已被 git 忽略）。禁止把构建后的 JavaScript 提交进 `plugins/`。
2. **双通道分发仓库**：
   - 分发元数据发布到专用仓库（`owocc/bowerbird-plugins`）。
   - **`main` 分支**：存放精简的索引元数据（`index.min.json`、`registry.json`、`repo/<id>/manifest.json`、`repo/<id>/index.js`）。
   - **GitHub Releases**：存放打包好的发布 zip（`<plugin-id>-v<version>.zip`）。
3. **市场与边缘解析**：
   - 插件商店（`apps/marketplace/`）从 `PLUGIN_REPO_INDEX_URL` 读取元数据。
   - 发布包直接从 `PLUGIN_RELEASE_BASE_URL` 下载，中间不经过代理。
4. **应用内数据管理**：
   - 设置面板包含专门的 **数据与存储** 分区，可一键在原生文件管理器（Finder / Explorer）中打开 **插件目录** 与 **应用数据目录**。

---

## 开发与验证

所有开发/构建命令都在根目录 `package.json` 的 `scripts` 中——用 `pnpm run <script>` 运行。

### 开发

> **需要 cgo。** `core/` 下的 macOS 原生实现
> （`sysicon_darwin.go`、`videothumb_darwin.go`、`drag_darwin.go`）包含
> `import "C"`。设置 `CGO_ENABLED=0` 时 Go 会静默丢弃它们，而它们的
> `!darwin || ios` 兜底实现同样会在 darwin 上被排除——于是
> `StartDragItems` / `GetSystemFileIconPNG` 等符号消失，构建以
> `undefined: ...` 报错失败。`pnpm dev` / `pnpm build:app*` 脚本都经由
> `scripts/mygo.mjs` 路由，会在所有平台上强制 `CGO_ENABLED=1`。

```bash
pnpm dev                 # mygo 开发模式（Go 后端 + Vite HMR，经由 mygo devCommand）
pnpm dev:frontend        # 仅启动 Vite 开发服务器（前端）
pnpm dev:marketplace     # 插件市场（apps/marketplace）开发服务器
pnpm dev:docs            # 文档站点（apps/docs）开发服务器
pnpm dev:extension       # 浏览器扩展开发（Chrome）；另有 :firefox 变体
```

### 构建

```bash
pnpm build               # 插件 + 前端打包（mygo build 消费的产物）
pnpm build:release       # 插件 + 前端 + mygo 构建
pnpm build:app           # mygo 构建（当前平台）
pnpm build:app:macos     # macOS 通用包（arm64 + amd64）
pnpm build:app:windows   # Windows amd64（便携 exe + NSIS 安装包）
pnpm build:app:linux     # Linux amd64

pnpm build:packages      # 工作区包（@bowerbird/plugin-sdk、@workspace/ui）
pnpm build:plugins       # scripts/build-plugins.mjs -> dist/plugins/*.zip + index.min.json
pnpm build:frontend      # 类型检查 + 生产环境前端打包
pnpm build:extension     # 浏览器扩展（Chrome）；另有 :firefox / :edge / :safari 变体
pnpm build:marketplace   # 插件市场应用
pnpm build:docs          # 文档站点
pnpm build:all           # 所有 JS/TS 工作区目标
```

### 验证 / 工具

```bash
pnpm test                # go test ./...
pnpm test:watch          # go test -count=1 -v ./...
pnpm typecheck           # 在所有定义了类型检查的包中执行 tsc / astro check
pnpm clean               # 清理构建产物（frontend/dist、dist、build/mygo 等）
```

等价的原始命令，供参考：

```bash
# 运行 Go 后端单元与集成测试
go test ./...

# 前端类型检查与打包
pnpm --filter bowerbird build
```

```bash
# 以 mygo 开发模式运行（Vite 开发服务器 + Go 后端，热重载）
CGO_ENABLED=1 go tool mygo dev

# 生产构建（产物位于 build/mygo/ 下的各平台应用包 / 安装器 / 磁盘映像）
CGO_ENABLED=1 go tool mygo build
```

### 工作区包解析

`@bowerbird/plugin-sdk` 与 `@workspace/ui` 直接从 TypeScript 源码消费——`@bowerbird/plugin-sdk` 发布的 `dist/` 产物只由 `pnpm --filter @bowerbird/plugin-sdk build` 生成，且只有发布到 npm 时才需要。

- **类型检查**——在消费方的 `tsconfig.json` `paths` 中映射该包（替换项相对 `baseUrl` 解析）：
  `"@bowerbird/plugin-sdk": ["../packages/plugin-sdk/src/index.ts"]`。
- **Vite**——设置 `resolve.tsconfigPaths: true`，让开发期解析与 `tsc` 一致
  （`frontend/vite.config.ts`）；生产构建无论如何都会内联源码。

缺少 Vite 配置时，开发会失败并报
`Failed to resolve import "@bowerbird/plugin-sdk" from ... Does the file exist?`。

### Windows 安装包（NSIS）

在 Windows 上，`go tool mygo build`（经由 `pnpm run build:app:windows`）会同时产出便携版可执行文件与位于 `build/mygo/windows-amd64/` 下的 NSIS 安装包。
安装包会在 *应用和功能* 中注册该应用，在缺少 WebView2 运行时时自动安装，并询问用户是否创建快捷方式（默认勾选开始菜单，桌面可选），以及是否运行应用。

NSIS 步骤是 mygo Windows 打包流水线的一部分；GitHub 的
`windows-latest` runner 开箱即可构建。本地 Windows 构建时，需保证
`makensis` 在 `PATH` 中：用 `scoop install nsis`（shim 会自动进入 `PATH`）、
`choco install nsis`（把 `C:\Program Files (x86)\NSIS` 追加到 `PATH`），
或 `winget install NSIS.NSIS`（需手动配置 `PATH`）。

```bash
go tool mygo build
# -> build/mygo/windows-amd64/   便携可执行文件 + NSIS 安装包
```

CI（`.github/workflows/release-app.yml`）会以
`bowerbird-windows-x64-portable.exe` 与 `bowerbird-windows-x64-installer.exe`
两个名字发布它们。
