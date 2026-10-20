# Bowerbird 桌面端 mygo 迁移方案

> 实验分支：`experiment/desktop-mygo`（基线 `feature/mobile-v3` 尖端 `5873397`）
> 参考实现：`/Volumes/Kidd/projects/code/mygo-ref`（github.com/egoist/mygo，Go 1.27+）
> 本轮目标：用 mygo 的 **webview 模式**承载桌面端全部功能，验证可行性；不合主线、不 push。

## 1. 结论摘要

- 现桌面端是“薄 Wails 壳 + 重 React 前端 + 纯 Go core”。Wails 只承担进程入口、窗口/菜单/托盘、事件总线、对话框、拖拽和少量原生桥；`core` 里 90% 以上是库、素材、SQLite、HTTP 服务、插件、移动端 API 等与框架无关的逻辑。
- mygo 的能力面与 Wails 高度重叠：webview 窗口、`Bind` 生成类型化 TS 客户端、类型化/任意事件、菜单、托盘、对话框、全局快捷键、单实例、深链、剪贴板、`OnFileDrop`、嵌入前端、`mygo build` 打包。主要缺口是 **网页内拖出（native drag-out）**、Wails 特有的窗口缩放/DevTools JS API、以及 Wails 的 drop target 属性。
- 迁移策略：**保留 core 业务代码，抽掉框架类型**。新增 `core.Host` 接口承接事件、窗口、对话框、剪贴板、主线程与原生句柄；新入口 `main.go` 用 mygo 实现 Host。前端增加一层“Wails 形状”的适配器，复用现有 28 个文件里的 import 路径与调用方式，底层走 `mygo generate` 产出的客户端。
- 风险集中在三处：macOS 拖出依赖的 WKWebView 私有 hook（cgo）、Windows OLE 拖出依赖 Wails `w32`、以及现有 `frontend/dist` 嵌入方式与 mygo 打包方式的对齐。前两项按“能平移则平移，不能则列缺口”处理。

## 2. mygo 关键事实（本轮依赖）

| 能力 | mygo 做法 | 对 Bowerbird 的意义 |
|---|---|---|
| 应用入口 | `mygo.Bind(...)` → `App.WhenReady` → `NewWindow` → `App.Run` | 取代 `application.New` + `app.Run` |
| 前端加载 | dev 用 `mygo.config.ts` 的 `devUrl`/`devCommand`；prod 由 `mygo build` 把 `frontendDist` 嵌入 | 取代 `//go:embed frontend/dist` + `AssetFileServerFS` |
| Go→JS 调用 | `mygo.Bind` 生成 `src/mygo.ts`，方法名 lowerCamel，服务名取类型名 | `*core.Service` → `Service.getActiveLibrary()` 等 |
| 事件 | `mygo.NewEvent[T](name)` + `Emit/Broadcast`；前端 `on(name)` / 生成 `events.*` | 取代 Wails `app.Event.Emit` / `Events.On` |
| 窗口 | `WindowOptions`（Title/URL/Width/Height/Min/Max/TitleBarStyle/BackgroundColor…） | 主窗口、Setup/Settings/Logs 多窗口 |
| 菜单 | `mygo.Menu`/`MenuItem`，角色（RoleAppMenu/EditMenu/Quit/ToggleFullScreen…） | macOS 原生菜单栏与托盘菜单 |
| 托盘 | `mygo.NewTray(TrayOptions)` | 现有 tray + 双击显示主窗口 |
| 对话框 | `Dialog.Open`（支持 `Directory`/`Multiple`/`CreateDirectories`）、`Dialog.Save` | `SelectDirectory` / `SelectLibraryDialog` |
| 剪贴板 | `Clipboard.WriteFiles` / `ReadFiles` / `WriteText` 等 | 取代 macOS cgo 文件剪贴板实现 |
| 文件拖入 | `Window.OnFileDrop`（paths + x/y），页面仍保留 HTML5 DnD | 取代 Wails `WindowFilesDropped` |
| 单实例/深链 | `RequestSingleInstanceLock`、`OnSecondInstance`、`OnOpenURL` | `bowerbird://plugin/install` |
| 全局快捷键 | `GlobalShortcut.Register("OptionOrAlt+A", ...)` | 截图三快捷键 |
| 主线程/原生句柄 | `mygo.RunOnMain`、`Window.NativeHandle()` | macOS 拖出 hook、Windows OLE |
| 构建 | `go tool mygo dev/build/generate`，`CGO_ENABLED` 默认 0 | 打包与 TS 生成 |

