# Bowerbird 桌面端 mygo NATIVE 渲染模式迁移方案

> 分支：`experiment/desktop-mygo-native`（基线 = 最新 main，已含 webview 版 mygo 迁移）
> 参考：`/Volumes/Kidd/projects/code/mygo-ref`，实际依赖 `github.com/egoist/mygo v0.5.5`
> 目标：用 `ui` 包（纯 Go GPU 绘制，无 webview / HTML / JS）重写桌面 UI，复用 `core` 业务层；产出可运行二进制与粗性能对比。

## 1. 结论摘要

- 现有桌面端是「薄原生壳 + React 前端 + 纯 Go core」。除插件预览、网页媒体播放、DOM 级拖拽/缩放外，界面本质是「列表 + 网格 + 表单 + 弹层」，这些在 `ui` 包里都有对应物：`Sidebar`、`GridView`、`List`、`Toolbar`、`Split`、`Scroll`、`Modal`、`Menu`、`TextInput`、`Select`、`TokenField` 等。
- N native 版和 webview 版可以共用 `core`：`core.Host` 已经与框架解耦，本轮只需再实现一个 **native Host**（窗口、事件、对话框、剪贴板、主线程）。`core.Service` 的 90+ 个方法原样复用，不新增业务分支。
- 入口独立：新增 `cmd/bowerbird-native/`，不动根目录 `main_mygo.go`；native UI 放在 `internal/nativeui/`，两条线同时 `go build ./...` 可编译。
- 主要缺口在**媒体呈现**与**插件**：
  - 图片：完整支持（JPEG/PNG/WebP/BMP/GIF 首帧，`Bitmap.Update` 可做动画）。
  - GIF：可用 `image/gif` 逐帧 + `Bitmap.Update` 做动画；本轮先做静态首帧，预览动画列为可选增强。
  - 视频：`ui` 没有视频解码器，也不能嵌 `<video>`。native 版用导入时生成的 `thumbnail.jpg` 当封面，预览里提供「用默认应用打开」，不在应用内播放。这是明确的体验降级。
  - 插件：按需求本轮不接 UI，`PluginManager` 不参与 native 界面，插件入口/预览插件/市场全部列为缺口。
- 性能策略：虚拟化网格（`GridView` 只构建可见 cell）+ 缩略图后台解码/降采样/LRU + 单窗口即时模式重建。启动不加载 webview、不解析 HTML/JS/CSS，理论上启动与空载内存显著低于 webview 版；实测数据见实施报告。

## 2. 现有前端功能盘点

以 `frontend/src` 为准，按路由/组件逐项列出。

### 2.1 路由与页面（`router.tsx`）

| 路由 | 页面 | 职责 |
|---|---|---|
| `/` | `IndexRedirect` | 探测当前库，跳 `/browse` |
| `/browse` | `BrowsePage` → `LibraryWorkspace` | 主工作区；无库时显示空态并自动打开 Setup 窗口 |
| `/setup` | `LibrarySetup` | 独立窗口：创建库、打开已有库、选择目录、打开设置 |
| `/settings` | `SettingsPage` | 独立窗口：通用/快捷键/插件/网络/数据/扩展/移动连接 |
| `/logs` | `LogsPage` | 独立窗口：结构化日志、过滤、清空、定位日志文件 |

### 2.2 主工作区（`LibraryWorkspace.tsx`，3258 行）

