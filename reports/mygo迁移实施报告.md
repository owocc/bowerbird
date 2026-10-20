# Bowerbird 桌面端 mygo 迁移实施报告

> 分支：`experiment/desktop-mygo`（基线 `5873397`）
> 参考：`/Volumes/Kidd/projects/code/mygo-ref`，实际使用 mygo `v0.5.5`（npm `mygo-runtime@0.5.5`）
> 结论：**webview 模式可以承载桌面端主路径**。核心 RPC、库恢复、文件夹查询、窗口/事件、菜单/托盘、移动端 HTTP 服务都已跑通；拖出、DMG 打包、Windows OLE 与少量交互矩阵仍有缺口。

## 1. 交付内容

| 文件 | 说明 |
|---|---|
| `main_mygo.go` | 新 mygo 入口：Host、主窗口、事件、托盘、macOS 菜单、全局快捷键、单实例、深链、原生 drop 路由 |
| `main_wails.go` | 原 Wails 入口，加 `//go:build wails_legacy` 保留留档 |
| `core/host.go` | `Host`/`WindowSpec`/`AttachHost`/`AttachManager`：core 与 UI 框架的边界 |
| `core/nativedrop.go` | `HandleNativeDrop`：把原 `main.go` 的 drop 路由搬回 core，并新增 `WriteClipboardText` |
| `core/*.go` | library/service/appmenu/settings/setup/logs/plugins/screenshot/drag 去掉 Wails 类型，改为 Host |
| `mygo.json` | mygo 配置：名称/identifier/版本、devUrl、devCommand、buildCommand、frontendDist、bindings、out、urlSchemes |
| `frontend/src/mygo.ts` | `go tool mygo generate` 生成的类型化客户端 |
| `frontend/bindings/bowerbird/core/service.ts` | 兼容层：保留 Wails 时代的 `GetActiveLibrary()` 等自由函数名，底层调用 `Service.*` |
| `frontend/bindings/bowerbird/core/models.ts` | 从生成客户端 re-export DTO |
| `frontend/src/lib/host-runtime.ts` | `Events`/`Clipboard`/`Window` 兼容层 |
| `frontend/src/index.css` | `--app-region` 与 `--wails-draggable` 双写，兼容 mygo 标题栏拖拽 |
| `frontend/vite.config.ts` | 去掉 Wails Vite 插件，端口改为 `MYGO_VITE_PORT`（默认 9245） |
| `build/ios/*.go` | 加 `wails_legacy` tag，默认构建不再编译这个孤立 main 包 |

## 2. 功能对照完成度

状态：✅ 完成；🟡 部分（代码到位但未完整验证，或行为有差异）；⛔ 缺口。

