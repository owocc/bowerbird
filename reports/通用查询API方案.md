# 通用查询 API 与移动端变更通知方案

> 分支：`feature/mobile-share-intent`
> 范围：`core/`、`mobile/`；不改桌面 UI 行为
> 结论：新增 `POST /api/v1/query`，由 core 统一解析查询字符串、过滤、排序、分页并返回总数；移动端浏览/搜索全部切到该接口；移动端写路径接入桌面事件总线与 ws 广播，移动端订阅后防抖重跑当前查询。

---

## 1. 现状盘点

### 1.1 查询链路（重要修正）

任务书假设「桌面端把筛选条件编码成查询字符串交给 `Service.GetItems`」。实际代码不是这样：

| 层 | 实际实现 |
|---|---|
| 桌面前端 | 路由参数/React state 保存筛选条件（`frontend/src/lib/workspace-search.ts` 的 `WorkspaceSearch`），`GetItems("", sortOrder)` 只取全量素材，随后在 `LibraryWorkspace.tsx:1006-1193` **前端内存过滤**。 |
| core `LibraryManager.GetItems(query, sortOrder)` | `query` 只是**一个整串小写子串**，匹配 `name + tags + extension + hex + note + prompt`（`buildItemSearchKey`，`core/library.go:430`），按 `ImportedAt` 升/降序返回全量。没有 `type:`/`tag:` 语法解析。 |
| 移动 `handleItemsList` | 自己内联了一套过滤（tag/folder/color/type/orientation），offset/limit 在过滤结果上切片；limit 默认 50、上限 200。搜索页固定 `limit=100`，所以表现为「只能搜到 100 个」。 |

因此「复用桌面同款查询引擎」落地为：**在 core 抽取一个查询引擎**，其过滤谓词逐条对齐桌面 `LibraryWorkspace` 的过滤语义，文本搜索复用 `GetItems`/`buildItemSearchKey`；桌面前端本轮不改（仍走本地过滤），移动端与旧 `/items` 都收敛到该引擎，删除移动端第二套过滤。

桌面过滤语义清单（作为查询契约的语义来源）：

| 维度 | 桌面实现 | 备注 |
|---|---|---|
| 文本 | `searchQuery.trim().toLowerCase()` 对 name/extension/hex/note/prompt/tags 做**整串子串**匹配 | 不是按空格分词 |
| type | `getFileCategory(ext, mime)`：image/video/audio/document/archive/other | `ts` 按 mime 区分 video/document |
| tag | 侧栏选中 tag 用 `tags.includes(activeTag)`（精确、大小写敏感）；移动旧接口用 `EqualFold` | 统一采用大小写不敏感精确匹配 |
| folder | `folders.includes(folderId)`；另有 uncategorized | 不递归子文件夹 |
| color | dominantColor + palette，redmean 距离 ≤ 115 | 移动已有同实现 |
| orientation | `meta.orientation`，否则宽高比 ±5% 判 square，否则 landscape/portrait | 移动旧实现无 5% 容差且默认 landscape |
| size | <1MB small；1–10MB medium；>10MB large | |
| has | URL / note 是否存在 | |
| rating | 精确相等 | |
| untagged / uncategorized | tags 为空 / folders 为空 | |
| 排序 | `importedAt` desc/asc | 历史/废纸篓视图除外 |

### 1.2 通知拓扑

**发送端（core）**

| 路径 | 桌面事件 | ws `items_updated` |
|---|---|---|
| `runConcurrentImportJobs`（桌面/移动上传共用） | 每批 >1 条时 `library-items-upserted`；`import-completed` 仅 Service 层 | 每批提交 + 结束时各一次（重复） |
| `ImportSingleFileWithTags` | 单条不 emit `upserted` | `commitImportBatch` 内一次 |
| `ImportFromBase64WithOptions` | `upserted` + `library-item-imported` | **无** |
| `ImportFromURLWithOptions` | `upserted` | **无** |
| `MoveToTrash` / `BatchMoveToTrash` / `RestoreFromTrash` / `EmptyTrash` | **无** | 有 |
| `DeleteItem` / 文件夹/标签/改名/详情/收藏/缩略图 | 部分 `upserted`，删除无 | 有 |
| `OpenLibrary` / `CloseLibrary` | `library-opened`（Service/移动切换） | `library_changed` |
| 移动 `handleUpload` | 无（依赖 import 内部） | 有，且**额外再广播一次** |
| 移动 DELETE `handleItemDelete` | **无** | 由 `MoveToTrash` 广播一次 |

**接收端**