| 区块 | 组件/能力 | 细节 |
|---|---|---|
| 顶部工具栏 | 搜索、筛选、排序、布局、缩放、导入、删除/恢复、设置 | `SearchField`、`FilterBar`、排序 asc/desc、4 种布局（justified/waterfall/grid/list）、行高 60–240 |
| 左侧栏 | 库切换、All/Trash/Untagged/Uncategorized/History、文件夹树、标签列表 | 库切换 popover（最近库、打开、关闭）；文件夹新建/重命名/删除/子文件夹；拖拽到文件夹移动素材 |
| 中间网格 | `JustifiedGallery` | 虚拟化（TanStack Virtual）、框选、多选（Cmd/Shift）、双击预览、右键菜单、缩略图、拖出、滚动性能优化 |
| 右侧检查器 | `ItemDetailPanel` / `MultiItemInspector` | 单素材：预览、名称重命名、收藏、评分、标签、文件夹、备注、URL、Prompt、元数据、复制路径、Reveal、删除/恢复；多选：批量操作与统计 |
| 预览 | `UnifiedPreviewModal` | 双击 inline / 空格 full-window；上/下一张、Esc 关闭、缩放、图片/视频/GIF/音频/文档；插件预览 |
| 弹层 | `CustomContextMenu`、`DropzoneOverlay`、`FolderPalette`、各种 Dialog | 右键菜单、拖入高亮、文件夹选择、新建/重命名/删除确认 |
| 状态 | 选择队列、活动素材、筛选 URL 状态、拖拽历史 | 选择顺序影响检查器与批量操作 |

### 2.3 侧栏子组件

| 组件 | 能力 |
|---|---|
| `SidebarDirectoryTree.tsx` | 库切换菜单；All/Trash；文件夹递归树；展开/折叠；新建/重命名/删除；拖放目标（根、文件夹、全部）；未分类/未标签虚拟节点 |
| `TagsSidebar.tsx` | 标签列表、计数、选中标签过滤、标签面板开关 |
| `FilterBar.tsx` | 类型、颜色（预设色 + 最近主色）、文件夹、方向、大小、URL、备注、评分；固定/取消固定筛选条件；清除全部 |
| `LibrarySetup.tsx` | 库名、父目录选择、路径预览、创建、打开已有 `.library`、错误提示 |
| `SettingsPage.tsx` | 外观（system/light/dark）、语言（system/en/zh）、快捷键说明、插件管理、网络代理、数据目录、浏览器扩展 API、移动连接（开关、配对码、二维码、地址、允许网段）、日志入口 |
| `LogsPage.tsx` | 日志列表、级别/分类过滤、搜索、清空、Reveal 日志文件 |
| `AppMenuButton.tsx` / `app-menu.ts` | Windows/Linux 自绘应用菜单（macOS 用原生菜单） |
| `useAppShortcuts` / `useHistoryShortcuts` / `useSettingsShortcut` | Cmd/Ctrl+, 设置；Alt+←/→ 历史；Cmd/Ctrl+W 等窗口快捷键；截图全局快捷键在 Go 侧 |
| `useFileDrop` / `DropzoneOverlay` | 外部文件拖入导入、内部素材拖拽、目标高亮 |
| `useTrackpadZoom` | 触控板捏合调整网格行高 |

### 2.4 非 UI 但必须保持的行为

- `mobile_api`（17878，mDNS/WebSocket/配对码）、`asset_server`（41595，缩略图/原图/下载 + Open API）、`api_server`（随 asset server 注册路由）照常启动。
- 深链 `bowerbird://plugin/install`：保留解析与打开设置窗口的动作；因插件 UI 本轮不做，落地为提示与日志。
- 托盘、macOS 应用菜单、三个截图全局快捷键、单实例、关闭主窗口隐藏。
- 主题/语言持久化（`core.GetTheme/SetTheme/GetLanguage/SetLanguage`）与跨窗口刷新。
- 日志（`core.GetLogs/ClearLogs/RevealLogFile`）与实时 `app-log-entry` 事件。

## 3. 功能 → mygo/ui 实现映射

