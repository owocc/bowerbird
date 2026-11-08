# MyGo Native UI 与插件系统底层重构方案

- **日期**：2026-11-08
- **参考标杆**：[`egoist/mygo-music`](https://github.com/egoist/mygo-music) (`github.com/egoist/mygo/ui` + `github.com/MoeForge/moejs`)
- **目标**：彻底移除 WebView、React/Vite 前端工程与旧版 React 组件插件体系，将整個桌面端切换为纯 Go GPU 原生渲染 (`mygo/ui`)，并将插件系统重构为“内置 Native 视图 + `moejs` 沙箱脚本”双层架构。

---

## 一、 架构全景对比

| 维度 | 现行架构 (MyGo WebView 混合架构) | 目标架构 (MyGo Native GPU 架构) |
| :--- | :--- | :--- |
| **底层依赖** | `github.com/egoist/mygo v0.5.5` + `wails/v3` 残留 | `github.com/egoist/mygo v0.8.4+` + `github.com/MoeForge/moejs` |
| **窗口渲染** | `mygo.WindowOptions{ URL: ... }` (OS WebView) | `mygo.WindowOptions{ Content: ui.View(a.view) }` (纯 GPU 渲染) |
| **前端工程** | `frontend/` (React 19 + TanStack Router + Tailwind CSS) | **彻底移除** `frontend/`、Vite、Node 构建链路与 TS 绑定生成 |
| **状态与通信** | 前后端 JSON RPC + `mygo.Event` + Loopback HTTP 静态服务 | Go 进程内直调 `core.Library`；后台 goroutine 通过 `win.Update(fn)` 同步回主线程 |
| **图片/缩略图管线** | 经由本地 `asset_server.go` HTTP 传输至浏览器解码 | Go 异步读取并解码为 `*ui.Bitmap` (`thumbCache`)，GPU 直接绘制纹理 |
| **多窗口管理** | 4 个独立 WebView 窗口 (`main`, `setup`, `settings`, `logs`) | 原生多窗口 (`a.win`, `a.settingsWin`, `a.logsWin`) 共享 Go 进程状态 |
| **插件体系** | React 组件 (`Viewport`/`InspectorExtension`) + Vite 打包 | **内置 Native 预览**（Go 原生绘制） + **`moejs` 沙箱扩展**（免构建单文件 JS/TS） |
| **UI 自动化测试** | 依赖浏览器或手工点按 | 使用 `ui.NewTester` 编写无头、零延迟、确定性的帧级交互测试 |

---

## 二、 目录与模块规划

迁移完成后，项目结构将大幅精简为纯 Go 桌面核心：

```text
bowerbird/
├── main.go                       # 入口：调用 internal/app.Run()
├── mygo.json                     # 纯 Native 配置（移除 devUrl/frontendDist/bindings）
├── go.mod                        # 升级 mygo v0.8.4+，引入 moejs，移除 wails/v3
├── core/                         # 现有核心业务层（SQLite、素材库、查询引擎、局域网 Mobile API、系统拖拽）
├── internal/
│   ├── app/                      # 新增：MyGo Native UI 视图与主线程状态机（对标 mygo-music/internal/app）
│   │   ├── app.go                # app 结构体、生命周期、单实例锁、多窗口管理、a.post 主线程投递
│   │   ├── ui_kit.go             # 主题 Palette、基础按钮(iconButton/pillButton)、分段控制(segmented)、Popover 样式
│   │   ├── icons.go              # 全量 24pt SVG 矢量图标定义 (strokeIcon / fillIcon)
│   │   ├── thumb_cache.go        # 缩略图与原图异步解码缓存 (*ui.Bitmap + LRU + 渐显动画)
│   │   ├── backdrop.go           # 动态环境背景色渲染（基于素材主色与调色板 Oklab 混色）
│   │   ├── menu.go               # macOS 顶部应用菜单栏与全局快捷键绑定
│   │   ├── tray.go               # 系统托盘/菜单栏图标与快捷菜单
│   │   ├── ui_main.go            # 主窗口根视图、快捷键分发、路由导航栈 (back/forward)、顶栏毛玻璃边缘
│   │   ├── ui_sidebar.go         # 左侧栏：素材库切换器、智能视图导航、递归文件夹树、拖拽归档
│   │   ├── ui_header.go          # 顶部工具栏：前进/后退、搜索框与联想下拉、缩放控制、多维筛选器栏 (FilterBar)
│   │   ├── ui_gallery.go         # 核心画廊：木桶布局 (Justified Layout) 行虚拟化列表 (ui.List)、卡片悬停、框选
│   │   ├── ui_inspector.go       # 右侧检查器：单选详情、主色卡提取、星级评分、标签流、多选批量编辑
│   │   ├── ui_tags.go            # 标签管理视图与标签选择器 Popover
│   │   ├── ui_preview.go         # 全窗口/空格键快速预览层 (QuickLook)：高清大图缩放平移、音视频、PSD、Markdown
│   │   ├── ui_dialogs.go         # 模态弹窗：新建/切换素材库向导、新建/重命名/删除文件夹、插件安装确认
│   │   ├── ui_settings.go        # 独立设置窗口：常规、外观、快捷键、插件管理、移动端同步、存储与网络
│   │   ├── ui_logs.go            # 独立日志查看器窗口：虚拟化日志行、级别过滤、关键词搜索、一键导出
│   │   └── *_test.go             # 基于 ui.NewTester 的原生交互与帧预算测试
│   ├── i18n/                     # 多语言翻译包（加载 zh-CN / en 词典，提供 T / Tf 辅助函数）
│   ├── player/                   # 音频/视频播放内核（用于内置音频预览与波形/频谱展示）
│   └── plugin/                   # 新增：基于 MoeForge/moejs 的 JS/TS 插件运行时沙箱
└── plugins/                      # 重构后的免构建 JS/TS 插件目录（如 pinterest/plugin.json + index.js）
```

---

## 三、 全量功能与现有组件一对一迁移清单

### Phase 1：底层框架升级与主线程状态机
1. **依赖与配置清理**：
   - 升级 `github.com/egoist/mygo` 至 `v0.8.4+`（使用 `go list -m -f '{{.Dir}}' github.com/egoist/mygo` 核对 `ui` 包最新签名）。
   - 移除 `github.com/wailsapp/wails/v3` 依赖。
   - 更新 `mygo.json`：移除 `devUrl`、`devCommand`、`buildCommand`、`frontendDist`、`bindings` 字段，仅保留应用元数据、图标与 `urlSchemes: ["bowerbird"]`。
2. **主线程模型 (`internal/app/app.go`)**：
   - 所有 UI 状态集中保存在 `app` 结构体中，**仅在主线程读写**。
   - 异步任务统一通过 `a.post(func())`（内部调用 `a.win.Update(func() { fn(); a.redraw() })`）将查询结果写回 `app` 并触发重绘。
   - 窗口配置：
     - `TitleBarStyle: mygo.TitleBarHidden`
     - `TrafficLightPosition: &mygo.Point{X: 20, Y: 20}`（macOS 沉浸式侧边栏交通灯对齐）
     - `Vibrancy: mygo.VibrancySidebar`（原生毛玻璃侧边栏）
     - `BackgroundColor: "light-dark(#ffffff, #141416)"`
     - `Content: ui.View(a.view)`
3. **异步图片纹理缓存 (`internal/app/thumb_cache.go`)**：
   - 对标 `mygo-music/internal/app/artwork.go`。
   - 提供 `a.thumbs.get(itemPath, targetPx)`：命中内存 LRU 直接返回 `*ui.Bitmap`；未命中则在后台 worker 池解码磁盘缩略图（支持 WebP/JPEG/PNG），完成后通过 `a.post` 刷新视图，并配合 `el.AnimateTo("art", 1, artFade)` 实现 320ms 平滑淡入。
   - 窗口隐藏时 (`win.OnHide`) 自动收缩缓存并调用 `debug.FreeOSMemory()` 释放系统内存（替代原有的 WebView 销毁式轻量模式）。

### Phase 2：核心工作区视图迁移 (`frontend/src/components/*` -> `internal/app/ui_*.go`)

| 原 React 组件 / 模块 | 目标 Go Native 文件 | 核心实现方案与交互细节 |
| :--- | :--- | :--- |
| `theme-provider.tsx` / `appearance.ts` / `BackdropSettings.tsx` | `ui_kit.go` + `backdrop.go` | 使用 `paletteFor(c.Theme())` 构建深浅色调色板；通过 `mygo.Theme.SetSource` 切换 Light/Dark/System；利用 `ui.LinearGradient` / `ui.RadialGradient` 与 Oklab 混色在画布底层绘制自定义背景光晕。 |
| `SidebarLibrarySwitcher.tsx` + `CreateLibraryDialog.tsx` | `ui_sidebar.go` + `ui_dialogs.go` | 参照 `mygo-music` 的 `sourceSwitcher`，在 macOS 交通灯右侧或侧边栏顶部渲染 `ui.SelectBase` 下拉菜单，支持切换最近素材库、创建新库、打开现有库目录 (`mygo.Dialog.Open`)。 |
| `SidebarDirectoryTree.tsx` + `FolderTreeItemNode.tsx` + `FolderContextMenu.tsx` + `FolderDialogs.tsx` | `ui_sidebar.go` | 在 `ui.Scroll(c.Key("nav"))` 中渲染固定导航项（全部、未分类、标签、回收站 + 计数徽章 `SidebarCount`）及扁平化展开的文件夹树。支持悬停高亮、折叠箭头、右键菜单 (`row.ContextMenu`)、重命名内联或弹窗 (`ui.DialogBase`)、以及拖拽素材落入文件夹归档。 |
| `HistoryNavButtons.tsx` + `FilterBar.tsx` + `ZoomControls.tsx` | `ui_header.go` | 顶部悬浮栏使用 `Material(glass.ScrollEdge{Hard: true, Background: p.bg})`。集成：后退/前进按钮、带快捷键 `⌘F` 聚焦的搜索框 (`ui.TextInput(&a.query).Bind(&a.searchBox)`)、缩放滑块 (`ui.SliderBase`)、以及按颜色/尺寸比例/星级/扩展名/标签过滤的 `ui.PopoverBase` 筛选栏。 |
| `JustifiedGallery.tsx` + `ImageThumbnailCard.tsx` + `UniversalThumbnail.tsx` | `ui_gallery.go` | **核心画廊视图**：<br>1. 根据视口宽度 `c.Size()` 与目标行高预计算 Justified 木桶布局行切片 `[]galleryRow`。<br>2. 使用 `ui.List(c.Key(a.route), &a.galleryList, len(rows), func(i int) { ... })` 实现**行级虚拟化**，仅构建屏幕可见行。<br>3. 每张卡片使用 `ui.ButtonBase(c.Key(item.ID))`，支持悬停微上浮 (`AnimatePose`)、角标显示格式/时长、单击单选、`⌘/Shift` 多选、双击进入预览。<br>4. 在画廊容器挂载 `HandleInput` 实现鼠标拖拽框选（Rubber-band Selection），并在 `.Draw` 中绘制半透明选区框。<br>5. 绑定原生文件拖入 (`win.OnDrop` + `DropzoneOverlay` 视觉层) 与原生文件拖出到外部应用 (`core.StartNativeDragOut`)。 |
| `ItemDetailPanel.tsx` + `MultiItemInspector.tsx` | `ui_inspector.go` | 右侧 280~320 DIP 检查器栏：<br>1. **单选模式**：顶部自适应缩略图 + 5~8 色调色板色条（点击色块调用剪贴板复制并 `c.Toast("Copied #HEX")`）、可编辑文件名 (`ui.TextInput`)、5 星评分点选组件、标签 Chip 列表（点击 `+` 弹出标签快速搜索/创建 Popover）、AI Prompt 折叠面板、备注与来源 URL 输入框、只读元数据表格（分辨率、大小、格式、创建/导入时间）及底部“在 Finder 中显示 / 默认应用打开”按钮。<br>2. **多选模式 (`MultiItemInspector`)**：显示选中数量堆叠缩略图、批量打标签、批量改评分、批量移动文件夹、批量移入回收站。 |
| `TagsManager.tsx` | `ui_tags.go` | 标签管理专页：支持搜索标签、按字母或素材数量分组/排序、右键重命名或删除标签、点击标签直接跳转到对应筛选画廊。 |
| `CustomContextMenu.tsx` | 各组件 `.ContextMenu` | 全面替换为原生 `el.ContextMenu(func(m *ui.Menu) { ... })`（支持文件右键菜单、文件夹右键菜单、画布空白处右键菜单、回收站还原/彻底删除菜单）。 |
| `UnifiedPreviewModal.tsx` | `ui_preview.go` | 类似 `mygo-music` 的 `nowPlayingLayer`：当 `a.previewOpen` 为真且动画完成时，跳过底层画廊构建以节省帧率。支持：<br>- **图片预览**：GPU 原图纹理渲染、触控板双指捏合/滚轮缩放、拖拽平移、1:1 / 适应窗口切换、左右方向键切换上一张/下一张、`Space`/`Esc` 关闭。<br>- **音视频/PSD/Markdown/Prompt**：直接分发至对应的内置 Native 预览子视图。 |
| `SettingsPage.tsx` + `LibrarySetup.tsx` + `LogsPage.tsx` | `ui_settings.go` + `ui_logs.go` | 独立原生窗口 (`a.settingsWin` / `a.logsWin`)，直接复用 `mygo-music/internal/app/ui_settings.go` 的 `settingsSection` + 搜索过滤模式，涵盖：外观与背景、快捷键录制与冲突检测、插件开关与权限授权、局域网移动端配对状态、代理网络配置、以及虚拟化日志查看器。 |

---

## 四、 插件系统重构方案（Native 内置 + `moejs` 沙箱）

由于彻底移除了 WebView，原本依赖浏览器 DOM 和 React 运行时的插件（编译产出 `index.js` React 组件）将按职责重构为两部分：

### 1. 原有 5 个官方插件的重构去向
| 现有插件 | 原类型 | 重构后形态 | 具体实现方式 |
| :--- | :--- | :--- | :--- |
| `prompt-metadata` | Metadata (React Inspector) | **内置 Native 模块** (`ui_inspector.go`) | 直接作为 Inspector 的标准折叠区块实现：固定高度滚动预览、一键复制按钮（带勾号动画切换）、点击展开 `ui.DialogBase` 全文阅读与 `⌘+Enter` 编辑保存。 |
| `audio-player` | Preview (React Viewport) | **内置 Native 模块** (`internal/player` + `ui_preview.go`) | 复用 `mygo-music` 的音频解码与播放管线 (`mp3`/`flac`/`ogg`/`wav`/`m4a`/`aac`)，在 Inspector 和全屏预览中原生绘制频谱柱 (`drawBars`) 与带进度拖拽的播放条 (`scrubber`)。 |
| `markdown-preview` | Preview (React Viewport) | **内置 Native 模块** (`ui_preview.go`) | 在 Go 中解析 Markdown 并通过 `ui.Scroll` + `ui.RichText` / 代码块容器直接渲染原生富文本排版。 |
| `psd-preview` | Preview (React + PSD 解析) | **内置 Native 模块** (`core/psd.go` + `ui_preview.go`) | 在 Go 侧直接解析 PSD/PSB 文件头、复合图像通道（生成缩略图与高清 `*ui.Bitmap`）及图层目录树，在右侧 Inspector 原生渲染图层可见性树与色彩模式信息。 |
| `pinterest` | URL Resolver + Menu | **`moejs` JS 插件** (`plugins/pinterest/`) | 保持为独立 JS 插件（零构建）：仅需 `plugin.json` + `index.js`，在 `moejs` 沙箱中运行，导出 `resolveUrl({ url })` 供宿主粘贴/拖入链接时调用。 |

### 2. 新版 `moejs` 插件规范（对标 `mygo-music/internal/plugin`）
第三方扩展插件不再编写 UI 组件，而是采用**“纯 JS/TS 逻辑导出 + 宿主 Native 声明式渲染”**模式：
- **目录结构**：`<UserDataDir>/plugins/<plugin-id>/plugin.json` + `index.js` (或 `index.ts`) + `locales/zh-CN.json`。**无需任何 Vite/Rollup 打包步骤**。
- **`plugin.json` 清单示例**：
  ```json
  {
    "id": "official.pinterest",
    "name": "Pinterest",
    "version": "1.0.0",
    "minAppVersion": "1.0.0",
    "main": "index.js",
    "permissions": {
      "network": ["pinterest.com", "*.pinterest.com", "pin.it", "i.pinimg.com"],
      "process": []
    },
    "settings": [
      { "key": "cookie", "label": "Session Cookie (Optional)", "help": "For private boards" }
    ]
  }
  ```
- **插件可导出的标准钩子函数**：
  - `resolveUrl({ url })` -> `{ url, candidates, sourceUrl, name, tags }`：解析外部网页/社交媒体链接为直链媒体。
  - `inspect({ item })` -> `{ sections: [{ title, rows: [{ label, value, copyable }], textBlocks: [...] }] }`：为特定素材提供自定义扩展元数据，宿主在 `ui_inspector.go` 中用统一的原生样式渲染。
  - `actions({ target, items, folder })` -> `[{ id, title, icon }]` & `runAction({ id, items, folder })`：向右键菜单注入自定义批处理动作（如调用外部 AI 放大工具、格式转换工具、图床上传）。
  - `thumbnail({ filePath, mimeType })` -> `{ imagePath, width, height }`：借助 `host.spawn` 调用外部 CLI 为冷门格式生成缩略图。
- **沙箱安全边界 (`internal/plugin/plugin.go`)**：
  - 每个插件独立 `moejs` 虚拟机，内存硬上限 `256MB`，单次调用超时 `30s`，卡死自动重启。
  - 默认无网络、无文件系统、无子进程权限；必须由 `plugin.json` 声明 `permissions.network`（域名白名单过滤 `fetch`）和 `permissions.process`（需用户在设置页点击“允许运行外部程序”授权后方可调用 `host.spawn`）。

---

## 五、 `mygo/ui` 样式与视图编写规范 (Styling & UI Cheat Sheet)

在 `mygo/ui` 中开发界面**没有 HTML/CSS**，全部使用 Go 链式方法调用与 `Painter` 2D 绘图接口。以下是标准写法参考：

### 1. 生命周期与身份标识铁律 (Identity & Lifetime)
- **禁止跨帧保存 `ui.Element` 或 `*ui.Context`**：所有 `ui.Box(c)`、`ui.ButtonBase(c)` 返回的 `ui.Element` 仅在当前构建帧有效。持久化状态只能存业务数据、组件状态（`ui.ListState`、`ui.ScrollState`）和焦点句柄（`ui.Handle`）。
- **稳定 Key (`c.Key`)**：在循环、条件分支、或有状态/动画的组件前，**必须**使用 `c.Key(uniqueKey)`，且容器的 `.Key(...)` 必须写在 `.Children(...)` 之前：
  ```go
  for _, item := range items {
      a.itemCard(c.Key(item.ID), item)
  }
  ```
- **双向绑定句柄 (`.Bind(&handle)`)**：当需要从快捷键或外部逻辑控制焦点、或读取已提交的几何位置 (`handle.Bounds(c)`) 时：
  ```go
  ui.TextInput(c.Key("search"), &a.query).Bind(&a.searchBox)
  // 在快捷键回调中请求聚焦：
  c.OnShortcut(ui.Cmd, ui.KeyF, func() { a.searchBox.Focus(c) })
  ```

### 2. 布局系统 (Flexbox / Grid / Absolute / Scroll / List)
- **水平与垂直排布 (`Row` / `Column`)**：
  ```go
  ui.Row(c).
      Fill().                        // width: 100%, height: 100%
      Height(40).                    // 固定高度 40 DIP
      Padding(0, 16, 0, 16).         // 上、右、下、左内边距 (或 .PaddingX(16))
      Gap(10).                       // 子元素间距 10 DIP
      AlignItems(ui.Center).         // 交叉轴居中
      Justify(ui.SpaceBetween).      // 主轴两端对齐
      Children(func() {
          ui.Icon(c, iconFolder).Size(16, 16).TextColor(p.muted)
          ui.Text(c, folder.Name).FontSize(13).Grow(1).Shrink(1).MinWidth(0).SingleLine()
          ui.Textf(c, "%d", folder.Count).FontSize(12).FontFeatures("tnum").TextColor(p.faint)
      })
  ```
- **自适应网格 (`Grid`)**：
  ```go
  w, _ := c.Size()
  cols := max(2, int((w - sidebarWidth - inspectorWidth - 48) / 180))
  ui.Grid(c).Columns(cols).GapX(16).GapY(20).Children(func() { ... })
  ```
- **绝对定位叠加层 (`Absolute`)**：
  ```go
  // 卡片右下角悬浮徽章
  ui.Box(c).Absolute().Bottom(8).Right(8).Padding(2, 6).Radius(4).
      Background(ui.RGBA(0, 0, 0, 0.65)).Children(func() {
          ui.Text(c, strings.ToUpper(item.Extension)).FontSize(10).FontWeight(600).TextColor(ui.Hex("#ffffff"))
      })
  ```
- **高性能虚拟化列表 (`ui.List`)**：
  ```go
  // 仅构建当前视口可见的行，支持上万条素材 120fps 滚动
  ui.List(c.Key(a.route), &a.galleryList, len(a.rows), func(rowIdx int) {
      a.renderGalleryRow(c, a.rows[rowIdx])
  }).Grow(1).Padding(topInset, 20, bottomInset, 20).ScrollbarInsets(topInset, 0, bottomInset, 0)
  ```

### 3. 主题色板与视觉修饰 (`palette` / 圆角 / 边框 / 阴影 / 渐变)
在 `internal/app/ui_kit.go` 中集中定义 `palette`：
```go
type palette struct {
    dark      bool
    bg        ui.Color // 主内容背景 (#141416 / #ffffff)
    sidebar   ui.Color // 侧边栏与检查器背景 (#1c1c1f / #f4f4f6)
    surface   ui.Color // 卡片与输入框表面色
    text      ui.Color // 主文本色
    muted     ui.Color // 次要文本色
    faint     ui.Color // 弱提示/序号/占位色
    hairline  ui.Color // 1px 分割线颜色
    hover     ui.Color // 悬停态半透明叠加色
    press     ui.Color // 选中/按下态叠加色
    accent    ui.Color // 品牌强调色 (支持 ui.Oklch(0.66, 0.2, 250))
    onAccent  ui.Color // 强调色上的文字颜色 (#ffffff)
    cardShade ui.Color // 卡片投影颜色
}
```
常用视觉属性链式调用：
```go
ui.Box(c).
    Size(160, 120).
    Radius(10).                                           // 圆角 (胶囊用 999)
    Background(p.surface).                                // 纯色背景
    Border(1, p.hairline).                                // 边框宽度与颜色
    Shadow(0, 8, 24, -4, p.cardShade).                    // 阴影 (offsetX, offsetY, blur, spread, color)
    Opacity(0.85)                                         // 透明度
```

### 4. 交互状态与丝滑动画 (`Hovered` / `Pressed` / `AnimateColor` / `AnimatePose`)
- **悬停与选中变色过渡**：
  ```go
  b := ui.ButtonBase(c.Key(id)).Height(32).PaddingX(10).Radius(8).AlignItems(ui.Center).FocusRing(false)
  bg := ui.Transparent
  switch {
  case isSelected:
      bg = p.press
  case b.Hovered():
      bg = p.hover
  }
  b.Background(b.AnimateColor("bg", bg, ui.Animation{Duration: 120 * time.Millisecond}))
  ```
- **卡片悬停上浮与按压缩放弹簧动画 (`AnimatePose` + `ui.Snappy`)**：
  ```go
  card := ui.ButtonBase(c.Key(item.ID)).Column().Gap(6).FocusRing(false)
  thumbBox := ui.Box(c).Size(w, h).Radius(8)
  pose := ui.Pose{}
  if card.Hovered() {
      pose.Y = -3
      thumbBox.Shadow(0, 12, 28, -6, p.cardShade)
  } else {
      thumbBox.Shadow(0, 2, 6, -1, p.cardShade)
  }
  if card.Pressed() {
      pose.Scale = 0.97
  }
  thumbBox.AnimatePose(pose, ui.Snappy)
  ```
- **数值平滑插值 (`AnimateTo`)**：
  ```go
  // 例如侧边栏/检查器展开收起、或悬停时进度条变粗
  thick := float32(4)
  if slider.Hovered() || slider.Pressed() {
      thick = 6
  }
  thick = slider.AnimateTo("thick", thick, ui.Snappy)
  ```

### 5. 自定义 GPU 画布绘制 (`.Draw` + `*ui.Painter`)
对于透明图片棋盘格背景、框选矩形、自定义滑块、色彩圆环或音频频谱，直接使用 `.Draw`：
```go
ui.Box(c).Fill().Draw(func(pt *ui.Painter, r ui.Rect) {
    // 绘制半透明框选填充与描边
    if a.lasso.active {
        sel := a.lasso.rect()
        pt.Fill(sel, a.pal.accent.Alpha(0.15), 4)
        pt.Stroke(sel, a.pal.accent.Alpha(0.8), 4, 1)
    }
})
```

---

## 六、 分步执行路线图与验收标准 (Execution Roadmap)

### Step 1：基础底座与空窗口跑通
- [ ] 升级 `go.mod` 中 `github.com/egoist/mygo` 到 `v0.8.4+`，添加 `github.com/MoeForge/moejs`，移除 `wails/v3`。
- [ ] 更新 `mygo.json` 为纯 Native 模式。
- [ ] 创建 `internal/i18n`（迁移 `frontend/src/messages/zh.json` 与 `en.json` 文案）和 `internal/app` 基础骨架（`app.go`, `ui_kit.go`, `icons.go`, `thumb_cache.go`）。
- [ ] 验证：`go tool mygo dev` 启动纯 Native 窗口，无 WebView 进程，深浅色主题切换与交通灯位置正常。

### Step 2：主工作区三大核心区域（Sidebar + Gallery + Inspector）
- [ ] 实现 `ui_sidebar.go`：素材库切换器、全部/未分类/标签/回收站导航、递归文件夹树增删改查。
- [ ] 实现 `ui_header.go`：历史前进/后退、关键词搜索、缩放滑块、颜色/格式/星级/形状组合筛选栏。
- [ ] 实现 `ui_gallery.go`：接入 `core.Service.QueryWorkspace` 查询结果，完成木桶布局计算与 `ui.List` 虚拟滚动、缩略图异步加载淡入、单选/多选/框选、右键菜单、系统拖入导入与原生拖出。
- [ ] 实现 `ui_inspector.go` & `ui_tags.go`：单选属性编辑、主色板点击复制、星级评分、标签增删、AI Prompt 折叠面板、多选批量操作、标签管理页。

### Step 3：全屏预览层与独立辅助窗口（Preview + Settings + Logs + Setup）
- [ ] 实现 `ui_preview.go`：空格键开启高清图片缩放/平移预览、内置音频播放器、内置 Markdown 渲染器、内置 PSD 图层树与合成图预览。
- [ ] 实现 `ui_settings.go` & `ui_logs.go` & `ui_dialogs.go`：独立设置窗口（带搜索过滤）、独立日志窗口、首次启动素材库引导弹窗。
- [ ] 实现 `menu.go` & `tray.go`：应用菜单栏、系统托盘与全局截图/唤醒快捷键。

### Step 4：插件系统切换与旧前端彻底清理
- [ ] 实现 `internal/plugin`（基于 `moejs` 的插件加载器、权限控制、设置存储、GitHub/本地 ZIP 安装与更新）。
- [ ] 将 `plugins/pinterest` 迁移为免构建 `moejs` 插件格式；移除已被内置 Native 视图替代的 React 插件工程与 `scripts/build-plugins.mjs`。
- [ ] 删除 `frontend/`、`packages/plugin-sdk/`、`packages/ui/` 及根目录下多余的 Node/Vite 构建脚本（保留 `extension/` 浏览器扩展或按需独立维护）。
- [ ] 编写 `internal/app/*_test.go`（使用 `ui.NewTester` 覆盖核心交互与 `perf_test.go` 空闲零帧消耗断言），确保 `CGO_ENABLED=0 go test ./...` 与 `go tool mygo vet .` 全部通过。