| 接收方 | 监听 |
|---|---|
| 桌面 UI | `library-opened`/`library-closed`、`import-*`、`library-items-upserted`、`library-items-trashed`、`library-items-updated`（`useFileDrop`，350ms 节流） |
| 移动 App | ws `items_updated`、`library_changed`、`pairing_revoked`；仅 HomeScreen 订阅，SearchScreen 不订阅 |

**缺口矩阵**

| 变更来源 → 观察方 | 桌面 UI | 移动 ws | 移动当前列表 | 结论 |
|---|---|---|---|---|
| 桌面导入（文件/拖拽） | 有（import 事件） | 有 | Home 有 | 基本通 |
| 桌面 base64/URL 导入 | 有 upserted | **无** | **无** | 补 `notifyItemsUpdated` |
| 桌面编辑（标签/文件夹/详情/改名/收藏/缩略图/删除） | 前端本地更新 | 有 | Home 有 | 通 |
| 桌面移到废纸篓 | 前端本地更新 | 有 | Home 有 | 通 |
| 移动上传 | **无（单条）/不稳定（多条）** | 有，但重复 | Home 手工刷新；搜索页无 | 桌面补事件、去重 ws |
| 移动删除 | **无** | 有 | Home 手工刷新；搜索页无 | 桌面补 trashed 事件 |
| 移动切换资源库 | 有 `library-opened` | `library_changed` | Home 有 | 通 |
| 移动上传/删除 → 搜索页 | — | 有 | **无** | 搜索页订阅 + 防抖 |

### 1.3 本轮接线方案

1. 移动写路径统一走 manager 的 ws 通知，删除 `handleUpload` 里多余的 `Broadcast`。
2. `handleUpload` 成功后向桌面 emit 一次 `library-items-upserted`（携带导入条目），桌面增量插入/刷新。
3. `handleItemDelete` 成功后向桌面 emit 一次 `library-items-trashed`（携带 id），桌面乐观移除。
4. `commitImportBatch` 不再自己 `notifyItemsUpdated`（消除一次导入的多次 ws 通知）；由 `runConcurrentImportJobs` 结束时统一通知，`ImportSingleFileWithTags` 单独补一次。
5. `ImportFromBase64WithOptions`、`ImportFromURLWithOptions` 补 `notifyItemsUpdated`。
6. 移动 Home/Search 订阅 `items_updated`，350ms 防抖合并后重跑当前查询窗口；本地上传/删除成功后立即重跑。

---

## 2. 查询语法契约

查询字符串为一组空格分隔的 token；带空格的值用双引号，例如 `tag:"client work"`。

| 语法 | 含义 | 对应桌面 |
|---|---|---|
| `foo bar` / `"foo bar"` | 剩余自由文本按整串子串匹配 name/tags/extension/hex/note/prompt（大小写不敏感） | 搜索框 |
| `type:image\|video\|audio\|document\|archive\|other` | 文件大类 | FilterBar type |
| `type:pdf` 等非大类值 | 扩展名精确匹配 | 兼容旧接口 `type` |
| `tag:<name>` | 含该标签（大小写不敏感，可重复，AND） | 标签侧栏 |
| `folder:<folderId>` / `folder:none` | 属于该文件夹 / 未归类 | 文件夹筛选 |
| `color:#RRGGBB` | dominantColor 或 palette redmean 距离 ≤115 | 颜色筛选 |
| `orientation:landscape\|portrait\|square` | 方向（meta 优先，宽高比 ±5% 判 square） | 方向筛选 |
| `size:small\|medium\|large` | <1MB / 1–10MB / >10MB | 大小筛选 |
| `rating:1..5` | 精确评分 | 评分筛选 |
| `has:url\|note\|prompt\|tag\|folder` | 具备对应字段 | URL/备注存在性 |
| `is:untagged` / `is:uncategorized` | 无标签 / 无文件夹 | 特殊文件夹 |

规则：

- 多个过滤 token 之间为 AND；同一 key 重复出现也为 AND。
- 未知 `key:value` 视为自由文本（向前兼容）；已知 key 的非法值返回 `400 INVALID_QUERY`。
- 默认排除废纸篓（与移动列表一致）。
- 排序仅 `desc`/`asc`，按 `ImportedAt`，与 `GetItems` 一致。
- 文本 token 与过滤 token 混排时，过滤 token 从文本中剔除，剩余文本按原顺序以单空格连接。

取舍说明：

- 桌面过滤在前端，无法直接复用「同一函数」；本轮在 core 按上表逐条复刻，并让它成为移动端唯一实现。桌面行为不改。
- 不把桌面前端切到新接口：会触碰桌面 UI/状态管理，超出本轮范围，且桌面已全量加载 + 虚拟滚动。语义一致性由同一份契约测试保证。
- 文本保持「整串子串」而不是分词 AND，是为了与桌面搜索框行为一致。