| 现有功能 | native 实现 | 说明 / 自绘部分 |
|---|---|---|
| 主窗口 | `mygo.NewWindow(WindowOptions{Content: ui.View(app.viewMain)})` | 原生标题栏（`TitleBarStyle` 默认），不做自绘交通灯；macOS 菜单栏原生 |
| 三栏布局 | `ui.Split` 两段：左侧栏 / 内容；内容再 `ui.Split`：网格 / 检查器 | 宽度存 `*float32`，可拖动 |
| 左侧栏 | 自绘 `Column` + `Scroll` 行（非 `ui.Sidebar`） | 需要递归文件夹树、展开箭头和拖放目标，`Sidebar` 的 `SidebarItem.Children` 只适合 badge，不适合嵌套树；行自绘 hover/selected/accent |
| 库切换 | `ui.MenuButton` 打开系统菜单，含最近库子菜单 / 打开 / 关闭 / 新建 | 最近库来自 `core.GetRecentLibraries` |
| 文件夹新建/重命名 | `ui.Modal` + `ui.TextInput` | 删除用 `ui.AlertDialog` 确认 |
| 标签列表 | 自绘行 + 计数 badge | 点击切换 tag 过滤 |
| 工具栏 | `ui.Toolbar` + `ui.SearchField` + `ui.MenuButton` + `ui.Button` | 控件过多时 Toolbar 自动溢出到末尾菜单 |
| 筛选 | 一个 `Filters` 菜单按钮（子菜单：类型/颜色/文件夹/方向/大小/URL/备注/评分）+ 活动筛选 chips 行 | `ui.Select` 不适合 8 组筛选同时平铺；菜单更紧凑。颜色用自绘色块 |
| 素材网格 | `ui.GridView(c, &app.grid, len(items), minW, rowH+labelH, cell)` | `GridState.Selection = &app.selection`（`ui.Selection[string]`）支持 Cmd/Shift 多选；`Selected` 记录主选中；`Submitted` 双击打开预览 |
| 瀑布/justified 布局 | 本轮：Grid（固定行高）与 List（单列行）两种；justified/waterfall 列为部分 | 自绘 justified 需要按宽度动态分行，`GridView` 是固定行高；先用可选行高 + 网格近似，报告注明 |
| 行高缩放 | 工具栏 `-` / `+` 按钮，范围 80–240 | 触控板捏合 `ui` 没有直接事件，列为缺口 |
| 缩略图 | `ui.Image(c, bitmap).Fit(Cover).Radius(6)`；未加载时用主色占位 | 见 §4.2 图片管线 |
| 多选 / 框选 | `ui.Selection[string]` + GridView 自带 Cmd/Shift；框选 marquee 未做 | 框选列入后续 |
| 右键菜单 | `Element.ContextMenu(func(m *ui.Menu){...})` | 单素材/多选/空白处三套菜单 |
| 双击/空格预览 | `ui.DialogBase` 全窗口浮层（`Modal`） | 图片 `Fit(Contain)`，左右切图，Esc 关闭，滚轮缩放可后续 |
| 检查器 | 自绘 `Scroll` + 表单控件 | 名称 `EditableText`/`TextInput`、收藏 `Toggle`、评分 `Rating`、标签 `TokenField`、文件夹 `Combobox`、备注/URL `TextArea`/`TextInput`、元数据 `Text` |
| 多选检查器 | 自绘统计 + 批量删除/恢复/加标签 | 复用 `ui.Selection` |
| 导入 | 工具栏 Import → `mygo.Dialog.Open(Multiple)`；后台 `core.ImportFiles` | 进度用 `core` 的 `import-progress` 事件 + `ui.Progress` |
| 拖入 | `Window.OnFileDrop` 兜底 + 侧栏/网格元素 `DroppedFiles()` | 指定文件夹时导入后 `SetItemFolders`；`FileDragOver` 高亮 |
| 拖出 | 单元格 `.DragDataFrom(func() transfer.Data { transfer.FileData(item.FilePath) })` | 系统级拖出，macOS/Windows/Linux 由 mygo 原生实现；失败时 `report` |
| 内部拖拽到文件夹 | 单元格 `.Drag([]string{ids})`，侧栏行 `ui.Drop[[]string]` | 拖到文件夹调用 `MoveItemToFolder`；拖到废纸篓调用 `BatchMoveToTrash` |
| 删除/废纸篓/恢复/清空 | `core.BatchMoveToTrash` / `BatchRestoreFromTrash` / `EmptyTrash` / `PermanentDeleteItem` | 危险操作 `ui.AlertDialog` 二次确认；批量走 goroutine |
| 搜索 | `ui.SearchField` + `core.GetItems(query, sort)` + 本地精细化过滤 | 输入 `Changed` 触发异步重载（带 generation 丢弃过期结果） |
| 排序 | `ui.MenuButton("Sort")`，`ImportedAt asc/desc` | `core.GetItems` 支持 asc/desc |
| 设置窗口 | native Host 拦截 `WindowSpec{Name:"settings"}`，`ui.View(app.viewSettings)` | 左侧 `Sidebar` 导航 + 右侧 `Scroll`；分节同 webview |
| 移动连接 | `core.GetMobileServerStatus` / `SetMobileServerEnabled` / `RegenerateMobilePairingCode` / `GetMobilePairingURL` | 二维码自绘，见 §4.6；允许网段用 `Checkbox` 列表 |
| 二维码 | `rsc.io/qr` 编码 → `image.RGBA`（白底黑块、4 模块静区）→ `ui.NewBitmap` → `ui.Image` | 纯 Go，无 SVG/JS 依赖 |
| Setup 窗口 | native Host 拦截 `setup`，`ui.View(app.viewSetup)` | 创建库、选择目录、打开已有库；成功后 `core` 会自动 `CloseSetupWindow`，主窗口刷新 |
| Logs 窗口 | native Host 拦截 `logs`，`ui.List` 虚拟化日志行 | 实时事件追加；清除/Reveal |
| 应用菜单（macOS） | 复用 `core.AppMenuModel` + `mygo.Menu` / Role | 同 webview 版 |
| 托盘 | `mygo.NewTray`，菜单由 `core.TrayMenuModel` 生成 | 图标运行时绘制（不依赖 assets embed） |
| 全局快捷键 | `mygo.GlobalShortcut.Register("Alt+A/S/W")` | 截图能力复用 `core.Service.Capture*` |
| 深链 | `mygo.App.OnOpenURL` + `OnSecondInstance` 参数兜底 | 解析 `bowerbird://plugin/install`，提示插件本轮不可用 |
| 主题 | 每帧 `c.SetTheme(theme)`；监听 `mygo.Theme.OnUpdated` | system 时用 `mygo.Theme.IsDark()` 选 light/dark 主题；显式 light/dark 用 `ui.LightTheme/DarkTheme` |
| 语言 | `core.GetLanguage`；本地 `en/zh` 文案表 | 不做完整 i18n 资源体系，覆盖 native 界面用到的字符串；系统语言按 `MYGO`/`LANG` 判断 |
| 通知/Toast | `c.Toast` / `mygo.NewNotification` | 导入完成、错误、复制成功 |
| 窗口关闭行为 | 主窗口 `OnClose` + `PreventDefault` + `Hide`；退出时放行 | 与 webview 版一致 |

