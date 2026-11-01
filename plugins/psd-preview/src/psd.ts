import { readPsd, type Layer, type Psd } from "ag-psd";

/**
 * PSD/PSB 解析层（与 UI 无关，便于单独推理与测试）。
 *
 * 设计取舍：
 * 1. **只读合成图（composite）**：Photoshop 会把"拍平后的样子"存进文件，`ag-psd` 能直接还原成
 *    canvas。我们不做自己的图层合成 —— 图层混合模式（pass through / 剪贴蒙版 / 智能滤镜）
 *    复刻成本极高，而且一定和 Photoshop 有差异。合成图是"作者最终看到的样子"，对资产管理器
 *    来说就是要的东西。
 * 2. **图层只取结构，不取像素**：`skipLayerImageData: true`。一个 200MB 的 PSD 里，图层像素
 *    才是大头；我们只想知道"有几层、哪些组、可见性"，那部分解析是毫秒级的。
 * 3. **失败要说人话**：PSB（大文档）、损坏文件、旧版本混合模式都可能抛错，错误信息直接展示给用户，
 *    并保留"用系统默认应用打开"的出口。
 */

/** Photoshop 的色彩模式编号（`ag-psd` 里是 const enum，这里用数字映射避免运行时依赖）。 */
const COLOR_MODES: Record<number, string> = {
  0: "Bitmap",
  1: "Grayscale",
  2: "Indexed",
  3: "RGB",
  4: "CMYK",
  7: "Multichannel",
  8: "Duotone",
  9: "Lab",
}

export function colorModeName(mode: number | undefined): string {
  if (mode === undefined) return "Unknown"
  return COLOR_MODES[mode] ?? `Mode ${mode}`
}

/** 人类可读的字节数（B / KB / MB）。 */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B"
  const units = ["B", "KB", "MB", "GB"]
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  return `${value >= 10 || unit === 0 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`
}

/** 图层树摘要：总层数、顶层数、隐藏层数、最大嵌套深度。 */
export interface LayerSummary {
  total: number
  topLevel: number
  hidden: number
  maxDepth: number
}

export function summarizeLayers(layers: readonly Layer[] | undefined): LayerSummary {
  let total = 0
  let hidden = 0
  let maxDepth = 0

  const walk = (nodes: readonly Layer[], depth: number): void => {
    if (depth > maxDepth) maxDepth = depth
    for (const node of nodes) {
      total += 1
      if (node.hidden) hidden += 1
      if (node.children?.length) walk(node.children, depth + 1)
    }
  }

  if (layers?.length) walk(layers, 1)
  return { total, topLevel: layers?.length ?? 0, hidden, maxDepth }
}

/** 文档摘要（视口 HUD 与检查器都用它）。 */
export interface PsdSummary {
  width: number
  height: number
  /** 文件里声明的通道数（RGB + alpha = 4） */
  channels?: number
  bitsPerChannel?: number
  colorMode: string
  /** 是否有 alpha 通道（PSD 里以通道数表达） */
  hasAlpha: boolean
  layers: LayerSummary
  /** 是否拿到了合成图（少数文件没有） */
  hasComposite: boolean
  /** 内嵌缩略图（检查器优先用它，省一次全量解析） */
  thumbnail?: HTMLCanvasElement
}

export interface ParsedPsd {
  summary: PsdSummary
  /** 合成图 canvas（可能为空：`skipCompositeImageData` 或文件本身没有） */
  composite?: HTMLCanvasElement
  psd: Psd
}

/** 把 `ag-psd` 的解析结果压成面板需要的摘要。 */
export function summarizePsd(psd: Psd): PsdSummary {
  const channels = psd.channels
  return {
    width: psd.width,
    height: psd.height,
    ...(channels === undefined ? {} : { channels }),
    ...(psd.bitsPerChannel === undefined ? {} : { bitsPerChannel: psd.bitsPerChannel }),
    colorMode: colorModeName(psd.colorMode),
    hasAlpha: (channels ?? 0) >= 4,
    layers: summarizeLayers(psd.children),
    hasComposite: Boolean(psd.canvas),
    ...(psd.imageResources?.thumbnail ? { thumbnail: psd.imageResources.thumbnail } : {}),
  }
}

/**
 * 解析 PSD/PSB。
 *
 * @param buffer 原始文件字节
 * @param options.withComposite 是否要合成图（检查器只要缩略图时可以传 false）
 */
export function parsePsd(buffer: ArrayBuffer, options: { withComposite?: boolean } = {}): ParsedPsd {
  const psd = readPsd(buffer, {
    // 图层像素是文件里最大的部分，我们只要结构
    skipLayerImageData: true,
    skipThumbnail: false,
    // 少数 PSD 没有合成图；没有时 `canvas` 为 undefined，我们不当作错误
    skipCompositeImageData: options.withComposite === false,
    logMissingFeatures: false,
  })

  return {
    summary: summarizePsd(psd),
    ...(psd.canvas ? { composite: psd.canvas } : {}),
    psd,
  }
}

/** 把摘要拼成一行纯文本（复制到剪贴板 / 排查问题用）。 */
export function summaryToText(summary: PsdSummary): string {
  const bits = summary.bitsPerChannel ? `${summary.bitsPerChannel}-bit` : "unknown depth"
  const parts = [
    `${summary.width} × ${summary.height}px`,
    `${summary.colorMode} ${bits}`,
    `${summary.layers.total} layer${summary.layers.total === 1 ? "" : "s"}`,
  ]
  if (summary.layers.hidden > 0) parts.push(`${summary.layers.hidden} hidden`)
  if (summary.hasAlpha) parts.push("alpha")
  return parts.join(" · ")
}

/**
 * 「适应窗口」缩放：不放大到超过 100%（像素稿放大只会糊）。
 *
 * 返回 `{ scale, fitScale }` —— `fitScale` 是"刚好装下"，`scale` 是最终应用的（上限 1）。
 */
export function computeFitScale(
  imageWidth: number,
  imageHeight: number,
  containerWidth: number,
  containerHeight: number,
  padding = 32,
): number {
  if (imageWidth <= 0 || imageHeight <= 0 || containerWidth <= 0 || containerHeight <= 0) return 1
  const availableWidth = Math.max(1, containerWidth - padding)
  const availableHeight = Math.max(1, containerHeight - padding)
  const fit = Math.min(availableWidth / imageWidth, availableHeight / imageHeight)
  return Math.min(1, fit)
}