| 功能 | 状态 | 说明 |
|---|---|---|
| mygo 启动/退出 | ✅ | `SetName` → 单实例锁 → `Bind` → `WhenReady` → `Run` |
| 主窗口 | ✅ | 1280×800、min 900×600、HiddenInset、`#06070f`；日志确认 `title="Bowerbird"` |
| 关闭主窗口隐藏 | ✅ | `OnClose` + `PreventDefault` + `Hide`；`quitting` 时放行 |
| Setup/Settings/Logs 多窗口 | ✅ | Host 窗口注册表；同名窗口复用；CloseWindow 走 `OnClosed` 清理 |
| 前端 dev/prod | 🟡 | prod 由 `mygo build` 嵌入 `frontend/dist`；`mygo dev` 配置已写但本轮未跑 |
| Go↔前端 RPC | ✅ | `mygo.Bind` + 生成客户端 + 兼容层；运行日志出现前端发起的 `GetFolders` |
| 类型化事件 | ✅ | `Host.Emit` 懒声明 `mygo.Event[any]` 并 Broadcast；前端适配器包 `{data}` |
| 库恢复 | ✅ | 运行日志：`Opened library name=Test items=14`、`successfully restored library` |
| 库列表/创建/切换 | 🟡 | 方法全部绑定；恢复已验证，创建/切换未做交互验证 |
| 素材分页网格/详情 | 🟡 | `GetItems/GetItem` 已绑定；网格由前端渲染，未做可视化核对 |
| 文件导入 | 🟡 | `ImportFiles` 等绑定；沙箱禁止写 `/Volumes/Data/Library`，导入在 mkdir 处失败 |
| 原生文件/文件夹拖入 | 🟡 | `OnFileDrop` + `elementFromPoint` 解析 target/folderId 已生效，日志 `[native-drop-routing] target=main`；实际落盘受沙箱限制 |
| 内部素材拖拽移动 | ✅ | 前端 HTML5 DnD 未改；`HandleNativeDrop` 保留内部 item 分支 |
| 文件夹/标签/颜色筛选 | 🟡 | `GetFolders` 运行验证；标签/颜色方法已绑定 |
| 删除/废纸篓/恢复/清空 | 🟡 | 方法全部绑定，未交互验证 |
| 设置页 | 🟡 | 独立窗口 + 全部设置方法；未交互验证 |
| 移动连接（配对码/二维码/网络） | ✅ | 17878 监听成功；`/api/v1/status` 返回 200；配对码日志正常 |
| asset_server | ✅ | 启动日志 `http://127.0.0.1:41595` |
| api_server | ✅ | 代码未改；随 asset server 启动 |
| 插件系统 | 🟡 | PluginManager 改为 Host；安装/启停/升级方法绑定；未做插件交互验证 |
| macOS 应用菜单 | ✅ | mygo RoleAppMenu/Edit/View/Window/Help + Capture 子菜单 + Settings/Logs |
| 托盘菜单 | 🟡 | 托盘 + 菜单 + 语言切换重建；没有 Wails 的“双击托盘显示主窗口”（mygo 无双击 API） |
| 全局快捷键 | ✅ | 改为 mygo 语法 `Alt+A/S/W`，启动日志无注册错误 |
| 单实例 | 🟡 | `RequestSingleInstanceLock` + `OnSecondInstance` 聚焦主窗口；未启动第二实例验证 |
| 深链 `bowerbird://` | 🟡 | `urlSchemes` + `OnOpenURL` + 启动参数兜底；未实际唤起验证 |
| 文件打开/保存对话框 | ✅ | `SelectDirectory/SelectLibraryDialog` → `mygo.Dialog.Open(Directory)` |
| 窗口控制 | 🟡 | 关闭/全屏/重载/缩放可用；`OpenDevTools` 从页面 action 变为 no-op（菜单 Role 仍可开） |
| 复制素材文件到剪贴板 | ✅ | `mygo.Clipboard.WriteFiles` 纯 Go 文件列表；macOS/Windows cgo 旧路径保留为 fallback |
| 文本复制 | ✅ | `Service.writeClipboardText` → `Clipboard.WriteText` |
| 素材拖出 | 🟡 | macOS 保留 WKWebView pasteboard hook + Host 主线程/原生句柄；Windows 保留 OLE 但依赖 Wails `w32`；Linux 仍不支持 |
| 截图三模式 | 🟡 | 代码与全局快捷键注册完成；未实际按快捷键验证 |
| 日志窗口/实时日志 | 🟡 | `SetLogHost` + `LogEntryEvent` 广播；窗口可开，未交互验证 |
| 主题/语言广播 | ✅ | 事件经 Host；托盘菜单随 `language-changed` 重建 |
| 打包 | 🟡 | `mygo build -skip-dmg` 成功产出 21.8MB `.app`；DMG 因沙箱 `hdiutil` 权限失败 |

## 3. 与 Wails 版的差异