### 3.1 明确不做 / 降级

- 插件管理页、插件预览、插件安装/市场/深链安装：本轮不做（硬性范围）。
- `<video>`/HLS/DASH/音频播放器：不做应用内播放；视频/音频显示封面与元数据，提供系统播放器打开。
- 浏览器扩展、marketplace、docs：不属于桌面 UI。
- 框选、触控板捏合缩放、justified/waterfall 精确排版：列为后续增强（不影响主路径）。

## 4. 关键技术点结论

### 4.1 状态管理与重渲染粒度

- 采用 **单一 App 状态 + 即时模式视图**：`type App struct` 持有库快照（items/folders/tags/trashCount）、筛选条件、选择、检查器字段、窗口引用、缩略图缓存、设置草稿等；每个窗口一个 `ui.View(func(c *ui.Context))`，每个输入事件后重建整棵视图。
- 重建粒度是**窗口级**，但成本由虚拟化控制：`GridView`/`List` 只构建可见 cell，37k 素材的网格每帧只构建约 100–200 个 cell；侧栏/工具栏构建固定数量控件。mygo 官方基准显示百万行 List 的可见帧约 14.5µs，因此窗口级重建可接受。
- 后台数据（SQLite/导入/HTTP）在 goroutine 完成，通过 `win.Update(func(){ ... })` 回主线程改状态并重绘；不在后台读写 UI 字段。用 generation 计数丢弃过期加载结果。
- 视图状态（滚动位置、展开、选择）由 `ui` 的 element key / `GridState` / `ListState` 保持；App 只保存模型状态。
- 事件：`core.Host.Emit` 在 native Host 中收敛为 `app.onCoreEvent`，对 `library-opened/closed`、`library-items-*`、`import-*`、`app-log-entry` 等做合并刷新；不需要 webview 时代的跨进程事件总线。

