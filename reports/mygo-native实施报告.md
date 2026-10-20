# Bowerbird 桌面端 mygo NATIVE 渲染实施报告

> 分支：`experiment/desktop-mygo-native`
> 参考：`/Volumes/Kidd/projects/code/mygo-ref`，依赖 `github.com/egoist/mygo v0.5.5`
> 范围：`ui` 包纯 Go GPU 绘制，无 webview / HTML / JS；复用 `core`；插件系统本轮不兼容。
> 结论：**主路径 native 化可用**。三栏工作区、真实素材/缩略图、筛选/搜索/排序、检查器、图片预览、导入、删除/废纸篓、设置、移动配对（二维码已解码验证）、日志、托盘/菜单/快捷键均已落地；视频/GIF 动画、插件、justified/waterfall 与若干交互为明确缺口。

## 1. 交付内容

| 路径 | 说明 |
|---|---|
| `cmd/bowerbird-native/main.go` | 独立 native 入口；未改动 `main_mygo.go` |
| `internal/nativeui/` | native UI、状态、Host、缩略图管线、菜单/托盘、二维码、各窗口 |
| `internal/qr/` | `rsc.io/qr` 的 BSD 源码副本（`go get` 无法写 module 缓存，故 vendored） |
| `reports/mygo-native迁移方案.md` | 阶段 A 方案 |
| `reports/mygo-native实施报告.md` | 本报告 |
| `go.mod` | 新增 `github.com/go-text/typesetting v0.3.5 // indirect`（`mygo/ui` 的文本依赖） |

构建产物：`build/bin/bowerbird-native`（约 25 MB，macOS arm64）。

未改动：`main_mygo.go`、`frontend/`、`mobile/`。未 commit/push。

## 2. 完成度

状态：✅ 完成；🟡 部分；⛔ 未做。

### 2.1 阶段 1：native 应用与三栏主界面

| 项 | 状态 | 说明 |
|---|---|---|
| native 应用起窗 | ✅ | `mygo.NewWindow` + `ui.View`，首帧实测中位数 176 ms |
| 三栏骨架 | ✅ | 侧栏 / 网格 / 检查器，`ui.Split` + `SplitPercent` 可拖动 |
| 真实 core 数据 | ✅ | `GetActiveLibrary/GetItems/GetTrashItems/GetFolders/GetTags/GetTrashCount` |
| 缩略图 | ✅ | 直读 `thumbnail.jpg`，后台解码/降采样，LRU 缓存，主色占位 |
| 虚拟化滚动 | ✅ | `ui.GridView` 只构建可见 cell；38 项/5 列滚动目测流畅 |
| 移动服务随启动 | ✅ | 日志确认 17878（被占用时随机端口）+ mDNS；asset/api server 照常 |
| 库恢复 | ✅ | 日志 `Opened library ...`，主界面渲染该库 |

### 2.2 阶段 2：主路径交互

| 功能 | 状态 | 说明 |
|---|---|---|
| 素材详情/检查器 | ✅ | 名称、收藏、评分、标签、文件夹、备注、URL、Prompt、元数据、路径、Hash |
| 图片预览 | ✅ | 全窗口浮层、Contain 适配、上一张/下一张、Esc/按钮关闭 |
| 视频预览 | 🟡 | 显示导入封面 + “Open 播放”提示；无应用内解码/播放 |
| GIF | 🟡 | 静态首帧；逐帧动画未做 |
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
| 标签删除 | ⛔ | 未做独立删除入口 |
| 多选/批量 | 🟡 | Cmd/Shift 多选，批量删除/恢复/加标签/加文件夹；框选 marquee 未做 |
| 右键菜单 | ✅ | 预览/打开/Reveal/复制路径/复制文件/加入文件夹/收藏/删除/恢复 |
| 键盘快捷键 | 🟡 | Cmd+F/B/I/L/,、Space、Delete、Esc；部分窗口/导航快捷键未覆盖 |
| 列表布局 | ✅ | `ui.List` 单列，缩略图/名称/元数据/标签/日期 |
| justified / waterfall | ⛔ | `GridView` 固定行高；未实现宽度驱动的 justified 排版 |

### 2.3 阶段 3：设置、移动连接、壳