1. **事件形状**：mygo 事件回调直接收到 payload；前端兼容层统一包成 `{ data: payload }`，因为现有代码里有一部分（插件、日志、库上下文、网络设置）只读 `event.data`，另一部分也接受直接值。这样 17 个 `Events.On` 调用点无需逐个改写。
2. **客户端命名**：生成客户端是 `Service.getActiveLibrary()`；兼容层在 `frontend/bindings/.../service.ts` 保留 `GetActiveLibrary()`，因此 28 个前端文件的 import 路径和函数名不变。
3. **窗口拖拽**：Wails 用 `--wails-draggable`/`-webkit-app-region`；mygo 用 `--app-region`。CSS 同时写两套，保留旧类名。
4. **原生 drop**：Wails 直接给 `DropTargetDetails` 属性；mygo 只给 paths + x/y，因此多了 `Eval(elementFromPoint → closest([data-file-drop-target]))` 一步，再把 target/folderId 传给 Go。
5. **事件声明**：Wails 在 `init` 里逐个 `RegisterEvent[T]`；mygo 的 Host 按事件名懒创建 `Event[any]`。这样不需要把 20 多个事件类型搬进新入口，代价是生成客户端里没有这些事件的静态类型（前端本来也没用 `events.*`）。
6. **应用菜单**：Wails 的 `application.Menu` 构造被替换为中立模型（`AppMenuModel` + `TrayMenuModel`）+ mygo Role 菜单；旧 `BuildNativeAppMenu/BuildTrayMenu` 不再存在于默认构建。
7. **数据目录**：仍由 `core.UserDataDir()` 决定（`~/Library/Application Support/bowerbird` 或 `BOWERBIRD_USER_DATA_DIR`），没有改用 `mygo.App.Path`，避免迁移丢库。
8. **进程名/identifier**：`mygo.json` 使用 `Bowerbird` + `io.github.owocc.bowerbird`；`mygo.App.SetName("Bowerbird")` 在单实例锁之前调用。
9. **旧入口**：`main_wails.go` + `build/ios` 被 `wails_legacy` tag 隔离，默认 `go build ./...` 不再编译 Wails 入口。
10. **cgo**：mygo 本身无 cgo，但现有 macOS 原生能力（drag hook、系统图标、视频封面）仍是 cgo；`mygo dev/build` 需要 `CGO_ENABLED=1`。

## 4. 验证结果

### 4.1 构建与测试

| 命令 | 结果 |
|---|---|
| `go build ./...` | ✅ 通过 |
| `GOOS=linux CGO_ENABLED=0 go build ./...` | ✅ 通过 |
| `GOOS=windows CGO_ENABLED=0 go build ./...` | ✅ 通过 |
| `go test ./core ./` | ✅ `ok bowerbird/core`、`ok bowerbird` |
| `pnpm --filter bowerbird build` | ✅ `tsc` + Vite 通过，产出 `frontend/dist` |
| `CGO_ENABLED=1 go tool mygo generate` | ✅ `frontend/src/mygo.ts is up to date` |
| `CGO_ENABLED=1 go tool mygo build -skip-dmg` | ✅ `.app` 21.8 MB，ad-hoc 签名成功 |

> `go vet ./...` 仍有一处 `core/drag_darwin.go:465 possible misuse of unsafe.Pointer`：这是把 mygo `NativeHandle()` 的 `uintptr` 传回 Objective-C 的必然转换，构建不受影响。

### 4.2 启动探活

启动 `build/mygo/darwin-arm64/Bowerbird.app/Contents/MacOS/Bowerbird`（`BOWERBIRD_USER_DATA_DIR` 指向工作区临时目录）后：

- 进程存活，窗口标题日志：`[Window] main title="Bowerbird"`。
- 前端加载：`webview-ready href=mygo://localhost/`。
- 库恢复：`Opened library name=Test items=14`，`successfully restored library`。
- 前端通过新客户端调用 Go：`[PERF][core] GetFolders slow query (19ms) — total_folders=0 roots=0`。
- asset server：`http://127.0.0.1:41595`。
- mobile server：`http://0.0.0.0:17878`，mDNS announced。
- `curl http://127.0.0.1:17878/api/v1/status` → `200`，`{"name":"Test","version":"1.1.0","itemCount":14,"pairingRequired":true}`。
- 原生 drop 路由：日志 `[native-drop-routing] target=main folderID= internal=0 external=1`，随后进入 `ImportFiles`；因库位于 `/Volumes/Data`（工作区外）被沙箱拒绝 `mkdir ... operation not permitted`，属环境限制。
- 首次启动时旧 Wails 版仍在运行并占用 17878；旧进程退出后，新 mygo 版成功绑定 17878。