### 4.2 图片管线

结论：**直读本地文件，不走 asset_server HTTP**。理由：native 进程与 core 同进程，HTTP 只会多一次 loopback 拷贝与延迟；`Item.ItemPath` 已给出 `<lib>/items/<ID>`，`thumbnail.jpg` 是导入时生成的统一缩略图。

- 缩略图候选顺序：
  1. `<item.ItemPath>/thumbnail.jpg`（core 生成，通常 512–1024px）；
  2. 原图 `item.FilePath`（仅图片且文件小于阈值，如 8MB）；
  3. 主色/调色板占位块 + 扩展名文字。
- 解码与尺寸：后台 worker 池（并发 4）读文件 → `image.Decode`（注册 jpeg/png/gif/webp/bmp）→ 按目标显示尺寸的 2×（Retina）做 `draw.CatmullRom`/`ApproxBiLinear` 降采样，目标高度按网格行高分桶（128/192/256/384/512/768/1024），避免为每像素级行高重复解码。
- 主线程只做 `ui.NewBitmap(img)`（纹理上传）并写入缓存；缓存按 `itemID@bucket` 键，LRU 上限约 400 项；库切换/筛选大变动时可整体失效。
- 预览大图单独缓存（上限 6）：读原图，最长边限制到 4096 或屏幕 2×，避免超大图爆内存；动画 GIF 用 `image/gif` 全帧 + `Bitmap.Update`，以帧延时驱动（本轮先静态首帧，动画作为可选增强）。
- 视频：`thumbnail.jpg` 若存在则作为封面；不存在显示主色块 + 扩展名。预览不播放，提供 `OpenWithDefaultApp`。
- 并发注意：`ui.Bitmap` 的创建/更新只在主线程；解码/缩放只在后台。

### 4.3 虚拟化网格 API

- 使用 `ui.GridView(c, &app.grid, n, minWidth, height, func(i int){...})`：
  - `minWidth` 随行高变化（约 `rowH*1.25`），列数由可用宽度自动计算；
  - `height` = 行高 + 标签区高度；
  - `GridState.Key` 返回 `items[i].ID`，保证选择/焦点跟随素材；
  - `GridState.Selected = &app.selectedIndex`，`GridState.Selection = &app.selection`；
  - `GridState.Label` 返回文件名，支持首字母定位与无障碍；
  - 双击/Enter 用 `.Submitted()`；右键用每个 cell 的 `.ContextMenu`。
- 单列 List 模式用 `ui.List` + `ListState`（同样虚拟化），行内展示缩略图、名称、大小、类型、标签。
- 滚动位置由 `GridState` 内部保持；筛选变化时若列表长度骤变，可 `ScrollTo(0, ui.Start)`。

