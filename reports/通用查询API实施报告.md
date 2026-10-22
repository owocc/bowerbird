# 通用查询 API 与移动端变更通知实施报告

> 分支：`feature/mobile-share-intent`
> 方案：`reports/通用查询API方案.md`（commit `d7f11c6`）
> 范围：`core/`、`mobile/`；未改动桌面 UI 业务逻辑
> 结论：`POST /api/v1/query` 上线，移动端浏览/搜索统一走该接口；移动上传/删除接入桌面事件总线，桌面 UI 实测收到增量插入/乐观移除；ws 上传/删除各只发 1 次 `items_updated`。

---

## 1. 现状修正：桌面端没有查询字符串引擎

方案阶段确认的事实：桌面端筛选在 **前端内存**完成（`LibraryWorkspace.tsx:1006-1193`），`Service.GetItems(query, sortOrder)` 的 `query` 只是对 `name/tags/extension/hex/note/prompt` 的整串子串匹配（`core/library.go` `buildItemSearchKey`）。因此本轮：

- 在 core 新建 `core/query.go`，实现查询语法解析、过滤谓词、排序/分页；文本匹配复用 `GetItems`，颜色/方向/大小/类别逐条对齐桌面过滤语义。
- 移动端旧 `/api/v1/items` 的内联过滤已删除，改为把旧参数翻译成 `QuerySpec` 后调用同一引擎。
- 桌面 UI 未切换到新接口（不改桌面行为）；两端语义一致性由同一份契约测试和冒烟结果保证。这是「复用同一引擎」在本仓库事实下的落地方式。

---

## 2. 通知拓扑与接线结果

### 2.1 接线前缺口矩阵

| 变更来源 → 观察方 | 桌面 UI | 移动 ws | 移动列表 |
|---|---|---|---|
| 桌面文件导入 | 有 | 有 | Home 有 |
| 桌面 base64/URL 导入 | 有 upserted | **无** | **无** |
| 桌面编辑/标签/文件夹/删除/废纸篓 | 前端本地更新 | 有 | Home 有 |
| 移动上传 | **无（单条）** | 有，但重复 | 仅手工刷新；搜索页无 |
| 移动删除 | **无** | 有 | 仅手工刷新；搜索页无 |
| 移动切库 | 有 | 有 | Home 有 |
| 移动变更 → 搜索页 | — | 有 | **无** |

### 2.2 本轮改动

1. `core/library.go`
   - `commitImportBatch` 不再自行 `notifyItemsUpdated`，改由调用方统一发一次：`runConcurrentImportJobs` 结束时一次，`ImportSingleFileWithTags` 一次。
   - `ImportFilesFromMobile`：移动上传走「不逐批发桌面 upserted」的导入路径，由移动 handler 在导入完成后发一条合并事件，避免多条素材上传时重复通知。
   - `ImportFromBase64WithOptions` 补 `notifyItemsUpdated`（覆盖 base64/URL 导入，URL 内部转 base64）。
2. `core/mobile_api.go`
   - `handleUpload`：改用 `ImportFilesFromMobile`；成功后 `emit("library-items-upserted", items)` 一次；删除原先与 manager 重复的 `Broadcast("items_updated")`。
   - `handleItemDelete`：`MoveToTrash` 已广播 ws；新增 `emit("library-items-trashed", [id])` 通知桌面 UI，不重复广播。
   - 切库路径原已 `emit(LibraryOpenedEvent)`，未改。
3. `mobile/`
   - Home/Search 订阅 `items_updated`，经 `RefreshGate`（350ms）合并后重跑当前窗口。
   - 本机上传/删除后立即重跑，并用 900ms 窗口抑制紧随其后的 ws 重复刷新。
   - Search 页原先完全不订阅 ws，现已订阅。

### 2.3 实测证据（mygo 桌面端 app.log）

移动端 curl 上传 1 个 PNG 后：

```
[PERF][perf] React state handleItemsUpsertedInPlace — upserted=1 brandNew=1 anyUpdated=false totalItems=119
```

移动端 DELETE 后：

```
[PERF][core] Backend MoveToTrash executed — id=510A...
[PERF][perf] Optimistic move to trash state update — removed=1 remaining=118
```

ws 订阅端计数（同一进程内，上传后删除，各等待 1.2s）：

```
upload items_updated=1
delete items_updated=1
```

即：桌面 UI 收到刷新，移动端每次变更只收到一次 `items_updated`。

---

## 3. 接口实测

桌面端：`build/mygo/darwin-arm64/Bowerbird.app`（最终代码重建），隔离 user data，测试库 118 个有效素材（另有 3 个废纸篓条目）。移动服务因 17878 被既有进程占用回落到随机端口。

`GET /api/v1/status`：

```json
{"name":"SmokeLib","version":"1.2.0","itemCount":121,"pairingRequired":true,"capabilities":["query"]}
```

| 请求 | 结果 |
|---|---|
| `{"query":"","limit":5}` | `total=118`，返回 5 条（`smoke-059, smoke-061, smoke-062, smoke-063, smoke-064`）；分页生效 |
| `{"query":"tag:even","limit":3}` | `total=53`，3 条 |
| `{"query":"type:image","limit":1}` | `total=118` |
| `{"query":"color:#FF0000","limit":10}` | `total=1`，`smoke-000` |
| `{"query":"orientation:portrait","limit":1}` | `total=65` |
| `{"query":"rating:5 has:note","limit":2}` | `total=9` |
| `{"query":"smoke-129","limit":2}` | `total=1`，`smoke-129` |
| `{"query":"","sort":"asc","limit":2}` | `smoke-058, smoke-057`（与 desc 顺序相反） |
| `{"query":"","offset":116,"limit":10}` | `total=118`，返回 2 条（末页不截断） |
| `{"query":"","offset":999,"limit":10}` | `total=118`，0 条 |
| `{"query":"rating:9"}` | `400 {"code":"INVALID_QUERY", ...}` |
| `GET /api/v1/items?tag=even&limit=2` | `total=53`，2 条（旧接口兼容且共用引擎） |