| 功能 | 状态 | 说明 |
|---|---|---|
| Settings 窗口 | ✅ | 通用/快捷键/插件说明/网络/数据/扩展/移动/关于 |
| 外观（system/light/dark） | ✅ | `core.SetTheme` + 事件广播；所有窗口重绘 |
| 语言（system/en/zh） | 🟡 | 核心文案 en/zh 覆盖；非完整 i18n 资源体系 |
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

## 4. 已知缺口

### 4.1 明确不做（按需求）

1. **插件系统**：无插件管理页、无插件预览宿主、无市场/安装/启停 UI、插件深链只提示。`PluginManager` 仍在 core 中，`api_server` 的插件 HTTP 路由随服务启动，但不保证可用。
2. **视频/音频播放**：mygo `ui` 无视频解码与 `<video>`；native 版只显示封面与元数据，播放交给系统默认应用。
3. **GIF 动画**：当前 `Bitmap` 静态首帧；`image/gif` + `Bitmap.Update` 的逐帧方案已在方案中给出，但本轮未接。
4. **DMG 打包**：只出二进制；`hdiutil` 沙箱不可用。

### 4.2 体验/交互缺口

5. **justified / waterfall 布局**：仅 Grid（固定行高）与 List。`GridView` 不支持按宽度动态行高。
6. **框选（marquee）**：支持 Cmd/Shift 多选，不支持拖框选择。
7. **触控板捏合缩放**：行高只能按钮调整；`ui` 没有直接捏合事件。
8. **预览缩放/平移**：图片只做 Contain/窗口大小，无滚轮缩放、拖动、1:1/适应切换。
9. **拖拽历史**：webview 的 History 虚拟集合未做。
10. **include subfolders 开关**：侧栏选中父文件夹时未提供“包含子文件夹”筛选。
11. **标签独立 CRUD**：检查器可新增/删除素材标签，但侧栏没有“删除标签”入口。
12. **多选检查器的批量评分/备注**：只做批量标签、文件夹、删除/恢复。
13. **i18n**：仅 en/zh 的内联文案；没有接入完整 `frontend/src/messages` 资源，也没有 RTL 专门验证。
14. **无障碍**：主要控件有 Label，但未逐控件做 VoiceOver 验证；自绘行/网格的 role 依赖 `ui` 默认值。
15. **Windows/Linux**：仅 macOS arm64 实测；代码使用 mygo 跨平台 API，但未在另两平台构建/运行。
16. **webview 版回归**：未改动 `main_mygo.go`/frontend，但本轮未重新跑 webview 版交互回归。

### 4.3 技术债务 / 已知问题

17. **mygo v0.5.5 `Window.Update` 重绘不稳定**：在本机后台窗口状态下，`Update` 会执行回调但不重建 native Content；`Invalidate` 也只重绘不重建。已用“非焦点窗口时做一次 +2 px 再还原的内容尺寸调整”兜底（`App.nudgeRepaint`，20 ms 合并），保证后台加载/缩略图/导入进度能出现。焦点窗口不做该兜底。这个 workaround 可能在真实交互中带来极轻微的尺寸抖动，后续应在 mygo 侧修复或换成官方重绘 API。
18. **缩略图缓存上限**：96 MB / 300 项；大库快速滚动会重复解码被淘汰的缩略图，后续可做磁盘级小图缓存或按可见窗口预取。
19. **首次建库/切换库的交互**：代码路径完整，但本轮主要通过临时库和 seed 脚本验证，未做逐按钮人工点选录屏。
20. **二维码依赖**：`internal/qr` 是 vendored 源码，升级需手动同步；`go.mod` 只新增了 mygo/ui 间接依赖。

## 5. 后续路线

1. **修 mygo 重绘**：向 mygo 反馈 `Window.Update` 对 native Content 的重建问题，移除 resize workaround。
2. **媒体**：接入视频解码（AVFoundation/FFmpeg 抽帧或帧缓冲）或至少做逐帧 GIF；音频做波形/时长展示。
3. **网格布局**：在 `GridView` 之上实现 justified 行布局（按容器宽度动态分行，`ui.List` 的变高行 + 预计算行高），补 waterfall。
4. **交互补齐**：框选、捏合缩放、预览缩放/平移、include subfolders、拖拽历史、标签删除、批量评分。
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
