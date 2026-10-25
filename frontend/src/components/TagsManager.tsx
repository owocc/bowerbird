import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, Plus, Search, Star, Tag as TagIcon, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import type { Tag } from "../../bindings/bowerbird/core/models";
import { cn } from "@/lib/utils";
import { FAVORITE_TAG } from "@/lib/favoriteTag";

export interface TagsManagerProps {
  tags: Tag[];
  activeTag: string | null;
  /** Applies a tag filter and returns to the gallery. */
  onSelectTag: (tagName: string) => void;
  onCreateTag: (name: string) => Promise<void>;
  onDeleteTag: (name: string) => Promise<void>;
}

/**
 * Tag manager, shown in the content area (view "tags") instead of a second
 * sidebar: the list gets the whole window width, so long tag names stay
 * readable in narrow windows.
 *
 * A single click selects a row, a double click (or Enter) opens that tag in the
 * gallery as a filter. Double-clicking is deliberate: deleting a tag and
 * listing its assets are easy to confuse, and the first click gives the row a
 * chance to show which tag is about to be opened.
 */
export function TagsManager({
  tags,
  activeTag,
  onSelectTag,
  onCreateTag,
  onDeleteTag,
}: TagsManagerProps) {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [newTagName, setNewTagName] = useState("");
  const [selected, setSelected] = useState<string | null>(null);

  const favoriteTag = useMemo(() => {
    return (
      tags.find((tag) => tag.name === FAVORITE_TAG) || {
        name: FAVORITE_TAG,
        createdAt: 0,
        itemCount: 0,
      }
    );
  }, [tags]);

  const filteredTags = useMemo(() => {
    const custom = tags.filter((tag) => tag.name !== FAVORITE_TAG);
    if (!search.trim()) return custom;
    const lower = search.toLowerCase();
    return custom.filter((tag) => tag.name.toLowerCase().includes(lower));
  }, [tags, search]);

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = newTagName.trim();
    if (!clean) return;
    await onCreateTag(clean);
    setNewTagName("");
    setIsCreating(false);
  };

  return (
    <div
      data-slot="content-surface"
      className="flex-1 min-h-0 flex flex-col bg-background overflow-hidden"
    >
      {/* Toolbar: title, search, new tag */}
      <div className="shrink-0 px-6 pt-2 pb-3 flex items-center gap-3">
        <div className="flex items-center gap-2 shrink-0">
          <TagIcon className="size-4 text-primary" />
          <h2 className="text-sm font-semibold">{t("tags.title")}</h2>
          <Badge
            variant="secondary"
            className="text-[10px] font-mono px-1.5 py-0 h-4"
          >
            {tags.length}
          </Badge>
        </div>

        <div className="relative flex-1 max-w-xs ml-auto">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("tags.searchPlaceholder")}
            className="h-7 pl-8 text-xs bg-muted/40 border-border/60 rounded-lg"
          />
        </div>

        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => setIsCreating(true)}
          className="h-7 gap-1.5 text-xs shrink-0 cursor-pointer"
        >
          <Plus className="size-3.5" />
          {t("tags.newTag")}
        </Button>
      </div>

      <p className="shrink-0 px-6 pb-3 text-[11px] text-muted-foreground">
        {t("tags.managerHint")}
      </p>

      <div className="flex-1 min-h-0 overflow-y-auto px-6 pb-6">
        {/* Inline create row */}
        {isCreating && (
          <form onSubmit={handleCreateSubmit} className="mb-2 flex items-center gap-1.5">
            <Input
              autoFocus
              value={newTagName}
              onChange={(e) => setNewTagName(e.target.value)}
              placeholder={t("tags.tagName")}
              className="h-8 max-w-xs text-xs"
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  e.preventDefault();
                  setIsCreating(false);
                  setNewTagName("");
                }
              }}
            />
            <Button type="submit" size="icon-xs" className="size-8 shrink-0">
              <Check className="size-3.5" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              onClick={() => {
                setIsCreating(false);
                setNewTagName("");
              }}
              className="size-8 shrink-0"
            >
              <X className="size-3.5" />
            </Button>
          </form>
        )}

        {/* Favourites: a built-in tag, so it has no delete action */}
        <TagRow
          name={t("common.favorites")}
          count={favoriteTag.itemCount}
          active={activeTag === FAVORITE_TAG}
          selected={selected === FAVORITE_TAG}
          icon={<Star className="size-4 shrink-0 text-amber-500 fill-amber-500" />}
          onSelect={() => setSelected(FAVORITE_TAG)}
          onOpen={() => onSelectTag(FAVORITE_TAG)}
        />

        <div className="py-2 text-[10px] font-semibold text-muted-foreground/80 tracking-wider">
          {t("tags.customTags", { count: filteredTags.length })}
        </div>

        {filteredTags.length === 0 ? (
          <div className="py-10 text-center text-[11px] text-muted-foreground">
            {search ? t("tags.noMatches") : t("tags.empty")}
          </div>
        ) : (
          <div className="space-y-1">
            {filteredTags.map((tag) => (
              <TagRow
                key={tag.name}
                name={tag.name}
                count={tag.itemCount}
                active={activeTag === tag.name}
                selected={selected === tag.name}
                icon={
                  <TagIcon className="size-4 shrink-0 text-muted-foreground" />
                }
                onSelect={() => setSelected(tag.name)}
                onOpen={() => onSelectTag(tag.name)}
                onDelete={() => void onDeleteTag(tag.name)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function TagRow({
  name,
  count,
  active,
  selected,
  icon,
  onSelect,
  onOpen,
  onDelete,
}: {
  name: string;
  count: number;
  active?: boolean;
  selected?: boolean;
  icon: React.ReactNode;
  onSelect: () => void;
  onOpen: () => void;
  onDelete?: () => void;
}) {
  const { t } = useTranslation();

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onDoubleClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          onOpen();
        }
      }}
      title={t("tags.openHint")}
      className={cn(
        "group flex items-center gap-2.5 px-2.5 h-9 rounded-lg transition-colors cursor-pointer outline-none",
        active
          ? "bg-primary/15 text-primary font-semibold"
          : selected
          ? "bg-sidebar-accent text-foreground"
          : "hover:bg-muted/60 text-foreground"
      )}
    >
      {icon}
      <span className="min-w-0 flex-1 truncate text-xs">{name}</span>
      <Badge
        variant="secondary"
        className="text-[10px] font-mono px-1.5 py-0 h-4 shrink-0"
      >
        {count}
      </Badge>
      {onDelete && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          title={t("tags.deleteTag")}
          className="opacity-0 group-hover:opacity-100 hover:text-destructive p-1 -m-0.5 rounded transition-opacity cursor-pointer shrink-0"
        >
          <Trash2 className="size-3.5" />
        </button>
      )}
    </div>
  );
}
