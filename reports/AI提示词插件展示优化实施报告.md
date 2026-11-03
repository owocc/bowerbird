# AI 提示词插件展示优化实施报告

日期：2026-11-03
范围：远程元数据插件 `plugins/prompt-metadata`（`official.prompt-metadata`）
版本：`1.0.0-alpha-1` → **`1.0.1`**

## 1. 需求与实现映射

| 需求 | 实现位置 | 说明 |
| --- | --- | --- |
| 去除属性左侧图标 | `plugins/prompt-metadata/src/index.tsx` 头部 | 删除标题左侧的 Sparkles 图标块（原 18×18 圆角方块），仅保留标题文本；标题排版改为与宿主 accordion 一致的 10px / 半粗 / 大写 / muted，去掉重复分隔线（宿主 `Accordion` 已有 `divide-y`） |
| 去除字数统计 | 头部 + 弹窗标题 | 删除 `labels.chars` 与两处字符数徽章（头部、弹窗），`hasPrompt` 改为 `promptValue.trim().length > 0` 判断，不再有多余信息噪声 |
| 增加复制按钮 | 头部 + 弹窗头部 `ActionButton` | 纯图标按钮（无文案），`title`/`aria-label` 提供「复制 / 已复制」提示，成功后图标切换为对勾、颜色转绿并 1.6s 复位；`navigator.clipboard` 失败时回退 `textarea + execCommand('copy')` |
| 限制提示词输出最大高度 | `PREVIEW_MAX_HEIGHT = 120` / `EDITOR_MAX_HEIGHT = 168` | 阅读区与内联编辑区都改为「固定上限 + 内部滚动」（`maxHeight` + `overflowY: auto` + `overscroll-behavior: contain`），侧边栏不再被长提示词撑高 |
| 支持展开提示词（Dialog） | `PromptDialog` | 头部展开按钮 / 阅读区双击 / 底部「展开」三处入口；弹窗内可直接编辑全文、复制、`⌘/Ctrl + Enter` 保存、`Esc` 或点击遮罩关闭 |
| 精简侧边栏文案 | 底部动作行 | 删除「Saved automatically / 自动保存」与编辑态「⌘/Ctrl + Enter 保存 · Esc 取消」提示，底部只保留右对齐的按钮；无按钮时整行不渲染（窄侧边栏不再出现被截断的提示文本）；快捷键提示仅保留在空间充裕的弹窗底部 |
| 升级版本号 | `manifest.json`、`package.json`、`src/index.tsx`、`apps/marketplace/src/data/plugins.ts` | 统一到 `1.0.1`，并补 `1.0.1` 更新日志 |
| APP 能力缺失（公开 Dialog 注册） | 见第 5 节 | 当前用插件自带的 Portal 弹窗实现，无需宿主改动；同时提交宿主能力补充申请 |

## 2. 插件侧实现要点

### 2.1 结构

`plugins/prompt-metadata/src/index.tsx` 保持「单文件、零宿主组件依赖」的风格（远程插件只能拿到 `react` / `react-dom` / `react/jsx-runtime` / `@bowerbird/plugin-sdk`）：

- `LABELS`：中/英词条表，`detectLocale()` 读 `navigator.languages`（插件 bundle 无法访问宿主 i18n 实例）。
- `createPalette(isDark)`：优先使用宿主设计令牌 `--border` / `--foreground` / `--muted` / `--muted-foreground` / `--primary` / `--popover` / `--background`，缺失时回落到主题感知的十六进制值，保证在浅色/深色以及「宿主未定义变量」两种情况下都不掉色。
- `usePluginTheme()`：保留原有 `theme` prop → `api.getTheme()` → `document.documentElement.classList` 的三级解析与 `subscribeTheme` 订阅。
- `ActionButton`：本地 hover 状态驱动样式，避免向宿主 `<head>` 注入全局 `<style>`，也避免多主题下 hover 色残留。
- `renderPortal()`：`window.ReactDOM.createPortal` 桥接到 `<body>`；桥不存在时退化为内联渲染（`position: fixed` 仍可用），因此弹窗不会被侧边栏的滚动容器裁剪。
- `PromptDialog`：`role="dialog"` + `aria-modal`，打开时锁定 `body` 滚动、30ms 后聚焦并选中末尾、`Esc` 关闭（捕获阶段监听并 `stopPropagation`，不会误触宿主快捷键）。