mygo 的线程模型：绑定方法在各自 goroutine 执行、可阻塞；事件/菜单/窗口回调在主线程；`RunOnMain` 可回主线程。这与 Wails 的 service 方法模型基本一致，`core` 里现有的后台 goroutine + 事件广播无需改写。

## 3. 现桌面端功能盘点

### 3.1 入口与原生壳（`main.go`）

| 现实现 | 说明 |
|---|---|
| `application.New` + Services（`GreetService`、`*core.Service`） | 前端 RPC 面 |
| 主窗口 1280×800、min 900×600、`EnableFileDrop`、macOS `HiddenInset` + 半透明背景 | 主界面 |
| 关闭主窗口改为 `Hide` | 托盘/菜单栏常驻 |
| 系统托盘 + 托盘菜单 + 双击显示 | 截图、显示主窗口、设置、退出 |
| macOS 原生应用菜单（`core.BuildNativeAppMenu`） | 截图、设置、日志、关于、退出 |
| 全局快捷键 `OptionOrAlt+A/S/W` | 区域/全屏/窗口截图 |
| `bowerbird://plugin/install` 深链 | 参数解析后触发插件安装并打开设置窗口 |
| `WindowFilesDropped` | 内部素材移动、文件夹导入、外部文件导入、目标文件夹/废纸篓路由 |
| `app.Event.On("language-changed")` | 刷新托盘菜单本地化 |

### 3.2 core 文件职责

| 文件 | 职责 | 框架耦合 |
|---|---|---|
| `library.go` | 库生命周期、SQLite schema/index、素材 CRUD、导入/缩略图、文件夹/标签、缓存、回收站、路径补全（57 个方法） | `app *application.App`、`window application.Window`、5 处 `app.Event.Emit` |
| `service.go` | 前端 RPC 面（77 个方法），参数校验/错误包装/对话框/导入进度 | `app *application.App`、`OpenFile` 对话框、事件 |
| `appmenu.go` | 菜单模型 + macOS 原生菜单 + 托盘菜单 | `application.Menu` / `MenuItem` / `Context` |
| `setup.go` | 库设置窗口（单例） | `application.Window` |
| `settings.go` | 主题/语言设置、设置窗口（单例） | `application.Window`、事件 |
| `logs.go` | 结构化日志环形缓冲、日志窗口（单例）、实时广播 | `application.App`、`Window` |
| `plugins.go` | 插件 manifest/安装/卸载/启停/升级/扫描、`plugin:changed` 事件 | `application.App`（仅事件） |
| `api_server.go` | 本地 HTTP API（浏览器扩展/自动化） | 无 |
| `asset_server.go` | 缩略图/原文件/下载流 HTTP 服务 | 无 |
| `mobile_api.go` | 17878 端口 LAN API、mDNS、WebSocket、配对码 | 无 |
| `user_data.go` | `~/Library/Application Support/bowerbird/user_data.json` | 无 |
| `network.go` / `network_*.go` | 代理设置、连通性测试 | 无 |
| `screenshot.go` / `sysicon_*.go` | 截图调度、系统文件图标 | 仅取窗口 Focus |
| `drag_darwin.go` | WKWebView 拖出 pasteboard 注入、文件剪贴板（cgo） | `application.InvokeSync`、`NativeWindow()` |
| `drag_windows.go` | OLE `DoDragDrop` + `CF_HDROP` 拖出、剪贴板（cgo/syscall） | `application.InvokeSync`、Wails `w32` |
| `drag_other.go` | 其他平台降级 + 文件剪贴板 | `app.Clipboard` |
| `drag_debug.go` | 拖拽 trace 文件 | 无 |
| `color_extractor.go` / `media_sniffer.go` | 主色/Palette/EXIF、MIME 嗅探 | 无 |
| `videothumb_*.go` | macOS 原生视频封面 | 无（cgo） |
| `models.go` / `errors.go` | DTO 与错误码 | 无 |