---

## 3. 接口定义

### `POST /api/v1/query`

请求：

```json
{
  "query": "type:image tag:red color:#EF4444 orientation:landscape",
  "sort": "desc",
  "offset": 0,
  "limit": 100
}
```

| 字段 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `query` | string | `""` | 上节语法；空串 = 浏览全部 |
| `sort` | string | `"desc"` | `desc`/`asc` |
| `offset` | int | `0` | ≥0，超过 total 返回空数组 |
| `limit` | int | `100` | 1–500；500 上限防滥用，可分页取完 |

响应 `200`（摘要字段与 `MobileItemSummary` 完全一致）：

```json
{
  "total": 1420,
  "limit": 100,
  "offset": 0,
  "items": [ { "id": "...", "name": "...", "thumbnailUrl": "...", "...": "..." } ]
}
```

错误：`400 INVALID_QUERY|INVALID_BODY`、`401 UNAUTHORIZED`、`405 METHOD_NOT_ALLOWED`、`503 NO_ACTIVE_LIBRARY`。

选择 `POST` 的理由：查询字符串含空格/引号/`#`，放 query parameter 需要双重编码且长度受限；POST 无副作用、JSON body 更清晰，也方便以后加 facets。路径 `/api/v1/query` 与资源型 `/items` 区分。

与旧 `/api/v1/items` 的关系：

- **保留**，作为旧版手机/旧客户端的兼容接口，不带版本协商成本。
- 内部改为把旧参数翻译成 `QuerySpec` 后调用同一引擎，删除内联过滤。旧接口的 `limit` 上限仍为 200，行为兼容。
- 移动端新版本只调用 `/query`；探测到 `404/405` 时降级回 `/items`。

---

## 4. 移动端改造点

- **浏览**：Home 调用 `queryItems(query: "", sort: "desc", offset, limit: 60)`；标题显示 `共 N 个素材`（`total`）。
- **搜索/筛选**：Search 用 `QueryBuilder` 把 UI 状态拼成查询字符串：文本 + type + orientation + color + folder + tag，并新增 size/rating/presence 行；`limit=100`，触底继续取，直到 `items.length >= total`。结果栏显示 `共 N 个结果`。
- **分页**：保留 offset/limit 触底加载；总数已知，底部显示 `已加载 X / 共 N`。
- **自动刷新**：
  - ws `items_updated` → 350ms 防抖 → 重跑**当前已加载窗口**（`offset=0&limit=min(loaded,500)`），避免列表闪回第一页；超过 500 条则重置到首页并提示。
  - 本机上传/删除成功后立即重跑当前窗口；随后的 ws 事件被同一防抖窗口合并。
  - 滚动位置不做精确锚定（列表按导入时间倒序，桌面新增会插入顶部），方案上以「保持 offset 与已加载数量」做尽力而为。
- **降级**：`ApiService.queryItems` 首次 `404/405` 后置 `_queryApiSupported=false`，后续直接走旧 `/items`；旧接口忽略查询字符串中的高级过滤时，UI 至少仍可用文本/基础过滤。重新配对/重连后重置探测。

---

## 5. 兼容与契约

- `MobileServerVersion` 从 `1.1.0` 升至 `1.2.0`；`/api/v1/status` 增加 `capabilities: ["query"]`（旧客户端忽略未知字段）。
- `mobile/API.md` 增加 `/query`、查询语法、`items_updated`/`library_changed` 事件、能力探测与降级说明；旧 `/items` 标注 legacy。
- 旧桌面无 `/query`：移动端按 404/405 降级；旧桌面也不会发新事件，但 `items_updated` 兼容不变。
- 不改收件箱、分享标记、分享 Intent 行为。

---

## 6. 验证计划

1. Go 单测：解析器（每个过滤项、组合、引号、非法值）、过滤结果、排序、分页边界、total、旧接口一致性、通知（fake Host + ws 订阅）。
2. `go build ./...`、`go test ./core/...`。
3. Flutter 单测：查询字符串拼装/转义、分页窗口计算、404/405 降级（本地 HttpServer）。
4. `flutter analyze`、`flutter test`。
5. 桌面冒烟：mygo 桌面端 + curl 抽验总数/筛选/分页/排序；curl 上传/删除，观察桌面事件日志与 ws 事件计数。
6. 构建 `bowerbird-query-1021.apk`（arm64 release），记录大小，列真机待验清单。