### 2.2 交互与数据一致性

- 折叠：`expanded` 状态保持原「点击标题行折叠」的行为，标题行支持 `Enter` / `Space`。
- 阅读态：`maxHeight: 120px` 滚动区，`ResizeObserver` 测量 `scrollHeight > clientHeight`，只有真的被裁剪时才显示「展开」，避免小提示词场景出现无意义按钮。
- 编辑态：`textarea` 等宽字体、`resize: none`、高度上限 168px；`onBlur` 自动保存，`⌘/Ctrl + Enter` 保存，`Esc` 取消（`cancelEditing` 先回滚状态，卸载后的兜底保存自然变成空操作）。
- 取消/完成按钮使用 `onMouseDown + preventDefault`，避免 `mousedown` 先触发 `textarea` 的 `blur` 把「取消」变成「保存」。
- 兜底保存：`pendingRef` 记录 `{ itemId, value, saved }`，组件卸载（详情面板关闭、插件被禁用）时若值仍与已保存值不一致且 `itemId` 未变，则补一次 `api.updateItemDetails`，覆盖「焦点元素被移除不会触发 blur」的丢字场景。
- 回收站视图（`isTrashView`）保持只读：不显示编辑/添加按钮，仍可复制与展开查看。
- 切换素材（`item.id` 变化）时重置本地值并关闭弹窗/编辑态，避免把上一个素材的文本写进新素材。

## 3. 版本升级

| 文件 | 变更 |
| --- | --- |
| `plugins/prompt-metadata/manifest.json` | `version: 1.0.1`；`longDescription` 增加限高滚动、弹窗展开、复制按钮说明；`changelog` 新增 `1.0.1`（2026-11-03）条目 |
| `plugins/prompt-metadata/package.json` | `version: 1.0.1` |
| `plugins/prompt-metadata/src/index.tsx` | `PLUGIN_VERSION = "1.0.1"`，作为 `PreviewPlugin.version` 导出（`remote-loader` 会用 manifest 版本覆盖，两者已对齐） |
| `apps/marketplace/src/data/plugins.ts` | 市场卡片 `version: 1.0.1`，中文 `longDescription` 与 `changelog` 同步更新 |

`core/plugins.go` 的 `CompareSemVer` 按数字段比较，`1.0.1` > `1.0.0` 与 `1.0.0-alpha-1`，因此已安装旧版的用户执行「检查更新」会正确收到升级提示；`scripts/build-plugins.mjs` 产出的产物为 `dist/plugins/releases/official.prompt-metadata-v1.0.1.zip`。

## 4. 验证

1. `pnpm --filter @bowerbird/plugin-sdk build`（SDK `dist` 缺省时首编需要）
2. `cd plugins/prompt-metadata && pnpm run check` → `tsc --noEmit` 通过
3. `node scripts/build-plugins.mjs` → `official.prompt-metadata/index.js` 25.75 kB，打包 `official.prompt-metadata-v1.0.1.zip`（7980 bytes）
4. SSR 冒烟渲染（临时入口 + `vite build --ssr` + `react-dom/server`，验证后已删除）：有提示词时正常输出头部/复制图标/限高阅读区（`max-height` 与 `overflow-y:auto` 均在），无运行时报错；产物中 `chars`、`Saved automatically`、`自动保存` 的匹配数均为 0
5. 产物只保留裸导入 `react` / `react/jsx-runtime`：

```
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
```

`frontend/src/plugins/preview/remote-loader.ts` 的 `rewriteBareImports()` 会把两者替换为宿主 Blob ESM 适配器，`@bowerbird/plugin-sdk` 已被内联进 bundle，无新增裸导入。

## 5. APP 能力缺口与补充申请

### 5.1 现状缺口

远程插件的运行环境（`frontend/src/plugins/preview/remote-loader.ts`）只向插件注入：

- `React` / `ReactDOM` / `jsx-runtime` / `@bowerbird/plugin-sdk`
- `ui`: `Button`、`Badge`、`Switch`、`Card*`（`remote-loader.ts:70-80`）