### 4.3 未能验证

- GUI 截图/像素级布局：当前会话无屏幕录制/辅助功能权限，只能靠日志与接口探活。
- `mygo dev` 热重载：未启动 Vite dev server 全链路。
- 第二实例、`bowerbird://` 深链、托盘点击、菜单项点击、设置/日志窗口交互、插件安装、截图快捷键：代码路径已接好，未逐项人工操作。
- DMG：`hdiutil create` 被沙箱拒绝（`Operation not permitted`），不是打包配置错误。

## 5. 已知缺口

1. **Windows 拖出仍依赖 Wails `w32`**：`core/drag_windows.go` 只把 `application.InvokeSync` 换成 Host，`w32.ComProc`/`IDataObject` 尚未自写。Windows 能交叉编译，但默认构建仍会拉入 Wails 的 w32 包。正确做法是用 `syscall` 自建 COM vtable/IDataObject，或等 mygo 暴露 webview 拖出 API。
2. **macOS 拖出依赖 WKWebView hook**：`drag_darwin.go` 的 class hook 仍是 Wails 时代实现，只是改用 `Host.RunOnMain`/`NativeWindowHandle`。未在实际拖到 Finder 的场景验证；若 mygo 的 WKWebView 生命周期/子类不同，可能失效。退路是“复制文件到剪贴板”，已由 `mygo.Clipboard.WriteFiles` 保证。
3. **托盘双击**：Wails 版有 `tray.OnDoubleClick` 显示主窗口；mygo v0.5.5 只有 Click/RightClick，未做等价交互。当前通过托盘菜单“显示主窗口”与 Dock 激活补齐。
4. **页面触发的 DevTools**：`Window.OpenDevTools()` 兼容层是 no-op；macOS 菜单的 View 角色仍可打开检查器。若要页面按钮也能开，需要给 Host 增加 `ToggleDevTools(ctx)` 并用 `CallerWindow(ctx).Page().ToggleDevTools()`。
5. **旧 Wails 入口不可再编译**：`main_wails.go` 引用已删除的 `SetApp/GetApp/BuildNativeAppMenu` 等 API，只作留档；需要恢复时得同步改回 Host 适配。`build/ios` 同样被 tag 隔离。
6. **纯 Go 构建不可用**：macOS 的 `drag_darwin.go`/`sysicon_darwin.go`/`videothumb_darwin.go` 仍是 cgo；`CGO_ENABLED=0` 的 macOS 构建会缺符号。这是迁移前就存在的原生依赖，不是 mygo 引入的。
7. **DMG 未验证**：沙箱禁止 `hdiutil`；在有权限的桌面会话应能通过 `mygo build` 默认流程。

## 6. 后续建议

1. 先在真实桌面会话跑一遍 `mygo dev`，确认 Vite HMR、`MYGO_DEV_URL`、TitleBar 变量与拖拽区。
2. 用工作区内的测试库做一次完整导入/删除/废纸篓/设置/插件/截图回归，避免 `/Volumes/Data` 沙箱问题。
3. 把 Windows 拖出从 Wails `w32` 迁到纯 `syscall`，彻底移除默认构建对 Wails 的依赖；之后可删掉 `go.mod` 里的 Wails。
4. 给 Host 增加 caller-window 级操作（DevTools/缩放/全屏），替代前端 CSS zoom 的近似实现。
5. 若需要托盘双击，向 mygo 提 issue 或在 Host 层用 `OnClick` 时间窗模拟双击。
6. 评估用 `mygo build` 替换 `Taskfile.yml` 的 Wails 打包链，并補 CI 的 `CGO_ENABLED=1` 设置。

## 7. 提交记录

本轮按方案逐项提交（`docs:` / `chore:` / `refactor:` / `feat:` / `fix:`）。若当前执行环境的沙箱不允许写 worktree 的 `.git`（该目录在仓库主目录、位于工作区外），提交会失败并在最终消息中说明；代码与报告均已落在工作区。

