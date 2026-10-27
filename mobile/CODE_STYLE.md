# Mobile 代码组织规范

适用于 `mobile/` 下的所有 Dart 代码。目标：**小文件、单一职责、可预测的结构**，
从根本上避免"嵌套过深导致括号对不上"这类问题。

---

## 1. 文件行数

| 类型 | 上限 | 说明 |
| --- | --- | --- |
| 任何 `.dart` 文件 | **400 行** | 硬上限，CI 检查 |
| 理想区间 | 150–300 行 | 超过 300 行就该考虑拆了 |

拆分优先级：`State` 类的逻辑 → 状态机/控制器 → 子 Widget → 私有构建方法。

> 超过 400 行不代表必须立刻拆，但新代码不得让文件继续变长；
> 触碰超限文件时必须先拆分再改功能。

---

## 2. 目录结构

```
lib/
  main.dart                 应用入口，只做装配
  app_keys.dart             全局 Key

  models/                   纯数据模型（fromJson / toJson / copyWith）
  services/                 无 UI 的状态与 IO（API、WS、持久化、业务服务）
  controllers/              页面级状态机（ChangeNotifier / ValueNotifier）
  theme/                    主题、颜色、圆角、间距常量

  screens/<feature>/        一个页面一个目录
    <feature>_screen.dart   组装页面（尽量只做 build + 依赖注入）
    <feature>_controller.dart
    widgets/                该页面专用的子 Widget
  widgets/                  跨页面复用的通用 Widget
  utils/                    无状态工具函数（格式化、计算）
```

**规则**
- 一个页面 = 一个目录；页面专有的 Widget 放 `screens/<feature>/widgets/`，不要污染全局 `widgets/`。
- `screens/*_screen.dart` 里不写业务逻辑，逻辑放 controller 或 service。
- `widgets/` 下的组件不得 import `screens/`（避免循环依赖）。

---

## 3. Widget 拆分

- 单个 `build()` 方法不超过 **80 行**。
- 嵌套深度不超过 **5 层**（`child:` / `children:` 每层算一层）。
- 出现以下情况必须抽成独立 Widget 类（而不是私有方法）：
  - 需要自己的状态或 `AnimationController`
  - 被引用 2 次以上
  - 单个分支超过 20 行
- 私有方法只用于**纯拼装**且仅调用一次的场景；有状态就抽类。

---

## 4. 结构书写（防括号问题）

这些规则是"括号灾难"的直接防线：

1. **`children: [` 列表里每项必带尾逗号**，包括最后一项。
2. **`child:` 一律放在参数列表最后**（`sort_child_properties_last`）。
3. `if`/`else`、三元、`switch` 里不要塞多行 Widget 树；先抽成变量或 Widget 类。
4. 长参数列表一律**垂直展开**，不要一行里塞多个命名参数。
5. 修改深层嵌套前**先运行 `dart format`**，让缩进稳定可读。
6. 每次结构改动后立刻 `flutter analyze`，不要累积多处未验证的改动。

---

## 5. 命名

| 类别 | 约定 | 示例 |
| --- | --- | --- |
| 文件 | `snake_case.dart` | `folder_drawer.dart` |
| Widget 类 | `UpperCamelCase` | `GalleryGrid` |
| 私有 Widget | `_Xxx` 且在**同文件内**使用 | `_HeaderActionPill` |
| controller | `<Feature>Controller` | `HomeController` |
| 私有状态字段 | `_camelCase` | `_crossAxisCount` |
| 常量 | `_kXxx` 或 `static const` | `_kPinchThreshold` |

---

## 6. 状态管理

- 页面状态放 `<Feature>Controller extends ChangeNotifier`，字段私有 + 只读 getter。
- Controller 里**不出现** `BuildContext`、`Navigator`、`ScaffoldMessenger`；
  这些属于表现层，用回调或返回值交给 screen 处理。
- 一次性动作（弹窗、导航、SnackBar）以方法返回值或 `Action` 枚举表达。

---

## 7. 常量

- 魔法数字（间距、圆角、时长、阈值）必须命名，集中在 `theme/app_theme.dart`
  （视觉类）或 controller 内的 `static const`（逻辑阈值类）。
- 颜色不得硬编码 `Color(0xFF...)` 在页面里，走 `AppColors` / `theme.colorScheme`。

---

## 8. 检查清单（提交前）

- [ ] 所有改动文件 ≤ 400 行
- [ ] `dart format` 已运行
- [ ] `flutter analyze` 无 error / warning
- [ ] `flutter test` 通过
- [ ] 新增逻辑有对应测试
- [ ] 没有把页面专有 Widget 放进全局 `widgets/`
- [ ] 没有在 `screens/` 里直接写数据请求的 URL / JSON 解析

---

## 9. 自动化

`mobile/tool/check_size.dart` 检查文件行数上限，可接入 CI：

```bash
dart run tool/check_size.dart
```