### 3.3 `Service` 暴露的方法（96 个）

- 库：`GetActiveLibrary`、`CreateLibrary`、`OpenLibrary`、`CloseLibrary`、`GetRecentLibraries`
- 素材：`GetItems`、`GetItem`、`ImportFiles`、`ImportFromBase64(WithOptions)`、`ImportFromURL(WithOptions)`、`ImportFolderRecursively`、`ImportFoldersRecursively`、`DeleteItem`、`PermanentDeleteItem`、`MoveToTrash`、`BatchMoveToTrash`、`RestoreFromTrash`、`BatchRestoreFromTrash`、`EmptyTrash`、`GetTrashItems`、`GetTrashCount`、`RenameItem`、`UpdateItemDetails`、`ToggleFavorite`、`SaveItemThumbnail`、`OpenWithDefaultApp`、`RevealInFinder`
- 文件夹：`GetFolders`、`CreateFolder`、`RenameFolder`、`DeleteFolder`、`AddItemToFolder`、`RemoveItemFromFolder`、`SetItemFolders`、`MoveItemToFolder`
- 标签：`GetTags`、`CreateTag`、`DeleteTag`、`AddTagToItem`、`RemoveTagFromItem`、`SetItemTags`
- 原生：`SelectDirectory`、`SelectLibraryDialog`、`StartDragItems`、`CopyItemsToClipboard`、`OpenExternalURL`、`OpenFolder`、`OpenUserDataFolder`、`OpenPluginsFolder`、`GetUserDataDir`、`GetPluginsDir`
- 窗口：`OpenSetupWindow`、`CloseSetupWindow`、`OpenSettingsWindow`、`OpenLogsWindow`、`GetAppMenu`、`InvokeAppMenu`
- 主题/语言：`GetTheme`、`SetTheme`、`GetLanguage`、`SetLanguage`
- 日志：`GetLogs`、`ClearLogs`、`GetLogFilePath`、`AppendFrontendLog`、`RevealLogFile`、`LogDragTrace`
- 截图：`CaptureScreen`、`CaptureArea`、`CaptureFullscreen`、`CaptureWindow`
- 网络：`GetNetworkSettings`、`SetNetworkSettings`、`TestNetworkConnection`
- 移动端：`GetMobileServerStatus`、`SetMobileServerEnabled`、`RegenerateMobilePairingCode`、`GetMobilePairingCode`、`GetMobilePairingURL`、`SetMobileAllowedNetworks`
- 插件：`ListInstalledPlugins`、`ScanLocalPlugins`、`GetPendingPluginInstall`、`ClearPendingPluginInstall`、`InstallPluginFromURL`、`InstallPlugin`、`UninstallPlugin`、`SetPluginEnabled`、`CheckPluginUpdates`、`UpgradePlugin`、`OpenMarketplace`
- 端口：`GetAssetServerPort`、`GetAPIServerPort`

### 3.4 前端对 Wails 的使用点

**生成的 bindings（28 个文件）**：`frontend/bindings/bowerbird/core/service.ts` 的 70 个自由函数，以及 `models.ts` 的 DTO 类型。集中在路由、库上下文、工作区、设置、日志、侧栏、导入 hook、插件安装/预览、菜单、剪贴板、拖拽。

