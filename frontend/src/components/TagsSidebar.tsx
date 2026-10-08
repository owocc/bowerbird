import React, { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  Tag as TagIcon,
  Star,
  Plus,
  Trash2,
  X,
  Search,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import type { Tag } from "../../bindings/bowerbird/core/models";
import { cn } from "cn";
import { FAVORITE_TAG } from "@/lib/favoriteTag";

export interface TagsSidebarProps {
  tags: Tag[];
  activeTag: string | null;
  onSelectTag: (tagName: string | null) => void;
  onCreateTag: (name: string) => Promise<void>;
  onDeleteTag: (name: string) => Promise<void>;
  onClose?: () => void;
}

export function TagsSidebar({
  tags,
  activeTag,
  onSelectTag,
  onCreateTag,
  onDeleteTag,
  onClose,
}: TagsSidebarProps) {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [newTagName, setNewTagName] = useState("");

  const favoriteTag = useMemo(() => {
    return tags.find((tag) => tag.name === FAVORITE_TAG) || {
      name: FAVORITE_TAG,
      createdAt: 0,
      itemCount: 0,
    };
  }, [tags]);

  const customTags = useMemo(() => {
    return tags.filter((tag) => tag.name !== FAVORITE_TAG);
  }, [tags]);

  const filteredTags = useMemo(() => {
    if (!search.trim()) return customTags;
    const lower = search.toLowerCase();
    return customTags.filter((tag) => tag.name.toLowerCase().includes(lower));
  }, [customTags, search]);

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = newTagName.trim();
    if (!clean) return;
    await onCreateTag(clean);
    setNewTagName("");
    setIsCreating(false);
  };

  return (
    <aside className="w-full h-full bg-sidebar/70 border-r border-sidebar-border flex flex-col select-none overflow-hidden text-xs">
      {/* Header */}
      <div className="h-10 px-3 flex items-center justify-between border-b border-sidebar-border/60 shrink-0">
        <div className="flex items-center gap-1.5 font-semibold text-sidebar-foreground">
          <TagIcon className="size-3.5 text-primary" />
          <span>{t("tags.title")}</span>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={() => setIsCreating(true)}
            title={t("tags.newTag")}
            className="size-6 text-muted-foreground hover:text-foreground hover:bg-sidebar-accent rounded-md cursor-pointer"
          >
            <Plus className="size-3.5" />
          </Button>
          {onClose && (
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={onClose}
              title={t("tags.closeSidebar")}
              className="size-6 text-muted-foreground hover:text-foreground hover:bg-sidebar-accent rounded-md cursor-pointer"
            >
              <X className="size-3.5" />
            </Button>
          )}
        </div>
      </div>

      {/* Search Input */}
      <div className="p-2 border-b border-sidebar-border/50 shrink-0">
        <div className="relative">
          <Search className="absolute left-2 top-2 size-3 text-muted-foreground pointer-events-none" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("tags.searchPlaceholder")}
            className="h-7 pl-7 text-[11px] bg-muted/30 border-sidebar-border"
          />
        </div>
      </div>

      {/* Tags List */}
      <div className="flex-1 overflow-y-auto p-1.5 space-y-0.5">
        {/* Built-in Special Tag: Favorites */}
        <button
          type="button"
          onClick={() => onSelectTag(activeTag === FAVORITE_TAG ? null : FAVORITE_TAG)}
          className={cn(
            "w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left transition-colors cursor-pointer group",
            activeTag === FAVORITE_TAG
              ? "bg-amber-500/15 text-amber-500 font-semibold"
              : "hover:bg-sidebar-accent/70 text-sidebar-foreground"
          )}
        >
          <Star
            className={cn(
              "size-3.5 shrink-0 transition-transform group-hover:scale-110",
              activeTag === FAVORITE_TAG
                ? "text-amber-500 fill-amber-500"
                : "text-amber-500/80"
            )}
          />
          <span className="truncate flex-1 text-xs">{t("common.favorites")}</span>
          <Badge
            variant="secondary"
            className="text-[10px] font-mono px-1.5 py-0 h-4 bg-sidebar-accent text-sidebar-foreground border-none"
          >
            {favoriteTag.itemCount}
          </Badge>
        </button>

        {/* Clear filter / Show all tags button */}
        {activeTag !== null && (
          <button
            type="button"
            onClick={() => onSelectTag(null)}
            className="w-full flex items-center gap-1.5 px-2 py-1 text-[11px] text-muted-foreground hover:text-primary transition-colors cursor-pointer rounded-md hover:bg-sidebar-accent/40"
          >
            <X className="size-3 shrink-0" />
            <span>{t("tags.clearFilter")}</span>
          </button>
        )}

        <div className="pt-2 pb-1 px-2 text-[10px] font-semibold text-muted-foreground/80 tracking-wider">
          {t("tags.customTags", { count: filteredTags.length })}
        </div>

        {/* Inline create input if triggered */}
        {isCreating && (
          <form onSubmit={handleCreateSubmit} className="p-1 mb-1">
            <div className="flex items-center gap-1">
              <Input
                autoFocus
                value={newTagName}
                onChange={(e) => setNewTagName(e.target.value)}
                placeholder={t("tags.tagName")}
                className="h-6.5 text-xs bg-card"
              />
              <Button type="submit" size="icon-xs" className="size-6.5 shrink-0">
                <Check className="size-3" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                onClick={() => setIsCreating(false)}
                className="size-6.5 shrink-0"
              >
                <X className="size-3" />
              </Button>
            </div>
          </form>
        )}

        {filteredTags.length === 0 ? (
          <div className="py-6 px-2 text-center text-muted-foreground text-[11px]">
            {search ? t("tags.noMatches") : t("tags.empty")}
          </div>
        ) : (
          filteredTags.map((tag) => (
            <div
              key={tag.name}
              className={cn(
                "group flex items-center gap-2 px-2 py-1.5 rounded-lg transition-colors cursor-pointer",
                activeTag === tag.name
                  ? "bg-primary/15 text-primary font-semibold"
                  : "hover:bg-sidebar-accent/70 text-sidebar-foreground"
              )}
              onClick={() => onSelectTag(activeTag === tag.name ? null : tag.name)}
            >
              <TagIcon className="size-3.5 shrink-0 text-muted-foreground group-hover:text-primary" />
              <span className="truncate flex-1 text-xs">{tag.name}</span>
              <Badge
                variant="secondary"
                className="text-[10px] font-mono px-1.5 py-0 h-4 bg-sidebar-accent text-sidebar-foreground border-none"
              >
                {tag.itemCount}
              </Badge>
              <button
                type="button"
                onClick={async (e) => {
                  e.stopPropagation();
                  await onDeleteTag(tag.name);
                }}
                title={t("tags.deleteTag")}
                className="opacity-0 group-hover:opacity-100 hover:text-destructive p-0.5 rounded transition-opacity"
              >
                <Trash2 className="size-3" />
              </button>
            </div>
          ))
        )}
      </div>
    </aside>
  );
}
