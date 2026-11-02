import type { Item } from "../../../bindings/bowerbird/core/models";
import { logDiagnostic } from "@/lib/logger";
import { previewRegistry } from "./registry";
import { createPreviewPluginHostAPI } from "./types";

/**
 * 后台补封面缩略图的统一调度器。
 *
 * 宿主导入流水线（Go 侧）只用标准图像解码器，PSD / AI / PDF 这类格式解不出来，
 * 导入后 item.hasThumbnail 就是 false，画廊只能显示系统图标。要让这类文件也有封面，
 * 必须由对应插件实现 `generateCoverThumbnail`，然后把结果通过
 * `api.saveCoverThumbnail` 交给宿主落盘（同时会提取主色与调色板）。
 */

/** 每个任务都要完整解析原文件，并发压太高会把 webview 卡住 */
const MAX_CONCURRENCY = 2;
/** 单个条目最多尝试次数，避免插件一直失败时反复解析大文件 */
const MAX_ATTEMPTS = 2;

interface PendingTask {
  item: Item;
}

const queue: PendingTask[] = [];
const queuedIds = new Set<string>();
const inFlightIds = new Set<string>();
const attempts = new Map<string, number>();
const failedIds = new Set<string>();

let active = 0;
let drainScheduled = false;
let onUpdated: ((updated: Item) => void) | undefined;

/**
 * 为当前画廊里缺少缩略图的条目排队生成封面。
 * 幂等：已在队列/进行中/已失败的条目会被跳过，因此可以放心跟着 items 变化反复调用。
 */
export function backfillMissingThumbnails(
  items: readonly Item[],
  handleUpdated?: (updated: Item) => void
): void {
  if (handleUpdated) onUpdated = handleUpdated;

  for (const item of items) {
    if (item.hasThumbnail) continue;
    if (queuedIds.has(item.id) || inFlightIds.has(item.id) || failedIds.has(item.id)) {
      continue;
    }
    const plugin = previewRegistry.resolve(item);
    if (!plugin || plugin.internal || !plugin.generateCoverThumbnail) continue;

    queuedIds.add(item.id);
    queue.push({ item });
  }

  scheduleDrain();
}

function scheduleDrain(): void {
  if (drainScheduled) return;
  drainScheduled = true;
  queueMicrotask(() => {
    drainScheduled = false;
    drainQueue();
  });
}

function drainQueue(): void {
  while (active < MAX_CONCURRENCY && queue.length > 0) {
    const task = queue.shift()!;
    const id = task.item.id;
    queuedIds.delete(id);

    if (task.item.hasThumbnail || inFlightIds.has(id) || failedIds.has(id)) continue;

    active += 1;
    inFlightIds.add(id);
    void processTask(task).finally(() => {
      active -= 1;
      inFlightIds.delete(id);
      scheduleDrain();
    });
  }
}

async function processTask({ item }: PendingTask): Promise<void> {
  const plugin = previewRegistry.resolve(item);
  const generate = plugin?.generateCoverThumbnail;
  if (!plugin || !generate) return;

  const startedAt = performance.now();
  try {
    // 传入 onItemUpdated，保存成功后宿主会把带缩略图的新 item 回传（画廊立即刷新）
    const api = createPreviewPluginHostAPI(item, (updated) => onUpdated?.(updated));
    const generated = await generate({ item, api });
    if (!generated?.dataUrl) {
      throw new Error("plugin returned no cover image");
    }

    const saved = await api.saveCoverThumbnail(generated.dataUrl, {
      width: generated.width,
      height: generated.height,
    });
    if (!saved) {
      throw new Error("host rejected the generated cover");
    }

    logDiagnostic(
      "info",
      "plugin",
      `Cover thumbnail generated: ${item.id}`,
      `plugin=${plugin.id} ext=${item.extension} bytes=${item.size} dims=${generated.width}x${generated.height} durationMs=${Math.round(performance.now() - startedAt)}`
    );
  } catch (err) {
    const tries = (attempts.get(item.id) ?? 0) + 1;
    attempts.set(item.id, tries);
    if (tries < MAX_ATTEMPTS) {
      // 插件可能刚被重新加载，重排队一次
      queuedIds.add(item.id);
      queue.push({ item });
    } else {
      failedIds.add(item.id);
    }
    logDiagnostic(
      "warn",
      "plugin",
      `Cover thumbnail generation failed: ${item.id}`,
      `plugin=${plugin.id} ext=${item.extension} attempt=${tries}/${MAX_ATTEMPTS} err=${err instanceof Error ? err.message : String(err)}`
    );
  }
}