**运行时 API（10 处）**：

| 模块 | 用法 |
|---|---|
| `@wailsio/runtime` `Events` | `plugins/preview/remote-loader.ts`、`i18n.ts`、`theme-provider.tsx`、`LogsPage.tsx`、`SettingsPage.tsx`、`PluginInstallDialog.tsx`、`useFileDrop.ts`、`library-context.tsx` |
| `Clipboard.SetText` | `lib/clipboard.ts` |
| `Window.*` | `lib/app-menu.ts`：Reload/ForceReload/ToggleFullscreen/OpenDevTools/Close/ZoomIn/Out/Reset |

**事件（17 个 `Events.On`）**：`theme-changed`、`language-changed`、`library-opened`、`library-closed`、`app-log-entry`、`app-logs-cleared`、`network-settings-changed`、`plugin:install-requested`、`plugin:changed`、`import-started/progress/completed/error`、`library-items-upserted/trashed/updated`。

**Wails 宿主标记**：`useFileDrop.ts` 的 `window._wails.flags.enableFileDrop`，`LibraryWorkspace.tsx` 的同名判断；用于避免原生 drop 与 DOM drop 重复导入。

**窗口拖拽 CSS**：`index.css` 与大量组件使用 `--wails-draggable` / `-webkit-app-region` 和 `.wails-drag/.wails-no-drag`。

## 4. 功能映射表

难度：★ 直接对应，★★ 需要适配，★★★ 有实质缺口。

