# Bowerbird 桌面端 mygo NATIVE 渲染实施报告

> 分支：`experiment/desktop-mygo-native`
> 参考：`/Volumes/Kidd/projects/code/mygo-ref`，依赖 `github.com/egoist/mygo v0.5.5`
> 范围：`ui` 包纯 Go GPU 绘制，无 webview / HTML / JS；复用 `core`；插件系统本轮不兼容。
> 结论：**主路径 native 化可用**。三栏工作区、真实素材/缩略图、筛选/搜索/排序、检查器、图片预览（缩放/平移）、GIF 动画、导入、删除/废纸篓、设置、移动配对（二维码已解码验证）、日志、托盘/菜单/快捷键均已落地；justified/waterfall、框选、历史、include subfolders、标签 CRUD、批量评分/备注与 en/zh 资源化在第二轮补齐；插件、视频播放、DMG、真实捏合仍为范围外或框架限制。

## 1. 交付内容

| 路径 | 说明 |
|---|---|
| `cmd/bowerbird-native/main.go` | 独立 native 入口；未改动 `main_mygo.go` |
| `internal/nativeui/` | native UI、状态、Host、缩略图管线、菜单/托盘、二维码、各窗口 |
| `internal/qr/` | `rsc.io/qr` 的 BSD 源码副本（`go get` 无法写 module 缓存，故 vendored） |
| `reports/mygo-native迁移方案.md` | 阶段 A 方案 |
| `reports/mygo-native实施报告.md` | 本报告 |
| `go.mod` | 新增 `github.com/go-text/typesetting v0.3.5 // indirect`（`mygo/ui` 的文本依赖） |

构建产物：`build/bin/bowerbird-native`（约 26 MB，macOS arm64）。

未改动：`main_mygo.go`、`frontend/`、`mobile/`。未 commit/push。

## 2. 完成度

状态：✅ 完成；🟡 部分；⛔ 未做。

### 2.1 阶段 1：native 应用与三栏主界面

| 项 | 状态 | 说明 |
|---|---|---|
| native 应用起窗 | ✅ | `mygo.NewWindow` + `ui.View`，首帧实测中位数 176 ms |
| 三栏骨架 | ✅ | 侧栏 / 网格 / 检查器，`ui.Split` + `SplitPercent` 可拖动 |
| 真实 core 数据 | ✅ | `GetActiveLibrary/GetItems/GetTrashItems/GetFolders/GetTags/GetTrashCount` |
| 缩略图 | ✅ | 直读 `thumbnail.jpg`，后台解码/降采样，LRU 缓存，主色占位；第二轮加可见窗口前后各一屏预取与按库大小自适应预算 |
| 虚拟化滚动 | ✅ | `ui.GridView` 只构建可见 cell；38 项/5 列滚动目测流畅 |
| 移动服务随启动 | ✅ | 日志确认 17878（被占用时随机端口）+ mDNS；asset/api server 照常 |
| 库恢复 | ✅ | 日志 `Opened library ...`，主界面渲染该库 |

### 2.2 阶段 2：主路径交互