### 4.4 拖入 / 拖出

- **拖入**：`Window.OnFileDrop` 作为兜底（导入到当前文件夹）；元素级 `DroppedFiles()` 用于侧栏文件夹行、网格空白区、检查器，`FileDragOver()` 做高亮。macOS 上通过 `OnFileDrop` 的 X/Y 不再需要 DOM 命中测试（native 元素自己就是目标）。
- **拖出**：`Element.DragDataFrom(func() transfer.Data { return transfer.FileData(paths...) }, transfer.DragOptions{Done: ...})`，由 mygo 调用系统拖拽会话；素材文件路径为 `item.FilePath`。只读操作，不需要 core 的 `StartDragItems`。
- **内部拖拽**：cell 同时 `.Drag([]string{item.ID,...})`；侧栏文件夹行/废纸篓用 `ui.Drop[[]string]` / `ui.DragOver[[]string]` 接收并调用 `MoveItemToFolder` / `BatchMoveToTrash`。内部拖拽与系统拖出可以并存（文档明确支持 `Drag` + `DragData`）。
- 限制：跨窗口内部拖拽在同一进程可用；拖到其他应用为文件复制；不做「拖出后删除源」的 move 语义（系统默认 copy）。

### 4.5 文本输入 / 快捷键 / 焦点

- 搜索用 `ui.SearchField`；重命名/设置用 `ui.TextInput`；备注/Prompt 用 `ui.TextArea`；标签用 `ui.TokenField`；长文本自动换行。
- 快捷键：`c.Shortcut(ui.Cmd, ui.KeyF)` 聚焦搜索（`ui.Handle.Focus()`）、`Cmd+,` 设置、`Cmd+B` 侧栏、`Cmd+I` 检查器、`Space` 预览、`Delete/Backspace` 移入废纸篓、`Esc` 关预览/清筛选。文本输入获得焦点时编辑键优先，符合 native 习惯。
- 焦点：搜索框、网格、检查器字段用 `ui.Handle`/`FocusBind`；弹窗 `Modal` 自动锁定焦点，Esc/点击外部关闭；Tab 顺序由构建顺序决定。
- 网格多选：`ui.Selection[string]` + `GridState` 的 Cmd/Shift 语义；右键未选中项先选中（mygo Grid 默认行为）。

### 4.6 二维码绘制

结论：**纯 Go 生成位图，不用 HTML/SVG**。

1. 使用 `rsc.io/qr` 的源码副本（Russ Cox，BSD；放在 `internal/qr`，因为沙箱不能写 Go module 缓存，`go get` 被拒）把 `core.GetMobilePairingURL()` 的 `bowerbird://pair?data=...` 编码为 QR（ECC level M）。
2. 取 `code.Size`（模块数），加 4 模块静区；`image.NewRGBA` 白底，按整数倍 `scale = max(4, targetPx/(size+8))` 画黑块；黑块之间留 0 间隙（QR 标准）。
3. `ui.NewBitmap(rgba)` 后在设置页 `ui.Image(c, bmp).Size(220,220).Pixelated()` 显示。`Pixelated` 保证缩放时模块边缘清晰。
4. 配对码/URL 变化时重新生成（缓存按 URL 字符串）；提供「复制配对 URL」按钮。

## 5. 分阶段实施顺序与验收点

### 阶段 1：可运行的 native 主界面（必须达成）

实现：
- `cmd/bowerbird-native/main.go` 入口 + `internal/nativeui` 包。
- native Host（窗口注册、Emit、OpenWindow、对话框、剪贴板、主线程、原生句柄）。
- `core.NewLibraryManager` + `AttachManager` + `SetHost`，asset/mobile/api 服务随启动。
- 主窗口三栏骨架：侧栏（库/虚拟节点/文件夹/标签/废纸篓）+ 工具栏（搜索/筛选/排序/导入）+ 网格（真实 core 数据 + 真实缩略图 + 虚拟化滚动）。
- 窗口/托盘/菜单/快捷键/深链的骨架（不要求全部交互完善）。