| 功能 | 现实现 | mygo 实现方式 | 难度/风险 |
|---|---|---|---|
| 应用启动/退出 | `application.New`/`Run` | `mygo.App.WhenReady` + `App.Run` | ★ |
| 主窗口 | `WebviewWindowOptions` | `mygo.WindowOptions`（Title/尺寸/Min/TitleBarHiddenInset/BackgroundColor） | ★ |
| 关闭主窗口隐藏 | `WindowClosing` hook + `Cancel` | `win.OnClose` + `PreventDefault` + `Hide` | ★ |
| 多窗口（Setup/Settings/Logs） | `app.Window.NewWithOptions` + `GetByName` | Host 窗口注册表 + `mygo.NewWindow`；按 name 复用 | ★★ |
| 前端 dev/prod | Vite + Wails assets | `mygo.config.ts` `devUrl`/`devCommand`/`frontendDist`；`mygo build` 嵌入 | ★ |
| Service RPC | Wails 自动绑定 | `mygo.Bind(&core.Service{})` + `mygo generate` | ★ |
| 事件总线 | `app.Event.Emit` | `Host.Emit` → `mygo.Event[any].Broadcast` | ★★ |
| 前端事件订阅 | `Events.On` | 适配器 `on(name, p => cb({data:p}))` | ★★ |
| 文件/目录选择对话框 | `app.Dialog.OpenFile()` | Host → `mygo.Dialog.Open`（Directory/CreateDirectories） | ★ |
| macOS 应用菜单 | `BuildNativeAppMenu` | 中立菜单模型 → `mygo.Menu` + Role | ★★ |
| 托盘 + 托盘菜单 | `SystemTray` | `mygo.NewTray` + `SetMenu`；双击用 `OnClick`（无双击 API） | ★★ |
| 全局快捷键 | `GlobalShortcut.Register` | `mygo.GlobalShortcut.Register` | ★ |
| 单实例 | Wails 默认 | `RequestSingleInstanceLock` + `OnSecondInstance` 聚焦主窗口 | ★ |
| 深链 `bowerbird://` | `ApplicationLaunchedWithUrl` + os.Args | `mygo.config.ts` `urlSchemes` + `OnOpenURL`；启动参数兜底 | ★ |
| 文件拖入（外部文件/文件夹） | `WindowFilesDropped` + drop target 属性 | `Window.OnFileDrop` + `Eval(elementFromPoint)` 解析 `data-file-drop-target`/`data-folder-id` → `HandleNativeDrop` | ★★ 目标解析需异步/坐标 |
| 内部素材拖拽移动 | 前端 HTML5 DnD + Go 方法 | 不变 | ★ |
| 素材拖出到 Finder/桌面 | macOS WKWebView pasteboard hook；Windows OLE | macOS 保留 cgo hook，改用 Host 的 `RunOnMain`/`NativeWindowHandle`；Windows OLE 保留但需替换 Wails `w32` | ★★★ macOS 依赖 WKWebView 内部行为；Windows 需自写 COM 类型 |
| 复制素材文件到剪贴板 | macOS/Windows cgo、其他平台 Wails Clipboard | Host `WriteFilesToClipboard` → `mygo.Clipboard.WriteFiles`（纯 Go） | ★ |
| 文本复制 | `Clipboard.SetText` | Host `WriteTextToClipboard` 或适配器走 `navigator.clipboard` | ★ |
| 窗口控制（全屏/关闭） | `Window.ToggleFullscreen/Close` | `mygo-runtime` `currentWindow` | ★ |
| 窗口缩放/DevTools | `Window.ZoomIn/Out/Reset/OpenDevTools` | Go 服务方法 + `CallerWindow(ctx).Page().SetZoomFactor/ToggleDevTools` | ★★ |
| 页面重载 | `Window.Reload/ForceReload` | `location.reload()`（强刷可加 cache-bust） | ★ |
| 库列表/创建/切换/恢复 | `LibraryManager` + SQLite | 不变，Host 只换事件/窗口 | ★ |
| 素材分页网格/详情 | 前端 `GetItems/GetItem` + asset server | 不变 | ★ |
| 文件夹/标签/颜色筛选 | 前端 + `GetFolders/GetTags` + 素材 palette | 不变 | ★ |
| 删除/废纸篓/恢复/清空 | `LibraryManager` | 不变 | ★ |
| 设置页（主题/语言/网络/移动端/插件） | `Service` 方法 + 事件 | 不变，事件走 Host | ★ |
| 移动连接（配对码/二维码/网络） | `mobile_api.go` 17878 + mDNS | 不变；入口在 `WhenReady` 中启动 | ★ |
| 素材 HTTP 服务 | `asset_server.go` | 不变 | ★ |
| 本地 API | `api_server.go` | 不变 | ★ |
| 插件系统 | `plugins.go` 纯 Go + 前端 JS runtime + 事件 | 平移；`SetApp` → `SetHost`；`plugin:changed` 走 Host | ★★ |
| 截图三模式 | `screenshot.go` + 全局快捷键/菜单 | 不变；窗口 Focus 走 Host | ★ |
| 日志窗口/实时日志 | `logs.go` + `app-log-entry` | Host 事件 + 窗口注册表 | ★ |
| 网络代理设置 | `network.go` | 不变 | ★ |
| 主题/语言广播 | `app.Event.Emit` | Host 事件 | ★ |
| `bowerbird://` 插件安装 | 解析 + `plugin:install-requested` | 同深链 + Host 事件 | ★ |
| 应用图标 | `appIcon` embed | 同一 PNG 传给 `WindowOptions`/`Tray`/`mygo build` 资源 | ★ |
| 打包 | `wails3 build` / Taskfile | `mygo build`（.app/.dmg）+ 现有 build 资源迁移 | ★★ 需要重做打包脚本 |

## 5. 架构决策

### 5.1 入口拆分

- 新增 `main.go`：mygo 入口，默认构建。
- 原 `main.go` 改名为 `main_wails.go`，加 `//go:build wails_legacy`，作为旧实现留档；默认不参与编译，`-tags wails_legacy` 可回看。旧 Wails 专用适配文件同样加该 tag。
- `go build ./...` 默认只编译 mygo 入口；`core` 不再 import Wails。