| 功能 | 状态 | 说明 |
|---|---|---|
| 素材详情/检查器 | ✅ | 名称、收藏、评分、标签、文件夹、备注、URL、Prompt、元数据、路径、Hash |
| 图片预览 | ✅ | 全窗口浮层、Contain 适配、上一张/下一张、Esc/按钮关闭；第二轮加滚轮缩放、拖动平移、双击 Fit/1:1 |
| 视频预览 | 🟡 | 显示导入封面 + “Open 播放”提示；无应用内解码/播放 |
| GIF | ✅ | `image/gif` 逐帧合成 + `Bitmap.Update`；网格/预览动画，降采样与帧率/并发上限，滚动时回退首帧 |
| 其他文件预览 | 🟡 | 扩展名占位 + 系统默认应用打开；无 PDF/文档内嵌渲染 |
| 导入文件 | ✅ | 原生文件选择（多选）→ `ImportFiles`，进度条 + 完成刷新 |
| 导入文件夹 | ✅ | `ImportFoldersRecursively` |
| 拖入 | ✅ | `Window.OnFileDrop` 兜底；文件夹行/网格可接收；导入到当前文件夹 |
| 拖出到系统 | ✅ | `DragDataFrom` + `transfer.FileData`；失败回退文本 |
| 内部拖拽到文件夹/废纸篓 | ✅ | cell `.Drag([]string)`，侧栏 `.Drop[[]string]` |
| 删除/废纸篓 | ✅ | `BatchMoveToTrash` + 二次确认 |
| 恢复/清空/永久删除 | ✅ | `BatchRestoreFromTrash` / `EmptyTrash` / `PermanentDeleteItem` |
| 搜索 | ✅ | `SearchField` → core 查询 + 本地精细字段匹配 |
| 排序 | ✅ | 最新/最早，core `asc/desc` |
| 类型筛选 | ✅ | image/video/audio/document/archive/other |
| 颜色筛选 | ✅ | 主色/Palette + redmean 距离，同 webview 容差 115 |
| 文件夹/未分类筛选 | ✅ | 顶层 Filter 菜单与侧栏虚拟节点 |
| 方向/大小/URL/备注/评分筛选 | ✅ | 与 webview 规则一致（1MB/10MB、has/empty、0–5 星） |
| 活动筛选 chips/清除 | ✅ | 自绘 chips，点击移除 |
| 文件夹 CRUD | ✅ | 新建根/子文件夹、重命名、删除确认；递归树展开 |
| 标签过滤/打标签 | ✅ | 侧栏标签过滤；检查器 `TokenField` 写回 `SetItemTags` |
| 标签 CRUD | ✅ | 侧栏新建标签、右键删除标签（`CreateTag`/`DeleteTag`）；webview 无重命名，故未做 |
| 多选/批量 | ✅ | Cmd/Shift 多选；批量标签/文件夹/删除/恢复；第二轮加批量评分、批量备注与框选 marquee |
| 右键菜单 | ✅ | 预览/打开/Reveal/复制路径/复制文件/加入文件夹/收藏/删除/恢复 |
| 键盘快捷键 | 🟡 | Cmd+F/B/I/L/,、Space、Delete、Esc；部分窗口/导航快捷键未覆盖 |
| 列表布局 | ✅ | `ui.List` 单列，缩略图/名称/元数据/标签/日期 |
| justified / waterfall | ✅ | 自绘行布局 + `Scroll.TrackScroll` 虚拟化；工具栏四布局入口；框选/点击/拖拽/右键均可用 |

### 2.3 阶段 3：设置、移动连接、壳