## 8. CI 更新

### 8.1 改动范围

- 只改 `.github/workflows/release-app.yml` 与本报告；`android.yml`、`publish-plugins.yml`、`publish-sdk.yml`、业务代码、`mygo.json` 均未改。
- 触发方式保持原样：`push` tag `v*`，或 `workflow_dispatch` 传 `tag_name`。
- 桌面发版从 Wails `wails3 task` 链改为 `go tool mygo build`；不再安装 `task`、`wails3`、`nfpm`。
- 仍未 commit（按任务要求由主会话代提交）。

### 8.2 版本号注入结论

查过 `mygo-ref/docs/configuration.md`、`distribution.md`、`cli.md`、`github-actions.md`，以及 mygo `v0.5.5` 源码 `cmd/mygo/build.go`、`config.go`：

- `mygo build` 的 flag 只有 `-platform`、`-debug`、`-o`、`-sign`、`-skip-build-command`、`-skip-dmg`、`-skip-notarize`、`-upload`，**没有 `-version`**。
- 也**没有** `MYGO_VERSION` 之类的版本环境变量；版本只从 `mygo.json` / `mygo.config.ts` 的 `version` 读取，再由 `packageFlags` 通过 `-X github.com/egoist/mygo.packageVersion=...` 链接进二进制，同时写进 macOS `Info.plist`、Windows 版本资源，以及 dmg / installer / deb 文件名。
- 官方支持的“外部注入”方式是把配置改成 `mygo.config.ts`，默认导出函数里读 `process.env` 或 git 信息；本仓库目前是静态 `mygo.json`，且本次任务只允许改 CI 和报告，因此没有改配置格式。

所以工作流用 CI 侧 stamp 的方式把 tag 写进构建版本：

1. `prepare` job 从 `github.ref_name`（tag 触发）或 `inputs.tag_name`（手动触发）取 tag，去掉 `v`，用 semver 正则校验，输出 `version`。
2. 三个构建 job 在 checkout 后用 Node 重写 `mygo.json` 的 `version`，并读回校验。
3. 再执行 `go tool mygo build`。

本地验证：把 `mygo.json` 临时改成 `1.0.0-alpha-2` 后构建 `darwin/arm64,darwin/amd64`，两个 app 的 `Info.plist` 里 `CFBundleShortVersionString` 与 `CFBundleVersion` 都是 `1.0.0-alpha-2`；测试后已恢复为 `1.0.0-alpha-1`。

> 注意 1：stamp 只作用于 CI 的 checkout。本地直接 `go tool mygo build` 仍然得到 `mygo.json` 里写死的 `1.0.0-alpha-1`。如果希望本地也跟随 tag，需要迁移到 `mygo.config.ts` 的计算配置；这不在本次“只改 CI/报告”的范围内。
>
> 注意 2：`main_mygo.go` 的 `ShowAbout` 仍把 `mygo.AboutPanelOptions.ApplicationVersion` 写死为 `1.0.0-alpha-1`。因此 CI 打包出的 bundle 元数据与 `App.Version()` 是 tag 版本，但“关于”面板仍显示 `1.0.0-alpha-1`。这属于业务代码，按任务要求没有改；要完全一致，应改为 `mygo.App.Version()` 或注入变量。

### 8.3 工作流结构

| job | runner | 构建命令 | 收集的资产 |
|---|---|---|---|
| `prepare` | `ubuntu-latest` | 解析 tag → semver | `version` output |
| `build-macos` | `macos-latest` | `CGO_ENABLED=1 go tool mygo build -platform "darwin/arm64,darwin/amd64"` | `bowerbird-macos-arm64.dmg`、`bowerbird-macos-arm64.app.tar.gz`、`bowerbird-macos-x64.dmg`、`bowerbird-macos-x64.app.tar.gz` |
| `build-windows` | `windows-latest` | `go tool mygo build -platform "windows/amd64"` | `bowerbird-windows-x64-installer.exe`、`bowerbird-windows-x64-portable.exe` |
| `build-linux` | `ubuntu-24.04` | `go tool mygo build -platform "linux/amd64"` | `bowerbird.deb`（由 mygo 输出的版本化 `.deb` 重命名）、`-linux-amd64.tar.gz`、`install.sh` |
| `publish-release` | `ubuntu-latest` | 汇总 artifacts，`softprops/action-gh-release@v2` | 上述全部资产 |