分页实测覆盖 `offset=0/116/999`，limit=5/10/100 均正确；搜索空间不再受 100 条限制。

---

## 4. 测试结果

| 项 | 命令 | 结果 |
|---|---|---|
| Go 构建 | `go build ./...` | 通过 |
| Go 单测 | `go test ./core/... -count=1` | `ok bowerbird/core` |
| Go 新增覆盖 | `TestParseQuery`、`TestFileCategory`、`TestQueryItemsEngine`、`TestMobileQueryEndpoint`、`TestMobileMutationNotifications`、`TestImportFromBase64NotifiesMobile` | 全部通过 |
| Flutter 静态检查 | `flutter analyze` | `No issues found!` |
| Flutter 单测 | `flutter test` | 17 个测试全部通过 |
| 桌面构建 | `CGO_ENABLED=1 go tool mygo build -platform darwin/arm64 -skip-dmg` | `Bowerbird.app` 21.8 MB |

Go 测试覆盖：语法（自由文本/引号/全部过滤项/`no:` 缺失过滤/非法值）、类别映射、组合过滤、升降序、分页边界、total、旧接口一致性、能力声明、上传/删除后的桌面事件与 ws 事件次数、base64 导入的 ws 通知。

Flutter 测试覆盖：查询字符串拼装与转义（含把 `tag:red` 当文本）、presence 映射、350ms 防抖合并/取消、`/query` 404 后降级到 `/items` 并缓存能力。

---

## 5. APK

| 项 | 值 |
|---|---|
| 文件 | `mobile/build/app/outputs/flutter-apk/bowerbird-query-1021.apk` |
| 架构 | `android-arm64`，release |
| 大小 | 34,905,799 字节（33.3 MiB） |
| SHA-256 | `027aaa8f12683b1b05068db9417b825828f300be3c17e383f0e6e9ceeee3a6a9` |

构建命令：`cd mobile && flutter build apk --release --target-platform android-arm64`。

---

## 6. 契约文档

`mobile/API.md` 已更新：

- `MobileServerVersion` 1.2.0，`/status` 增加 `capabilities: ["query"]`。
- 新增 `POST /api/v1/query` 请求/响应、完整查询语法（含 `no:`）。
- 旧 `/api/v1/items` 标记为 deprecated，但保留且共用引擎。
- 新增 WebSocket 变更事件表（`items_updated` / `library_changed` / `pairing_revoked`）与防抖建议。
- 新增 `INVALID_QUERY`、`INVALID_BODY` 错误码和 404/405 降级说明。

---

## 7. 真机待验清单

1. 手机上传单个/多个素材 → 桌面网格立即出现（无需手动刷新），且桌面无重复条目。
2. 桌面删除/移入废纸篓 → 手机 Home 与 Search 在约 350ms 内自动刷新，滚动位置不明显跳动。
3. 手机删除素材 → 桌面卡片立即消失（`library-items-trashed`）。
4. 搜索一个总数 >100 的结果（如 `tag:even` 53 条或全库 118 条）→ 结果栏显示「共 N 个结果」，触底可继续加载直至 `已加载 = 共 N`。
5. 浏览页标题显示「共 N 个素材」，触底分页加载。
6. 手机连接旧版桌面（<1.2.0）→ 首次 `/query` 404 后自动降级，浏览与文本/标签/文件夹/颜色/类型/方向筛选仍可用，不崩溃。
7. 手机切换资源库 → 桌面窗口跟随切换；手机列表重置。

---

## 8. 已知取舍与待办（未顺手修改）

1. **桌面筛选仍在前端**：本轮只把语义下沉到 core 供移动端复用，未改桌面 `LibraryWorkspace` 的过滤实现，避免触碰桌面 UI/状态。若后续要让桌面也走 `/query`，需要改造其全量加载 + 虚拟滚动路径。
2. **旧接口上限 200 保留**：为兼容旧客户端，`/items` 仍限制 `limit<=200`；新接口上限 500，均可分页取完。
3. **`/status.itemCount` 与查询 total 口径不同**：`itemCount` 来自数据库总行数（含废纸篓），`/query` 默认排除废纸篓。实测 121 vs 118。属既有状态字段行为，未改；移动端总数以 `/query.total` 为准。
4. **分页排序稳定性**：同一秒导入的素材 `ImportedAt` 相同，排序以缓存顺序为次级次序；桌面同样如此，未额外引入 ID 兜底。
5. **滚动位置**：刷新时按「已加载条数」重取首页以保持列表长度，但新增素材插入顶部仍会使视觉内容位移；未做锚点/scroll offset 补偿。
6. **旧接口高级过滤降级**：旧桌面 `/items` 不支持 size/rating/presence；降级后这些筛选被忽略，基础筛选仍工作，已在文档标注。
7. **桌面端 17878 被既有 Bowerbird 进程占用**：冒烟时新进程回落到随机端口，不影响结论；正式使用需避免双实例或由设置调整端口。