| 功能 | 状态 | 说明 |
|---|---|---|
| Settings 窗口 | ✅ | 通用/快捷键/插件说明/网络/数据/扩展/移动/关于 |
| 外观（system/light/dark） | ✅ | `core.SetTheme` + 事件广播；所有窗口重绘 |
| 语言（system/en/zh） | ✅ | 复用 `frontend/src/messages` 的 en/zh 资源（go:embed 副本 + 漂移测试）；native 专属文案放 `messages/native.json` 扩展点；RTL 未验证 |
| 网络代理设置 | ✅ | system/direct/custom、保存、连通性测试 |
| 数据目录/日志路径 | ✅ | 打开、复制路径、Reveal 日志 |
| 浏览器扩展 API 信息 | ✅ | 端口/Endpoint/复制；API 随 asset server 启动 |
| 移动服务状态/开关 | ✅ | `GetMobileServerStatus` / `SetMobileServerEnabled` |
| 配对码/重新生成 | ✅ | `GetMobilePairingCode` / `RegenerateMobilePairingCode` |
| 二维码 | ✅ | 纯 Go 编码 + GPU 位图；用 macOS Vision 解码回 `bowerbird://pair?data=...` 验证通过 |
| 配对 URL/复制 | ✅ | `GetMobilePairingURL` |
| 地址列表/允许网段 | ✅ | `Checkbox` + `SetMobileAllowedNetworks` |
| Logs 窗口 | ✅ | 虚拟化列表、搜索、级别徽章、清空、Reveal；实时事件追加 |
| Setup 窗口 | ✅ | 库名/父目录/路径预览/创建/打开已有/最近库 |
| 库创建/切换/关闭 | ✅ | 复用 `Service.CreateLibrary/OpenLibrary/CloseLibrary` |
| macOS 应用菜单 | ✅ | `core.AppMenuModel` + Role；Capture 子菜单 |
| 托盘 | ✅ | 运行时绘制图标 + `core.TrayMenuModel`；语言切换重建 |
| 全局截图快捷键 | ✅ | `Alt+A/S/W` 注册；未按快捷键实测 |
| 深链 | 🟡 | `bowerbird://plugin/install` 解析并打开设置说明；插件安装本身不可用 |
| 单实例/第二实例 | ✅ | `RequestSingleInstanceLock` + `OnSecondInstance` 聚焦 |
| 关闭主窗口隐藏 | ✅ | `OnClose` + `PreventDefault` + `Hide`；退出放行 |
| 插件系统 | ⛔ | 按要求不接 UI；设置页明确说明；HTTP API 仍随服务启动 |
| 打包 | 🟡 | 出可运行二进制；未做 `.app`/DMG（hdiutil 不在本轮范围） |

## 3. 性能粗测

### 3.1 测法

- 机器：当前 macOS arm64 开发机；同一用户会话；关闭其他 Bowerbird 实例。
- 数据：`/tmp/bb-lib/TestLibrary.library`，40 张生成图片（导入后缩略图已生成），后续加 2 个文件夹、3 个标签、2 个废纸篓素材。
- user data：`BOWERBIRD_USER_DATA_DIR=/tmp/bb-seed-user`（空载用空目录），避免触碰真实库。
- **原生启动**：应用内部 `processStart` → 首个 native frame 日志；以及首个带库画面的 frame（`startup-library-frame`，写在 `BOWERBIRD_NATIVE_METRICS`）。5 次热运行取中位数。
- **webview 启动**：同一台机器、同一库，启动 `/Applications/Bowerbird.app/Contents/MacOS/Bowerbird`（v1.0.0-alpha-4，webview 版），从进程启动到前端日志 `[webview-ready]` 的时间，3 次取中位数。`webview-ready` 是页面就绪，不等于首帧；webview 版未输出可比的“网格已渲染”日志。
- **内存**：启动 3.2 s 后 `footprint` 的 `phys_footprint`。原生取应用进程；webview 取应用 + WebKit Networking/Graphics and Media/Web Content 四个进程之和。3 次取中位数。包含 GPU/绘制缓冲，不是 Go heap。
- 未做 FPS 采样；滚动为目测 + mygo 自身 `GridView/List` 虚拟化机制。

### 3.2 结果

| 指标 | native | webview | 对比 |
|---|---:|---:|---:|
| 首帧（40 项库） | **176 ms** | 560 ms（页面就绪） | native 首帧约 3.2× 快（口径不同，见上） |
| 带库网格可交互 | **706 ms** | 页面就绪 560 ms + 数据/React 渲染（未单独计时） | 接近；native 未体现数量级优势 |
| 空载首帧 | **179 ms** | 页面就绪（未单独测） | — |
| 空载内存（主窗口 + Setup） | **88 MB** | **248 MB** | native 约 **2.8×** 低 |
| 40 项库空闲内存 | **103 MB** | **326 MB** | native 约 **3.2×** 低 |

补充：webview 四个进程的中位构成约为 App 45 MB + Networking 8 MB + GPU 24–40 MB + Web Content 170–250 MB；native 只有单进程。启动优势主要体现在“窗口先出来”和内存，而非“核心/数据库/字体初始化”这一段；40 项小库时两者到可用画面的时间接近，是符合预期的，因为 core 初始化与字体/GPU 首帧占了大头。