资产命名对照了 `v1.0.0-alpha-3.1` 的实际 release 清单（GitHub API）：macOS 的 `bowerbird-macos-arm64.dmg` / `.app.tar.gz`、`bowerbird-macos-x64.dmg` / `.app.tar.gz`，Windows 的 `bowerbird-windows-x64-installer.exe` / `-portable.exe` 均保持一致；Linux 把 mygo 的版本化 `.deb` 重命名为 alpha-3.1 同名的 `bowerbird.deb`，并额外保留 mygo 的 `-linux-amd64.tar.gz` 与 `install.sh`（安装脚本按这两个名字找包）。alpha-3.1 还有 `bowerbird.rpm` 与 `bowerbird-x86_64.AppImage`，mygo 不产出这两种格式，见 8.6。

环境与依赖：

- Go 用 `actions/setup-go@v5` + `go-version-file: go.mod`（当前 `go 1.27.1`），开启 module cache。
- Node 22 + pnpm 9（`buildCommand` 是 `pnpm --filter bowerbird build`）；另按任务要求安装 Bun，当前 `mygo.json` 是 JSON，mygo 不会调用 Bun，保留给后续 `mygo.config.ts`/脚本使用。
- 三个构建 job 都设 `CGO_ENABLED=1`；macOS 另设 `MACOSX_DEPLOYMENT_TARGET=12.0`，与 mygo 默认 `minimumSystemVersion` 对齐。
- Windows 用 `choco install nsis` 安装 NSIS 并把安装目录加入 `PATH`；mygo 只在找不到 `makensis` 时才自行下载。
- Linux 安装 `build-essential`、`pkg-config`、`libgtk-3-dev`、`libwebkit2gtk-4.1-dev`，覆盖 cgo 与 GTK/WebKitGTK 运行时依赖。
- 每个平台先 `pnpm install --frozen-lockfile`，再 `node scripts/build-plugins.mjs`（沿用旧工作流），最后 `go tool mygo build`。
- 发版仍用 `softprops/action-gh-release@v2`，`generate_release_notes: true` 与 prerelease 判断保持原逻辑，并新增 `fail_on_unmatched_files: true`。

### 8.4 各平台验证状态

| 平台 | 本地状态 | 说明 |
|---|---|---|
| macOS app | ✅ 已本地实跑 | `CGO_ENABLED=1 go tool mygo build -platform "darwin/arm64,darwin/amd64" -skip-dmg` 成功；`file` 确认分别为 `arm64` / `x86_64`；两个 app 的 `codesign --verify --deep --strict` 均通过。 |
| macOS DMG | ⛔ 本轮沙箱内未完成 | 完整 `go tool mygo build -platform darwin/arm64` 走到 `hdiutil create ... -format UDRW` 时被沙箱拒绝：`hdiutil: create failed - Operation not permitted`；`diskutil image create` 同样返回 `OSStatus error 1`。本轮开始前 `build/mygo/darwin-arm64/` 下曾有一个 8.7 MB 的 DMG（12:24 生成），说明该链路在非沙箱环境可出；随后 `-skip-dmg` 重建输出目录，旧 DMG 已被清理。工作流在 GitHub 的 macOS runner 上不受此沙箱限制。 |
| Windows | ⚠️ 未本地验证 | 本机是 macOS，未在原生 Windows 上跑过。工作流使用 `windows-latest` + NSIS，资产名按 mygo 源码规则收集（`Bowerbird.exe`、`Bowerbird Setup <version> amd64.exe`）。 |
| Linux | ⚠️ 未本地验证 | 本机是 macOS，未在原生 Ubuntu 上跑过。工作流使用 `ubuntu-24.04` + `CGO_ENABLED=1`；收集 mygo 的 `.deb`（重命名为 `bowerbird.deb`）、`-linux-amd64.tar.gz`、`install.sh`。 |