### 5.2 `core.Host`：框架无关的宿主接口

新增 `core/host.go`：

```go
type Host interface {
    Emit(name string, payload any)
    OpenWindow(spec WindowSpec) error
    FocusWindow(name string) bool
    CloseWindow(name string)
    FocusMainWindow()
    OpenDirectory(title string) (string, error)
    ShowAbout()
    Quit()
    RunOnMain(fn func())
    NativeWindowHandle() uintptr
    WriteFilesToClipboard(paths []string) error
    WriteTextToClipboard(text string) error
}
```

- `LibraryManager` 用 `host Host` 取代 `app *application.App` + `window application.Window`。
- `Service` 用 `host Host` 取代 `getApp()`；对话框、窗口、菜单动作都走 Host。
- `PluginManager` 用 `SetHost` 取代 `SetApp`，只保留事件发射。
- `logs.go` 的全局 `logAppRef` 改成 `logHost`（互斥保护），`SetLogHost`。
- `appmenu.go` 只保留中立模型：`AppMenuModel`、`NativeAppMenuModel`、`TrayMenuModel`（Label/Action/Role/Accelerator/Submenu/Separator），不再引用 Wails 类型。
- 平台拖拽文件里仅剩的 `application.InvokeSync`/`NativeWindow()` 改为 `host.RunOnMain`/`host.NativeWindowHandle()`。
- 为兼容旧测试/旧调用，保留 `SetHost` 的 nil 安全分支；所有 `host` 调用前判空。

### 5.3 新入口里的 mygo Host

`main.go` 负责：

1. `RequestSingleInstanceLock`，第二实例转发命令行后退出。
2. `mygo.Bind(&GreetService{})`、`mygo.Bind(coreService)`；`coreService` 先以 nil manager 创建，避免 `mygo generate` 时启动数据库/HTTP 服务。
3. `WhenReady` 中：
   - `core.NewLibraryManager()`（内部启动 asset/mobile server、恢复上次库）
   - `core.AttachHost(coreService, host)`、`coreMgr.SetHost(host)`、`coreMgr.SetManager`
   - 创建主窗口，注册 `OnClose` 隐藏
   - 创建托盘、原生菜单、全局快捷键
   - 注册 `OnFileDrop`、`OnOpenURL`
4. `App.Run()`。

Host 窗口注册表：`map[string]*mygo.Window` + mutex；`OpenWindow` 若已存在则 Show/Focus；`CloseWindow` 关闭并移除。窗口 URL 统一 `/<route>`，前端仍用 hash 路由（`/#/settings`），mygo 会保留 fragment。

事件：Host 维护 `map[string]*mygo.Event[any]`，`Emit` 时按名懒创建并 `Broadcast`。这样无需为 20 多个事件逐一声明，同时前端仍可按名订阅；生成的客户端只包含静态声明的事件（本方案不在 TS 侧依赖 `events.*`）。

### 5.4 前端适配层

新增/替换：

- 保留 `frontend/src/bindings/bowerbird/core/service.ts` 路径，内容改为适配器：`import { Service } from "../../../mygo"`，把 `Service.getActiveLibrary` 等映射为原自由函数名（`GetActiveLibrary` 等），返回 `Promise`。
- `models.ts` 改为从 `../../../mygo` re-export 类型（`Item`、`Folder`、`Tag`、`LibraryInfo`、`AppMenuItem`、`LogEntry`、`NetworkSettings`、`PluginUpdateInfo` 等）。
- `frontend/src/lib/wails-runtime.ts`：实现 `Events.On/Once`（包装 `{data: payload}`）、`Clipboard.SetText`、`Window` 控制；把 10 处 `@wailsio/runtime` import 改成这个模块。
- `useFileDrop.ts` / `LibraryWorkspace.tsx` 的 `_wails.flags.enableFileDrop` 判断改为 `hostReceivesFileDrops()`：`window.mygo` 存在即视为原生 drop 可用。
- `index.css` 增加 `--app-region` 映射（`.wails-drag { --app-region: drag }`，`.wails-no-drag { --app-region: no-drag }`），保留原有 `-webkit-app-region` 以兼容旧壳。
- `vite.config.ts` 去掉 `@wailsio/runtime/plugins/vite`。

