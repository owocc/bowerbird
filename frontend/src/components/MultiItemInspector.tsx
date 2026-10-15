import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Folder as FolderIcon, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion";
import type { Item, Folder } from "../../bindings/bowerbird/core/models";
import { formatBytes, getFileCategory } from "@/lib/formatters";
import { UniversalThumbnail } from "./UniversalThumbnail";

export interface MultiItemInspectorProps {
  selectedItems: Item[];
  allFolders: Folder[];
  activeFolderId: string | null;
  onClearSelection: () => void;
  onBatchReveal: () => void;
  onBatchDelete: () => void;
  onBatchAddToFolder: (folderId: string) => void;
  onBatchRemoveFromFolder?: (folderId: string) => void;
  onBatchRestore?: () => void;
}

export function MultiItemInspector({
  selectedItems,
  allFolders,
  activeFolderId,
  onBatchAddToFolder,
  onBatchRemoveFromFolder,
}: MultiItemInspectorProps) {
  const { t } = useTranslation();
  const [showFolderPicker, setShowFolderPicker] = useState(false);

  // Strict FIFO sliding window of the last 6 selected items:
  // Whoever is selected last joins the top of the stack; whoever was selected first gets pushed out once > 6.
  const stackedItems = selectedItems.slice(-6);
  const totalSizeBytes = selectedItems.reduce(
    (acc, curr) => acc + (curr.size || 0),
    0
  );

  const extensionCounts: Record<string, number> = {};
  for (const item of selectedItems) {
    const ext = (item.extension || "other").toUpperCase();
    extensionCounts[ext] = (extensionCounts[ext] || 0) + 1;
  }

  const flatFolderList: { id: string; name: string }[] = [];
  const collect = (list: Folder[], prefix = "") => {
    for (const f of list) {
      const name = prefix ? `${prefix} / ${f.name}` : f.name;
      flatFolderList.push({ id: f.id, name });
      if (f.children && f.children.length > 0) {
        collect(f.children, name);
      }
    }
  };
  collect(allFolders);

  return (
    <aside className="w-full h-full border-l-0 bg-sidebar/40 flex flex-col select-none overflow-hidden">
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 text-xs">
        {/* Stacked preview of the last 6 selected items in selection order */}
        <div className="relative w-full h-44 flex items-center justify-center my-1 select-none">
          {stackedItems.map((item, idx) => {
            const offsetFromTop = stackedItems.length - 1 - idx;
            const presets = [
              { rotate: 0, x: 0, y: 0 },
              { rotate: -4, x: -6, y: 3 },
              { rotate: 5, x: 5, y: 5 },
              { rotate: -7, x: -10, y: 8 },
              { rotate: 7, x: 9, y: 11 },
              { rotate: -10, x: -13, y: 14 },
            ];
            const preset = presets[Math.min(offsetFromTop, presets.length - 1)];

            const STACK_HEIGHT = 132;
            const ratio = (() => {
              if (item.width && item.height && item.width > 0 && item.height > 0) {
                return Math.max(0.55, Math.min(2.1, item.width / item.height));
              }
              const category = getFileCategory(item.extension, item.mimeType);
              if (category === "document") return 0.75;
              if (category === "video") return 1.77;
              if (category === "audio") return 1.0;
              return 1.25;
            })();
            const calculatedWidth = Math.round(STACK_HEIGHT * ratio);

            return (
              <div
                key={item.id}
                style={{
                  zIndex: idx + 1,
                  height: `${STACK_HEIGHT}px`,
                  width: `${calculatedWidth}px`,
                  transform: `translate(${preset.x}px, ${preset.y}px) rotate(${preset.rotate}deg)`,
                }}
                className="absolute rounded-sm overflow-hidden shadow-md transition-transform hover:scale-105 cursor-grab active:cursor-grabbing"
              >
                <UniversalThumbnail
                  item={item}
                  height={STACK_HEIGHT}
                  width={calculatedWidth}
                  draggable={true}
                  objectFit="cover"
                  borderless={true}
                  showFormatBadge={false}
                  className="w-full h-full"
                />
              </div>
            );
          })}
        </div>

        {/* Selection summary (no available actions row) */}
        <div className="text-center space-y-0.5 pb-1">
          <p className="text-xs font-semibold text-foreground">
            {t("multiInspector.selectedCount", { count: selectedItems.length })}
          </p>
          <p className="text-[10px] text-muted-foreground font-mono">
            {formatBytes(totalSizeBytes)}
          </p>
        </div>

        {/* Accordion sections replacing cards */}
        <Accordion
          type="multiple"
          defaultValue={["folders", "summary"]}
          className="border-t border-border/50"
        >
          {activeFolderId !== "__trash__" && (
            <AccordionItem value="folders">
              <AccordionTrigger
                action={
                  flatFolderList.length > 0 ? (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowFolderPicker((v) => !v);
                      }}
                      className="text-[10px] text-primary hover:underline flex items-center gap-0.5 cursor-pointer"
                    >
                      <Plus className="size-2.5" />
                      <span>{t("multiInspector.addToFolder")}</span>
                    </button>
                  ) : undefined
                }
              >
                {t("multiInspector.folders")}
              </AccordionTrigger>
              <AccordionContent className="space-y-2">
                {showFolderPicker && flatFolderList.length > 0 && (
                  <div className="py-1 border-b border-border/50 space-y-0.5 max-h-36 overflow-y-auto">
                    {flatFolderList.map((f) => (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => {
                          onBatchAddToFolder(f.id);
                          setShowFolderPicker(false);
                        }}
                        className="w-full text-left px-1.5 py-1 rounded text-[11px] hover:bg-muted flex items-center gap-1.5 truncate cursor-pointer"
                      >
                        <FolderIcon className="size-3 text-muted-foreground shrink-0" />
                        <span className="truncate">{f.name}</span>
                      </button>
                    ))}
                  </div>
                )}

                {activeFolderId && onBatchRemoveFromFolder && (
                  <Button
                    variant="outline"
                    size="xs"
                    onClick={() => onBatchRemoveFromFolder(activeFolderId)}
                    className="w-full h-7 text-[11px] text-destructive hover:bg-destructive/10 border-destructive/30 cursor-pointer"
                  >
                    <span>{t("multiInspector.removeFromCurrentFolder")}</span>
                  </Button>
                )}
              </AccordionContent>
            </AccordionItem>
          )}

          <AccordionItem value="summary">
            <AccordionTrigger>{t("multiInspector.summary")}</AccordionTrigger>
            <AccordionContent className="space-y-2 text-[11px]">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">
                  {t("multiInspector.count")}
                </span>
                <span className="font-mono font-medium">
                  {selectedItems.length}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">
                  {t("multiInspector.totalSize")}
                </span>
                <span className="font-mono font-medium">
                  {formatBytes(totalSizeBytes)}
                </span>
              </div>

              <div className="pt-1 space-y-1">
                <span className="text-muted-foreground text-[10px]">
                  {t("multiInspector.formats")}
                </span>
                <div className="flex flex-wrap gap-1">
                  {Object.entries(extensionCounts).map(([ext, count]) => (
                    <Badge
                      key={ext}
                      variant="secondary"
                      className="text-[10px] font-mono px-1.5 py-0 h-4.5 font-normal"
                    >
                      {ext} × {count}
                    </Badge>
                  ))}
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>
    </aside>
  );
}