## 4. 已知缺口（第二轮后）

### 4.1 明确不做（按需求）

1. **插件系统**：无插件管理页、无插件预览宿主、无市场/安装/启停 UI，插件深链只提示。`PluginManager` 仍在 core 中，`api_server` 的插件 HTTP 路由随服务启动，但不保证可用。
2. **视频/音频播放**：mygo `ui` 无视频解码与 `<video>`；native 版只显示封面与元数据，播放交给系统默认应用。
3. **DMG 打包**：只出二进制；`hdiutil` 沙箱不可用。

### 4.2 体验/交互缺口（剩余）

4. **真实触控板捏合**：mygo v0.5.5 的 macOS 后端不投递 `magnify`/手势事件，`ui` 也无捏合 API；已用 Cmd/Ctrl+滚轮调整行高作为最接近的替代，按钮调整保留。真正的捏合需在 mygo/平台层补事件。
5. **框选边界**：marquee 只命中当前已构建的可见 cell（含 overscan），滚出视口的素材不会被选中；Cmd/Shift 框选是“保留原选择并叠加”，不是从 anchor 拉范围。
6. **justified/waterfall 键盘导航**：两种自绘布局支持点击、Cmd/Shift 点击、双击预览、拖拽与右键；方向键焦点式导航仍只在 Grid/List。
7. **标签重命名**：webview 与 core 都没有重命名方法，故只做新建/删除；要重命名需在 core 增加原子改名。
8. **RTL / 其余语言**：en/zh 资源已接入，`messages/<code>.json` 可扩展；RTL 布局方向和阿拉伯语等未验证。
9. **无障碍**：主要控件有 Label，但未逐控件做 VoiceOver 验证；自绘行/网格的 role 依赖 `ui` 默认值。
10. **Windows/Linux**：仍只 macOS arm64 实测；代码使用 mygo 跨平台 API，未在另两平台构建/运行。
11. **webview 版回归**：未改动 `main_mygo.go`/frontend，但本轮未重新跑 webview 版交互回归。
12. **native 专属文案**：约 185 条 native-only 文案在 `internal/nativeui/messages/native.json`（en/zh），90 条直接复用 frontend key；侧栏筛选表等 7 处动态两语言表仍是内联数据，后续可迁 key。

### 4.3 技术债务 / 已知问题

13. **mygo v0.5.5 `Window.Update` 重绘不稳定**：后台窗口仍用 `App.nudgeRepaint` 的 ±2 px 兜底；焦点窗口不触发。
14. **测试中的 race 报告**：headless 测试没有真实窗口，`App.update` 会就地执行后台刷新，`-race` 会把测试读/后台写报成竞争；真实窗口路径经 `Window.Update` 串行到主线程。常规测试与构建均通过，`-race` 结果不作为验收。
15. **二维码依赖**：`internal/qr` 是 vendored 源码，升级需手动同步。
16. **GIF 内存**：单个动画按 96MB 预算自动降低解码尺寸，超限回退静态首帧；极端长 GIF 不会全部动画。

## 5. 后续路线

1. **修 mygo 重绘**：向 mygo 反馈 `Window.Update` 对 native Content 的重建问题，移除 resize workaround。
2. **媒体**：接入视频解码（AVFoundation/FFmpeg 抽帧或帧缓冲）或至少做逐帧 GIF；音频做波形/时长展示。
3. **网格布局**：justified/waterfall 已用自绘 `Scroll.TrackScroll` 落地；后续补键盘导航与更精确的 overscan。
4. **交互补齐**：框选、预览缩放/平移、include subfolders、拖拽历史、标签删除、批量评分已落地；真实捏合仍待 mygo 事件支持。
5. **插件**：若后续要兼容，需要设计 native 插件 UI 扩展点（插件声明自己的 Go 视图，而不是 HTML/React 预览）。
6. **跨平台**：Windows/Linux 构建与输入法/拖拽/托盘/菜单验证；打包 `.app`/安装包。
7. **性能**：缩略图磁盘缓存 + 预取、首屏骨架、按库大小调整缓存预算；采集真实 FPS/帧耗时。

