# Bowerbird v3 WebSocket 推送链路修复方案

- 分支：`feature/mobile-v3`
- 文档性质：正式修复方案与实施指引（先文档后开发）
- 依据：`/tmp/bowerbird-v3-wsfix2-brief.md` 确诊根因

---

## 一、根因陈述（已实测确诊）

主会话实测证明：移动端 WebSocket 鉴权、心跳、信封封装及局域网广播机制均正常工作。当桌面端或移动端执行上传并走入已有调用点时，移动端能瞬时接收到 `items_updated`。

推送同步失效的真正根因聚焦在两个层面：

1. **PC 端广播覆盖面不足（后端漏网）**：
   - 当前 `core/library.go` 内 `notifyItemsUpdated()` 仅在三处被触发：
     - 行 1180：`runConcurrentImportJobs`
     - 行 1272：`commitImportBatch`
     - 行 2324：`DeleteItem`
   - 大量改变素材集合与元数据的关键 Public API 均未调用 `m.notifyItemsUpdated()`：
     - `UpdateItemDetails`（包括行 1672 的 upsert 场景，仅发了 Wails 的 `library-items-upserted` 事件）
     - `MoveToTrash`（行 2860）与 `BatchMoveToTrash`（行 2927）
     - `RestoreFromTrash`（行 3068）与 `BatchRestoreFromTrash`（行 3131）
     - `EmptyTrash`（行 3142）
     - `DeleteFolder`（行 2698）与 `RemoveItemFromFolder`（行 2783）
     - `AddItemToFolder`（行 2757）、`SetItemFolders`（行 2808）、`MoveItemToFolder`（行 3288）
     - 标签与重命名相关变更：`RenameItem`、`AddTagToItem`、`RemoveTagFromItem`、`SetItemTags`、`DeleteTag`
   - 导致用户在 PC 端编辑属性、整理标签与目录、挪入/移出废纸篓时，移动端完全处于盲区，永不感知变化。

2. **移动端节流与生命周期兜底缺失（前端丢事件）**：
   - `mobile/lib/screens/home_screen.dart` 的 `_loadItems` 开头存在硬拦截：
     ```dart
     if (_isLoading) return;
     ```
     在初始加载、分页加载或前一次刷新未完成期间，若 WebSocket 收到 `items_updated` 或 `library_changed`，刷新事件被直接丢弃，导致界面与桌面端数据不一致。
   - 当应用从手机后台切回前台（`AppLifecycleState.resumed`）时，未注册 `WidgetsBindingObserver` 监听生命周期；若后台期间 WebSocket 被系统休眠挂断或错过了推送，切回前台既不检测重连，也不会主动补拉一次最新列表。

---

## 二、逐文件改动清单与实施顺序

### 1. 文档阶段（第一段）
- **文件**：`reports/ws推送修复方案.md`
- **提交**：`docs: ws推送修复方案`

---

### 2. PC 端核心改动（第二段第 1 步）
- **文件**：`core/library.go`
- **改动原则**：
  - 凡是改变素材集合或素材元数据的 Public 方法，成功路径结尾补调用 `m.notifyItemsUpdated()`。
  - **避免重复广播**：
    - `PermanentDeleteItem` 内部调用了 `DeleteItem`，`DeleteItem` 已发通知，`PermanentDeleteItem` 无需重复发。
    - `BatchRestoreFromTrash` 内部循环调用 `RestoreFromTrash`，`RestoreFromTrash` 已发通知，`BatchRestoreFromTrash` 无需重复发。
    - `ImportFromBase64WithOptions`、`ImportFromURLWithOptions` 等若命中已有素材去重更新分支（UpdateItemDetails），由该方法内触发通知；若走批导入/新建则走现有 commit 逻辑。
  - **加锁死锁自查**：
    - `notifyItemsUpdated()` 内部会调用 `m.GetActiveLibrary()`，而 `GetActiveLibrary()` 申请 `m.mu.RLock()`。
    - 因此调用 `m.notifyItemsUpdated()` 时，当前 goroutine 绝不能持有 `m.mu.Lock()` 或未释放的读写锁。
    - 检查目标方法：`UpdateItemDetails`、`MoveToTrash`、`BatchMoveToTrash`、`RestoreFromTrash`、`EmptyTrash`、`DeleteFolder`、`AddItemToFolder`、`RemoveItemFromFolder`、`SetItemFolders`、`MoveItemToFolder`、`RenameItem`、`AddTagToItem`、`RemoveTagFromItem`、`SetItemTags`、`DeleteTag`。这些函数在执行数据库与内存缓存写操作时均在函数前段已执行了 `m.mu.RUnlock()`，或在结尾已无锁。在 `return nil` / 成功 `return item, nil` 之前调用 `m.notifyItemsUpdated()` 是完全安全的，不会引发死锁。
- **具体补齐方法**：
  1. `UpdateItemDetails`：成功更新后调用 `m.notifyItemsUpdated()`。
  2. `MoveToTrash`：成功软删除后调用 `m.notifyItemsUpdated()`。
  3. `BatchMoveToTrash`：长度大于 1 时的成功返回前调用 `m.notifyItemsUpdated()`（长度为 1 时内部调用了 `MoveToTrash`）。
  4. `RestoreFromTrash`：成功恢复后调用 `m.notifyItemsUpdated()`。
  5. `EmptyTrash`：清空回收站成功后调用 `m.notifyItemsUpdated()`。
  6. `DeleteFolder`：级联删除文件夹成功后调用 `m.notifyItemsUpdated()`。
  7. `AddItemToFolder`、`RemoveItemFromFolder`、`SetItemFolders`、`MoveItemToFolder`：文件夹归属变更成功后调用 `m.notifyItemsUpdated()`。
  8. `RenameItem`：修改素材展示名成功后调用 `m.notifyItemsUpdated()`。
  9. `AddTagToItem`、`RemoveTagFromItem`、`SetItemTags`、`DeleteTag`：标签变更成功后调用 `m.notifyItemsUpdated()`。

