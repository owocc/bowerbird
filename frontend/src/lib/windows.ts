import { useEffect, useState } from "react";

import { isWindows } from "@/lib/platform";

/**
 * Windows 上系统自绘的窗口按钮（最小化 / 最大化 / 关闭）尺寸。
 *
 * 应用主窗口与子窗口都走 `mygo.TitleBarHiddenInset`（见 `main_mygo.go`），
 * 也就是**无边框 + 内容铺满**，所以 Windows 会把三个 caption 按钮直接画在
 * webview 的右上角——这正是截图里 ✕ 压住面板操作按钮的原因。
 *
 * Windows 11 在 100% 缩放下是 3 × 46px 宽、32px 高；这里取 138 × 44：
 * 宽度按实测算准，高度多留 12px 让标题行不至于紧贴按钮下沿。
 * 与 `index.css` 的 `--windows-caption-width/-height` 必须保持一致。
 */
export const WINDOWS_CAPTION = {
  /** 三个 caption 按钮占的横向宽度。 */
  width: 138,
  /** 需要从顶部让出的高度（含少量留白）。 */
  height: 44,
  widthClass: "w-(--windows-caption-width)",
  heightClass: "h-(--windows-caption-height)",
  /** 给面板/滚动容器用的「顶部让位」内边距类。 */
  topInsetClass: "pt-(--windows-caption-height)",
} as const;

/**
 * React hook：是否运行在 Windows（WebView2）。
 *
 * 与 `useIsMacOS` 同一套路：首帧用同步判定，挂载后再校一次，避免
 * 平台字符串在挂载前不可用时把 Windows 判成非 Windows。
 */
export function useIsWindows(): boolean {
  const [onWindows, setOnWindows] = useState<boolean>(() => isWindows());

  useEffect(() => {
    setOnWindows(isWindows());
  }, []);

  return onWindows;
}