为什么没有用 macOS 交叉构建来“顺带验证” Windows/Linux：`CGO_ENABLED=0` 交叉构建时，mygo 生成 TypeScript 客户端那一步会按宿主 `darwin` 编译；此时 darwin 的 cgo 文件被排除，而 `sysicon_other.go` / `videothumb_other.go` / `drag_other.go` 的 build tag 又排除了非 iOS 的 darwin，导致 `GetSystemFileIconPNG`、`ExtractNativeVideoFrame`、`StartDragItems`、`CopyItemsToClipboard` 未定义。这是宿主交叉构建的限制，不是原生 Linux/Windows runner 的问题；原生 runner 上 `CGO_ENABLED=1` 会走 `_other.go` / `drag_windows.go` 分支。

### 8.5 本地检查记录

| 检查 | 结果 |
|---|---|
| `CGO_ENABLED=1 go tool mygo build -platform "darwin/arm64,darwin/amd64" -skip-dmg` | ✅ 两个 `.app`，21.8 MB / 23.0 MB |
| `file build/mygo/darwin-*/Bowerbird.app/Contents/MacOS/Bowerbird` | ✅ `arm64`、`x86_64` |
| `codesign --verify --deep --strict` 两个 app | ✅ 通过（ad-hoc） |
| 版本 stamp（`1.0.0-alpha-2`）后读 `Info.plist` | ✅ `CFBundleShortVersionString` / `CFBundleVersion` 均为 `1.0.0-alpha-2` |
| `CGO_ENABLED=1 go tool mygo build -platform darwin/arm64`（含 DMG） | ⛔ `hdiutil` 被沙箱拒绝（见 8.4） |
| workflow YAML 解析 | ✅ Ruby `YAML.load_file` 通过 |
| tag → semver 正则 | ✅ `v1.0.0-alpha-2`、`v1.2.3`、`1.2.3`、`v1.2.3-rc.1`、`v1.2.3+build.5` 通过；`v1.2`、`bad`、`v` 拒绝 |
| macOS 资产收集脚本（临时假 dmg + 现有 app） | ✅ 产出 4 个命名资产，tar 内含 `Bowerbird.app` |
| Linux 资产收集脚本（临时假 deb/tar/install.sh） | ✅ 产出 `bowerbird.deb`、`.tar.gz`、可执行 `install.sh` |

### 8.6 未验证项与风险

1. **macOS DMG**：工作流依赖 `go tool mygo build` 在 GitHub macOS runner 上完成 `hdiutil create/attach/convert`；本沙箱无法执行，未在本轮留下 DMG 产物。
2. **Windows 安装器**：`Bowerbird Setup <version> amd64.exe` 的实际文件名、NSIS 下载/安装、portable 可执行文件是否单文件可运行，均未在原生 Windows 上验证。
3. **Linux 打包**：mygo 不产出 `.rpm` / `.AppImage`，它们从 alpha-3.1 的资产清单里消失；Linux 现在发布 `bowerbird.deb` + `-linux-amd64.tar.gz` + `install.sh`。若必须保留 `bowerbird.rpm` / `bowerbird-x86_64.AppImage`，需要在 mygo build 之后另加 rpm/AppImage 打包步骤（本次未做）。
4. **pnpm 版本**：本地是 pnpm 12，工作流按旧配置用 pnpm 9；`pnpm-lock.yaml` 是 `lockfileVersion: 9.0`，预期兼容，但未在 pnpm 9 下跑过 `--frozen-lockfile`。
5. **Windows 的 `CGO_ENABLED=1`**：当前默认构建在 Windows 上没有 cgo 源文件（Wails `w32` 是纯 Go），预期不需要 MinGW；若将来新增 Windows cgo，需要补 C 编译器。
6. **工作流未实际触发**：按任务要求未 commit/push，所有 GitHub Actions 逻辑只做了静态检查与本地等价脚本验证。