---

### 3. PC 端测试补全（第二段第 2 步）
- **文件**：`core/mobile_api_test.go`
- **改动内容**：
  - 在移动 API 测试套件中增加独立测试函数 `TestMobileWebSocketItemsUpdatedCoverage(t *testing.T)`。
  - 建立客户端并连接 `/api/v1/ws?token=...`。
  - 导入一条测试素材。
  - 分别触发以下关键方法，并断言 WebSocket 均能在短超时（如 2 秒）内读取到 `items_updated`：
    1. `mgr.UpdateItemDetails(item.ID, "updated note", "", 4, "prompt")` -> 验证收到 `items_updated`。
    2. `mgr.MoveToTrash(item.ID)` -> 验证收到 `items_updated`。
    3. `mgr.RestoreFromTrash(item.ID)` -> 验证收到 `items_updated`。
  - 提交：`fix: 补齐 PC 端素材变更的 WebSocket 广播覆盖`

---

### 4. 移动端改动（第二段第 3 步）
- **文件 1**：`mobile/lib/services/websocket_service.dart`
  - 暴露只读状态 `bool get isConnected => _socket != null && _socket!.readyState == WebSocket.open;`（同时考虑已建连的正常状态）。
- **文件 2**：`mobile/lib/screens/home_screen.dart`
  - 状态混入 `WidgetsBindingObserver`。
  - 增加 `bool _pendingRefresh = false;` 标志。
  - 改写 `_loadItems({bool refresh = false})`：
    - 若 `refresh` 为 true 且 `_isLoading` 正在运行，则 `_pendingRefresh = true; return;`。
    - 在加载完成（`finally` 块中）检查：若 `_pendingRefresh` 为 true，重置 `_pendingRefresh = false`，并在微任务或下一个 event loop 触发 `_loadItems(refresh: true)`。
  - 实现 `didChangeAppLifecycleState(AppLifecycleState state)`：
    - 当 `state == AppLifecycleState.resumed` 时：
      - 检查 `if (!WebSocketService.instance.isConnected) WebSocketService.instance.connect();`
      - 无论连接状态如何，均主动补拉一次 `_loadItems(refresh: true)` 确保界面新鲜度。
  - 提交：`fix: 移动端处理并发刷新丢包并在切回前台时重连补刷`

---

### 5. 编译、打包与桌面端热替换（第二段第 4 步）
1. `flutter analyze` 确保 0 issue。
2. Flutter 编译：执行 `flutter build apk --release --split-per-abi --obfuscate --split-debug-info=debug-info/`，生成产物位于 `mobile/build/app/outputs/flutter-apk/app-arm64-v8a-release.apk`。
3. 桌面端编译与重启：
   - 执行 `go build -o bin/bowerbird.app/Contents/MacOS/bowerbird .`
   - 重启正在运行的桌面端进程（若已启动）：查找并平滑 kill 旧进程，启动新的 `bin/bowerbird.app`。
4. 撰写实施总结并追加至 `reports/v3 开发报告.md` 第六节。
5. 提交：`docs: 追加 v3 开发报告推送链路修复记录`

---

## 三、每项改动的验证方法

1. **PC 端死锁自查**：
   - 静态分析 `library.go` 中所有新增 `m.notifyItemsUpdated()` 点的锁状态，确保此时 `m.mu` 处于未加锁状态。
   - `go test -race ./core` 或 `go test -v ./core -run TestMobileWebSocketItemsUpdatedCoverage`，确保高频触发不阻塞。
2. **PC 端单元测试验证**：
   - 运行 `go test -v ./core` 与 `go vet ./core`，断言全部测试 PASS。
3. **移动端静态分析验证**：
   - 运行 `flutter analyze`，输出应为 `No issues found!`。
4. **产物存在性验证**：
   - 验证 `mobile/build/app/outputs/flutter-apk/app-arm64-v8a-release.apk` 存在且体积符合预期（约 20MB 上下）。
   - 验证 `bin/bowerbird.app/Contents/MacOS/bowerbird` 二进制时间戳为最新构建。

---

## 四、风险与回滚点

| 风险项 | 潜在表现 | 防范与消除措施 | 回滚点 |
| :--- | :--- | :--- | :--- |
| **Go 读写锁死锁** | PC 端在调用 `MoveToTrash` 等方法时程序卡死 | `notifyItemsUpdated` 仅需读 `m.activeLib.ID`，且该函数在方法主操作完成且 `m.mu.RUnlock()` 执行后触发，绝不在事务或持互斥锁区间调用。 | 移除相关 public 方法末尾的 `notifyItemsUpdated()` 即可恢复。 |
| **移动端无限刷新死循环** | `_pendingRefresh` 处于 `finally` 触发导致死循环 | 设置 `_pendingRefresh = false` 必须在重新发起 `_loadItems` 之前完成，且只在 `refresh: true` 请求到达且当前正在加载时置位。 | 取消 `_pendingRefresh` 逻辑，退回至节流防抖处理。 |
| **WebSocket 重连冲突** | `resumed` 重复调用 `connect()` 导致多 socket | `WebSocketService.connect()` 内部已具备 `_socket?.close()` 与取消重连定时器机制；结合 `isConnected` 判断仅在断开时触发。 | 保持现有定时器重试，去除前台手动触发。 |

---
实施阶段将严格按此方案流水线推进，本地小步提交，不 push 分支。