验收：
- `CGO_ENABLED=1 go build ./...` 通过；`go build ./cmd/bowerbird-native` 产出可执行文件。
- 启动后能恢复真实库，网格显示真实素材缩略图，滚动流畅；侧栏文件夹/标签计数来自 core。
- 日志出现 asset server / mobile server 端口；无 panic。

### 阶段 2：主路径交互

实现：
- 素材详情/检查器（名称、收藏、评分、标签、文件夹、备注、URL、元数据）。
- 全窗口预览（图片/视频封面/其他类型降级）、左右切换、Esc。
- 导入（文件选择 + 拖入，含文件夹目标）、删除/废纸篓/恢复/清空/永久删除。
- 筛选（类型/颜色/文件夹/方向/大小/URL/备注/评分）与搜索、排序真正生效。
- 多选与批量操作；右键菜单；拖出到系统；内部拖到文件夹/废纸篓。
- 新建/重命名/删除文件夹，新建/删除标签（检查器内）。

验收：上述交互逐项可用；筛选/搜索改变网格内容；导入后网格与计数刷新；构建通过。

### 阶段 3：设置、移动连接、窗口与壳

实现：
- Settings 窗口：外观/语言/快捷键说明/插件缺口说明/网络代理/数据目录/扩展 API/移动连接。
- 移动连接：状态、开关、配对码、重新生成、配对 URL、二维码、地址、允许网段。
- Logs 窗口（实时日志、清空、Reveal）。
- Setup 窗口（创建/打开库）。
- 应用菜单、托盘、全局截图快捷键、深链、主题/语言广播。
- 库创建/切换/关闭。

验收：每个窗口可开可关；设置持久化并即时生效；二维码可被手机扫描（用系统相机/解码工具抽查）；构建通过。

### 阶段 4：验证与报告

- `CGO_ENABLED=1 go build ./...`、`go build ./cmd/bowerbird-native`、`go vet`/`gofmt`。
- 原生 vs webview 粗测：启动耗时（进程启动 → 首帧日志；webview 用同口径可得的最早窗口/日志时间，注明误差）、空载 RSS（同一库、同一临时 user data、启动 4s 后 `ru_maxrss`）。
- 写 `reports/mygo-native实施报告.md`：完成度表、性能数据与测法、已知缺口（插件/视频/框选/justified/触控板缩放等）、后续路线。

## 6. 目录与构建

```
cmd/bowerbird-native/main.go      # native 入口（独立，不动 main_mygo.go）
internal/nativeui/
  app.go            # App 状态、加载、动作
  host.go           # core.Host 的 native 实现
  view_main.go      # 主窗口三栏
  view_sidebar.go   # 侧栏/文件夹树/标签
  view_grid.go      # 网格/列表 cell
  view_detail.go    # 检查器
  view_preview.go   # 预览浮层
  view_setup.go     # Setup 窗口
  view_settings.go  # Settings 窗口（含二维码）
  view_logs.go      # Logs 窗口
  menus.go          # 应用菜单/托盘
  images.go         # 缩略图/预览图缓存
  qr.go             # 二维码位图
  i18n.go           # en/zh 文案
  util.go           # 筛选/格式化/颜色距离
internal/qr/        # rsc.io/qr 源码副本（BSD），二维码编码
```

构建：
```sh
export PATH=/opt/homebrew/bin:$HOME/.bun/bin:$HOME/.local/share/vite-plus/bin:$HOME/go/bin:$PATH
export GOPROXY=https://goproxy.cn,direct
CGO_ENABLED=1 go build ./...
CGO_ENABLED=1 go build -o build/bin/bowerbird-native ./cmd/bowerbird-native
```

不改 `main_mygo.go`、`frontend/`、`mobile/`；不 commit/push。