## 6. 验证命令

```sh
export PATH=/opt/homebrew/bin:$HOME/.bun/bin:$HOME/.local/share/vite-plus/bin:$HOME/go/bin:$PATH
export GOCACHE=/tmp/bowerbird-go-cache
CGO_ENABLED=1 go build ./...
CGO_ENABLED=1 go vet ./internal/nativeui ./cmd/bowerbird-native ./internal/qr/...
CGO_ENABLED=1 go build -o build/bin/bowerbird-native ./cmd/bowerbird-native
```

运行（临时数据目录，不影响真实库）：

```sh
BOWERBIRD_USER_DATA_DIR=/tmp/bb-seed-user ./build/bin/bowerbird-native
```

## 7. 第二轮补齐（2026-10-20）

本轮按 brief 的 12 项优先级逐项实现，每完成一组都跑 `CGO_ENABLED=1 go build ./...`；最终再跑 vet、单测、native 入口构建与 seed 库启动。**未 commit、未 push，未改 `main_mygo.go`/`frontend`/`mobile`。**

### 7.1 逐项结果

| # | 项 | 结果 | 说明 |
|---:|---|---|---|
| 1 | GIF 动画 | ✅ | `image/gif` 解码/合成（disposal 处理）→ 降采样帧 → `ui.Bitmap.Update`；网格最多 6 个同时动画、80 ms 帧下限、滚动后 250 ms 内回退首帧；预览 33 ms 下限；单动画按 96 MB 预算自动降尺寸，超限静态首帧。静态图仍走原 thumbnail 路径。 |
| 2 | 预览缩放/平移 | ✅ | 滚轮以指针为锚缩放；拖动平移；双击 Fit↔1:1；Esc 关闭（Modal）；上一张/下一张会重置视图；小图不放大，大图 Contain。 |
| 3 | include subfolders | ✅ | 侧栏选中文件夹时出现「包含子文件夹」复选；匹配“选中文件夹 + 全部后代文件夹”，规则与 webview 一致。 |
| 4 | 标签 CRUD | ✅ | 侧栏「＋」新建标签（`CreateTag`）→ 刷新；标签右键「删除标签…」→ 二次确认（`DeleteTag`）；收藏内置标签禁止删除。webview 无重命名，core 也无原子改名，故未做。 |
| 5 | 批量评分/备注 | ✅ | 多选检查器新增 Rating（0–5 与逐星按钮）和备注输入 + Apply；逐项调用 `UpdateItemDetails`，保留每项自己的 URL/Prompt。 |
| 6 | 拖拽历史 | ✅ | 每库持久化 `native-drag-history.json`（最多 500、去重、最近在前）；侧栏 History 虚拟集合按历史顺序，asc 反转，过滤已删除/废纸篓项；外部 drag 的 `transfer.DragOptions.Done` 记录，内部文件夹/废纸篓 drop 用时间窗抑制。 |
| 7 | 框选 marquee | ✅/🟡 | 空白处按下拖动出橡皮筋，命中当前构建 cell；Cmd/Shift 叠加原选择；与点击/拖拽/右键共存。差异：只选可见 cell，不加 anchor 范围语义。 |
| 8 | justified/waterfall | ✅ | 自绘行布局（按宽度贪心分行、保持宽高比；瀑布按最短列），`Scroll.TrackScroll` 只构建视口附近；工具栏四布局菜单；点击/Cmd/Shift/双击/拖拽/右键齐备。 |
| 9 | 捏合行高 | 🟡 框架限制 | mygo 后端无 magnify/手势事件；实现 Cmd/Ctrl+滚轮调整行高（含 ±按钮）；真实捏合需平台层补事件。 |
| 10 | 缩略图缓存 | ✅ | 可见窗口前后各一屏预取；并发解码上限 16、每帧最多启动 10 个预取；按库大小自适应（<2k: 300/96MB；<20k: 600/192MB；<100k: 1000/320MB；更大: 1600/512MB）。metrics 追加 `thumb-cache entries/bytes` 与 `gif-entries/bytes`。 |
| 11 | 建库/切换/删除库 | ✅ | 新增 `UserDataStore.RemoveRecentLibrary` 与 native「Delete Library…」（关闭活动库 → 从 recent 移除 → `mygo.Shell.TrashItem`）；App 级测试覆盖建两个库、切换、关闭、删除非活动/活动库；Setup 窗口按钮级测试覆盖建库和删除确认；同时修复 Setup 窗口不绘制确认框的问题。 |
| 12 | i18n | ✅/🟡 | `go:embed` 复用 `frontend/src/messages/en.json`、`zh.json`，漂移测试保证副本一致；`native.json` 作为 native 文案扩展点；90 处调用改为 frontend key，其余约 185 条 native 文案键化；语言切换即时重绘。侧栏筛选表等 7 处动态表仍内联，RTL 未验证。 |