SDK 的 `PreviewPluginHostAPI`（`packages/plugin-sdk/src/types.ts`）也没有任何弹窗/浮层能力，因此插件**无法使用宿主公开的 Dialog**，只能自带遮罩层。同理，插件拿不到宿主 i18n，词条需要在插件内自带（本次实现为 `LABELS`）。

本次交付的 `PromptDialog` 是自包含实现（Portal + 焦点 + Esc + 滚动锁定），**当前不需要宿主改动即可工作**；但焦点圈管理、层级（z-index）与动画仍然与宿主 Dialog 不一致，属于体验欠账。

### 5.2 申请补充的宿主能力（建议签名）

1. SDK 层（`packages/plugin-sdk/src/types.ts` → `PreviewPluginHostAPI`）：

```ts
export interface PluginDialogHandle {
  close: () => void;
}

export interface PluginDialogOptions {
  title: string;
  description?: string;
  /** 宿主负责 Portal、Esc、焦点捕获、body 滚动锁定与层级 */
  content: React.ReactNode;
  footer?: React.ReactNode;
  size?: "sm" | "md" | "lg" | "full";
  dismissOnBackdropClick?: boolean;
  onClose?: () => void;
}

export interface PreviewPluginHostAPI<TItem = PluginItem> {
  // ...
  /** 使用宿主 Dialog 打开模态框，插件无需自建遮罩 */
  openDialog?: (options: PluginDialogOptions) => PluginDialogHandle;
  /** 复用宿主 i18n，避免插件重复维护词条 */
  translate?: (key: string, values?: Record<string, unknown>) => string;
  subscribeLanguage?: (callback: (locale: string) => void) => () => void;
  /** 插件生命周期钩子（当前只有 onItemUpdated） */
  onPluginActivate?: (callback: () => void) => () => void;
  onPluginDeactivate?: (callback: () => void) => () => void;
}
```

2. 宿主实现点：

- `frontend/src/plugins/preview/types.ts` `createPreviewPluginHostAPI()`：用 `@/components/ui/dialog` 渲染受控对话框，维护 `openDialogs` 栈，复用 `DialogContent` 的层级与动画；
- `frontend/src/plugins/preview/remote-loader.ts` `initHostRuntimeBridge().ui`：额外注入 `Dialog` / `DialogContent` / `DialogHeader` / `DialogTitle` / `DialogFooter` / `DialogClose`（供选择 `BowerbirdHost.ui` 风格而非 API 风格的插件使用）；
- `PreviewPlugin` 增加可选 `onInit` / `onDispose`，与 `plugin:changed` 事件（`installed` / `updated` / `uninstalled` / `enabled` / `disabled`）对齐，便于插件注册全局副作用（快捷键、侧边栏入口）并在禁用/卸载时清理。

3. 落地后的插件切换：

`PromptDialog` 改为先尝试 `api.openDialog?.(...)`（宿主 Dialog），失败再回落到自带的 Portal 实现；词条优先 `api.translate?.("inspector.prompt")`，缺失时使用本地 `LABELS`。这样插件保持向后兼容，老版本宿主仍可运行。

### 5.3 不申请也能接受的部分

`ActionButton` 未使用 `BowerbirdHost.ui.Button`：宿主注入的 Button 没有稳定的尺寸/字号约定（`size="icon-sm"` 等），在 0.68rem 的紧凑行内会显得过大。若后续希望在插件侧统一按钮样式，可把 `Button` 的 `size="xs"` 变体一并纳入注入清单。

## 6. 其他说明

- `frontend/src/plugins/preview/builtin/prompt-plugin.tsx` 是宿主内置的同名参考实现（未注册进默认 registry，见 `registry.ts`），依赖 `Accordion`/`Textarea` 等宿主组件，本次未改变其行为，仅在文件内补充说明：线上实现为远程插件 `official.prompt-metadata`，两者不要重复维护 UI。
- 插件的折叠/限高/弹窗全部在插件内闭环，宿主侧无新增依赖；`dist/` 为构建产物（已 gitignore），升级只需重新 `pnpm run build:plugins`。
