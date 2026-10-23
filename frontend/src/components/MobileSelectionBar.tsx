import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { FolderPlus, Tag as TagIcon, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Folder, Tag } from "../../bindings/bowerbird/core/models";
import { BottomSheet } from "@/components/BottomSheet";
import { cn } from "@/lib/utils";

export interface MobileSelectionBarProps {
  selectedCount: number;
  folders: Folder[];
  tags: Tag[];
  onClear: () => void;
  onAddToFolder: (folderId: string) => void;
  onAddTag: (tag: string) => void;
}

function flattenFolders(folders: Folder[]): { id: string; name: string }[] {
  const out: { id: string; name: string }[] = [];
  const walk = (list: Folder[], prefix = "") => {
    for (const f of list) {
      const name = prefix ? `${prefix} / ${f.name}` : f.name;
      out.push({ id: f.id, name });
      if (f.children?.length) walk(f.children, name);
    }
  };
  walk(folders);
  return out;
}

export function MobileSelectionBar({
  selectedCount,
  folders,
  tags,
  onClear,
  onAddToFolder,
  onAddTag,
}: MobileSelectionBarProps) {
  const { t } = useTranslation();
  const [sheet, setSheet] = useState<"folder" | "tag" | null>(null);
  const [query, setQuery] = useState("");
  const [newTag, setNewTag] = useState("");
  const flatFolders = useMemo(() => flattenFolders(folders), [folders]);

  if (selectedCount === 0) return null;

  const filteredFolders = flatFolders.filter((f) =>
    f.name.toLowerCase().includes(query.toLowerCase())
  );
  const filteredTags = tags.filter((tg) =>
    tg.name.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <>
      <div
        className={cn(
          "absolute left-0 right-0 z-30 flex items-center gap-2 px-3 py-2",
          "bg-background/95 backdrop-blur-md border-t border-border",
          "pb-[max(8px,env(safe-area-inset-bottom))]"
        )}
        style={{ bottom: 0 }}
      >
        <button
          type="button"
          onClick={onClear}
          className="size-8 rounded-lg inline-flex items-center justify-center text-muted-foreground hover:bg-muted"
        >
          <X className="size-4" />
        </button>
        <span className="text-xs font-medium flex-1">
          {t("workspace.itemCount", { count: selectedCount })}
        </span>
        <Button
          size="xs"
          variant="outline"
          className="h-8 gap-1 text-xs"
          onClick={() => {
            setQuery("");
            setSheet("folder");
          }}
        >
          <FolderPlus className="size-3.5" />
          {t("contextMenu.addToFolder")}
        </Button>
        <Button
          size="xs"
          variant="outline"
          className="h-8 gap-1 text-xs"
          onClick={() => {
            setQuery("");
            setNewTag("");
            setSheet("tag");
          }}
        >
          <TagIcon className="size-3.5" />
          {t("inspector.addTag")}
        </Button>
      </div>

      <BottomSheet
        open={sheet === "folder"}
        onClose={() => setSheet(null)}
        title={t("contextMenu.addToFolder")}
      >
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("contextMenu.searchFolderPlaceholder")}
          className="h-8 text-xs mb-2"
        />
        <div className="space-y-0.5">
          {filteredFolders.map((f) => (
            <button
              key={f.id}
              type="button"
              className="w-full text-left px-2 py-2 rounded-lg text-xs hover:bg-accent"
              onClick={() => {
                onAddToFolder(f.id);
                setSheet(null);
              }}
            >
              {f.name}
            </button>
          ))}
          {filteredFolders.length === 0 && (
            <p className="text-xs text-muted-foreground py-4 text-center">
              {t("contextMenu.noResults")}
            </p>
          )}
        </div>
      </BottomSheet>

      <BottomSheet
        open={sheet === "tag"}
        onClose={() => setSheet(null)}
        title={t("inspector.addTag")}
      >
        <form
          className="flex gap-2 mb-2"
          onSubmit={(e) => {
            e.preventDefault();
            const tag = newTag.trim();
            if (!tag) return;
            onAddTag(tag);
            setSheet(null);
          }}
        >
          <Input
            value={newTag}
            onChange={(e) => setNewTag(e.target.value)}
            placeholder={t("inspector.addTag")}
            className="h-8 text-xs flex-1"
          />
          <Button type="submit" size="sm" className="h-8 text-xs" disabled={!newTag.trim()}>
            {t("common.create")}
          </Button>
        </form>
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("common.search")}
          className="h-8 text-xs mb-2"
        />
        <div className="space-y-0.5">
          {filteredTags.map((tg) => (
            <button
              key={tg.name}
              type="button"
              className="w-full text-left px-2 py-2 rounded-lg text-xs hover:bg-accent"
              onClick={() => {
                onAddTag(tg.name);
                setSheet(null);
              }}
            >
              {tg.name}
            </button>
          ))}
        </div>
      </BottomSheet>
    </>
  );
}