适配器只做“名称 + 事件形状”的翻译，不复制业务逻辑；后续可逐步把调用点改成 `Service.*`，但不作为本轮目标。

### 5.5 原生 drop 路由

Wails 的 `DropTargetDetails` 提供 `data-file-drop-target` / `data-folder-id`，mygo 只给 paths + x/y。方案：

1. `win.OnFileDrop` 拿到 paths/x/y。
2. 在主线程用 `win.Page().Eval` 执行：
   ```js
   const el = document.elementFromPoint(x, y)?.closest("[data-file-drop-target]");
   return {target: el?.dataset.fileDropTarget || "", folderId: el?.dataset.folderId || ""}
   ```
3. 调 `coreService.HandleNativeDrop(paths, target, folderId)`，把旧 `main.go` 的路由分支（内部素材/文件夹/废纸篓/全部/子文件夹/主工作区）原样搬进 core。
4. `HandleNativeDrop` 内部起 goroutine，沿用 `ImportFilesWithProgress` / `ImportFoldersRecursivelyWithProgress` 与 `Host.Emit`。

这样既保留“拖到侧栏文件夹/废纸篓/子文件夹卡片”的行为，也保留导入进度事件。

### 5.6 拖出与剪贴板

- 复制文件：统一走 `Host.WriteFilesToClipboard`。mygo 宿主用 `mygo.Clipboard.WriteFiles(paths)`，是纯 Go 实现，替换 macOS/Windows 的 cgo 剪贴板代码；旧 cgo 实现保留在 legacy 分支。
- macOS 拖出：保留 `drag_darwin.go` 的 WKWebView pasteboard hook，`StartDragItems` 用 `Host.RunOnMain` + `Host.NativeWindowHandle()` 调 `doNativeFileDrag`。这是“平移”而非重写；若 mygo 的 WKWebView 类替换导致 hook 失效，列为缺口。
- Windows 拖出：保留 `drag_windows.go` 的 OLE 逻辑，去掉 `application.InvokeSync`，改用 Host；`w32.ComProc`/`w32.IDataObject` 需要自写 syscall 版本，本轮不强行完成，列为已知缺口（Windows 不在本机验证范围）。
- Linux：沿用 `drag_other.go` 的“不支持”降级。

### 5.7 打包与配置

新增根目录 `mygo.config.ts`：

```ts
export default defineConfig({
  name: "Bowerbird",
  identifier: "io.github.owocc.bowerbird",
  version: "1.0.0-alpha-1",
  copyright: "© 2026, owocc",
  devUrl: "http://127.0.0.1:9245",
  devCommand: "pnpm --filter bowerbird dev",
  buildCommand: "pnpm --filter bowerbird build",
  frontendDist: "frontend/dist",
  bindings: "frontend/src/mygo.ts",
  out: "build/mygo",
  urlSchemes: ["bowerbird"],
  icon: "assets/branding/app-icon.png",
});
```

- `mygo dev` 用 Vite 9245 端口；`mygo build` 跑 `tsc && vite build` 并嵌入 `frontend/dist`。
- `main.go` 仍可用 `//go:embed all:frontend/dist` + `mygo.SetFrontend` 保证 `go run .` 也能加载前端；`mygo build` 的嵌入作为正式路径。
- cgo：现有 macOS `drag_darwin.go`/`sysicon_darwin.go`/`videothumb_darwin.go` 使用 cgo，mygo CLI 默认 `CGO_ENABLED=0`。开发/构建命令显式 `CGO_ENABLED=1`；同时保留 `go build ./...`（宿主默认 cgo=1）作为验证。若要求纯 Go，需要为这三个文件补 `!cgo` 降级实现（本轮不改原生能力）。
- Go 依赖：`github.com/egoist/mygo v0.5.5`（与 npm `mygo-runtime@0.5.5` 对齐）；CLI 用 `go tool mygo`（go.mod `tool`）或 `go run github.com/egoist/mygo/cmd/mygo@v0.5.5`，避免依赖未安装的 npm CLI。