### 7.2 自测与构建记录

```
CGO_ENABLED=1 go build ./...                         # OK
CGO_ENABLED=1 go vet ./internal/nativeui ./cmd/bowerbird-native ./internal/qr/...
                                                      # OK
CGO_ENABLED=1 go test ./internal/nativeui -timeout 120s
                                                      # ok  bowerbird/internal/nativeui
CGO_ENABLED=1 go build -o build/bin/bowerbird-native ./cmd/bowerbird-native
                                                      # OK（26 MB, macOS arm64）
```

测试覆盖（`internal/nativeui/*_test.go`）：

- `TestMessageCatalogsMatchFrontend` / `TestMessageCatalogParity` / `TestMessageLookupAndInterpolation`：资源副本、en/zh 键对齐、查找/插值。
- `TestIncludeSubfoldersFilter`、`TestHistoryCollectionOrder`、`TestDragHistoryRecordsDedupesAndPersists`。
- `TestJustifiedLayoutFillsWidth`、`TestWaterfallColumns`、`TestJustifiedClickAndMarquee`、`TestCmdWheelChangesRowHeight`。
- `TestPreviewZoomAndDoubleClick`（缩放/双击/平移）、`TestDecodeAnimatedGIF`（3 帧、降采样、延迟、字节统计）。
- `TestThumbLimitsAndEviction`、`TestScrollHandlerReceivesWheel`。
- `TestLibraryCreateSwitchCloseDelete`、`TestSetupWindowClicks`、`TestTagCreateDeleteOnApp`、`TestBulkRatingAndNote`。
- `TestViewsBuildInEveryLayout` / `TestHistoryAndSubfolderViewsBuild` / `TestChineseCatalogRenders`：四种布局、历史/子文件夹、中文资源在 headless `ui.Tester` 中建帧。
- `TestRenderSnapshots`（需 `BOWERBIRD_SNAPSHOTS=<dir>`）：输出 justified/waterfall/grid/list/preview/selection 六张 headless 渲染，用于人工核对。

seed 库启动（`/tmp/bb-lib/TestLibrary.library`，46 active + 2 trash，含 2 个 GIF、6 张不同比例图）：

```
startup-first-frame=166–198 ms（多次热运行；一次系统繁忙时 430 ms）
startup-library-frame=652–705 ms（同上；一次 995 ms）
thumb-cache items=46 entries=12…44 bytes=0.5–23.8 MB
gif-entries=2 gif-bytes=6.1 MB（两个 12 帧 GIF，降采样后）
```

缓存口径：同一 46 项库，首帧后可见/预取缩略图 12–44 项，约 0.5–24 MB；GIF 两枚共约 6.1 MB。大库预算按上表放大，避免把内存全花在缩略图上。

### 7.3 结论

第 4 节里除“真实捏合”受 mygo 事件能力限制外，其余可补项均已实现；插件、视频播放、DMG 按范围外处理。justified/waterfall 与 marquee 选择了“自绘 + 可见 cell”的务实实现，差异已在 4.2 注明。