## 6. 分阶段实施顺序

### 阶段 A（本文件）

1. 通读 docs（app/architecture/bindings/cli/configuration/distribution/menus/frontend/data-transfer）。
2. 盘点 core、Service 方法、前端 bindings/Events/Window/Clipboard 使用点。
3. 落方案并单独提交 `docs: mygo 迁移方案`。

### 阶段 B

| 步骤 | 内容 | 提交 |
|---|---|---|
| B1 | 加 mygo 依赖、`mygo.config.ts`、前端 `mygo-runtime`；`.gitignore` 加本地缓存 | `chore: 引入 mygo 依赖与配置` |
| B2 | `core.Host`/`WindowSpec`/中立菜单模型；改 library/service/settings/setup/logs/plugins/drag 去掉 Wails 类型 | `refactor: core 与 Wails 解耦` |
| B3 | 新 `main.go`（mygo Host、窗口/托盘/菜单/快捷键/单实例/深链/原生 drop）；旧入口改 `main_wails.go` tag | `feat: mygo webview 入口与原生壳` |
| B4 | `mygo generate` 产出 TS 客户端；前端适配层（service/models/runtime/css） | `feat: 前端切换到 mygo 客户端` |
| B5 | `HandleNativeDrop`、剪贴板、窗口控制/DevTools/缩放补齐 | `feat: 原生拖入与窗口控制对齐` |
| B6 | 构建/启动/接口探活验证；修编译与运行时问题 | `fix: ...` 按需 |
| B7 | `reports/mygo迁移实施报告.md` + 最终整理 | `docs: mygo 迁移实施报告` |

## 7. 验证计划

- `go build ./...`（宿主 cgo=1）通过；`CGO_ENABLED=1 go tool mygo build` 产出 .app。
- 前端 `pnpm --filter bowerbird build`（`tsc && vite build`）通过。
- 启动新二进制：进程存活 ≥ 数秒、日志出现 `[Core] successfully restored library`/`[AssetServer]`/`[MobileServer]`、`curl http://127.0.0.1:17878/api/ping`（或实际健康端点）可达。
- 无法经 ssh 截图验证 GUI；窗口标题通过 mygo 日志/进程与代码路径确认。
- 功能冒烟以日志 + 现有 Go 测试（`go test ./core ./...`）为准；移动端 API 用 curl 探活。

## 8. 已知风险与预案

| 风险 | 预案 |
|---|---|
| mygo `Bind` 拒绝某个 Service 方法类型 | 启动即 panic，按报错把该方法移出绑定或改 DTO；优先保证核心路径 |
| `mygo generate` 运行 main 触发副作用 | Service 先 nil manager 绑定；`NewLibraryManager` 放 `WhenReady` |
| Wails 事件包装 `{data}` 与 mygo 直接 payload 不一致 | 适配器统一包 `{data}`，现有 handler 两种都兼容 |
| Wails `--wails-draggable` 不被 mygo 识别 | CSS 同时写 `--app-region`；保留 `-webkit-app-region` |
| macOS 拖出 hook 失效 | 保留代码并记录；退化为“复制到剪贴板”可用 |
| mygo build 默认 CGO=0 | 命令显式 `CGO_ENABLED=1`；文档记录 |
| 旧 Wails 入口无法编译 | 加 `wails_legacy` tag，默认不编译；不删除文件 |
