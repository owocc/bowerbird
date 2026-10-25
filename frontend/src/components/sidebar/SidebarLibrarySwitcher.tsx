import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { default as Check } from "~icons/ri/check-line";
import { default as ChevronsUpDown } from "~icons/lucide/chevrons-up-down";
import { default as FolderIcon } from "~icons/lucide/folder";
import { default as FolderOpen } from "~icons/lucide/folder-open";
import { default as FolderPlus } from "~icons/ri/folder-add-line";
import { default as GripVertical } from "~icons/tabler/grip-vertical";
import { default as Layers3 } from "~icons/ri/apps-2-line";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import { CSS } from "@dnd-kit/utilities";
import { useTranslation } from "react-i18next";

import {
  Command,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandSeparator,
} from "@/components/ui/command";
import { Listbox, ListboxItem } from "@/components/ui/listbox";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  applyLibraryOrder,
  ensureLibraryOrder,
  writeLibraryOrder,
} from "@/lib/library-order";
import { cn } from "@/lib/utils";
import type {
  LibraryInfo,
  LibraryRef,
} from "../../../bindings/bowerbird/core/models";

function libraryDisplayName(path: string): string {
  const normalized = path.replace(/[/\\]+$/, "");
  const parts = normalized.split(/[/\\]/);
  const lastPart = parts[parts.length - 1] || path;
  return lastPart.endsWith(".library") ? lastPart.slice(0, -8) : lastPart;
}

/**
 * Popover layout metrics.
 *
 * Rows keep their original compact vertical rhythm (`py-1.5`) and use the same
 * inset on both sides, so:
 *   LIST_PADDING (4px) + ROW_PADDING_X (8px) = 12px left and right.
 *
 * The search icon is centred on the grip: 4 (list inset) + 8 (row inset) +
 * 12 (half a 24px grip) = 24px from the popover edge, minus half the 16px icon,
 * which is 16px of left padding (`pl-4`).
 */
const LIST_PADDING = "p-1";
const ROW_PADDING = "px-2 py-1.5";
const GRIP_SIZE = "size-6";
/**
 * The search field is deliberately roomier than a row: 20px above and below the
 * icon, 16px on the sides. The inner control and the icon addon drop their own
 * height and padding so this padding alone defines the box.
 */
const SEARCH_FIELD_PADDING = "h-auto px-4 py-5";

/**
 * The one divider colour, shared by the search underline and the separator
 * above the actions. Both render as 1px background elements (not borders) so
 * they land on whole pixels and read as the same grey.
 */
const DIVIDER_BG = "bg-border/70";

export interface SidebarLibrarySwitcherProps {
  library: LibraryInfo;
  /** Libraries on disk, each with the stable ID from its own library.json. */
  recentLibraries: LibraryRef[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectLibrary: (value: string) => void;
  onOpenDialog: () => void;
  onCreateLibrary: () => void;
}

interface SortableLibraryRowProps {
  /** Stable library ID (sortable id — never the path). */
  id: string;
  displayName: string;
  isActive: boolean;
  dragDisabled: boolean;
}

/**
 * One draggable library row — the active library is an ordinary sortable row
 * too, it just carries a check mark. Keeping it in the same list (rather than
 * pinning it above) is what lets the whole set be reordered.
 *
 * The drag listeners live on the grip only, so clicking the name always means
 * "switch to this library" — a drag can never be mistaken for a click and vice
 * versa. dnd-kit's activation constraint (see the sensors below) adds a few
 * pixels of tolerance on top of that.
 */
function SortableLibraryRow({
  id,
  displayName,
  isActive,
  dragDisabled,
}: SortableLibraryRowProps) {
  const { t } = useTranslation();
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id, disabled: dragDisabled });

  return (
    <ListboxItem
      value={id}
      // dnd-kit owns the transform of the row itself.
      ref={setNodeRef}
      style={{
        transform: CSS.Translate.toString(transform),
        transition,
      }}
      onClick={(event) => {
        // Selection is owned by the listbox: its onValueChange switches
        // library. Here we only suppress the click that ends a drag, which must
        // never be mistaken for a selection.
        if (isDragging) event.preventDefault();
      }}
      className={cn(
        "group/lib flex items-center gap-1 rounded-lg text-xs",
        ROW_PADDING,
        // Selection is owned by the listbox; the active library is the
        // selection, so both states share one highlight.
        "data-[selected]:bg-foreground/5 data-[selected]:font-medium",
        "data-[active]:bg-foreground/5",
        isDragging && "relative z-10 bg-popover"
      )}
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        onClick={(event) => event.stopPropagation()}
        // The grip is a drag affordance, not part of the listbox's roving
        // focus: never let it steal focus or start a text selection.
        onMouseDown={(event) => event.preventDefault()}
        tabIndex={-1}
        title={t("sidebar.dragToReorder")}
        aria-label={t("sidebar.dragToReorder")}
        className={cn(
          "flex shrink-0 touch-none items-center justify-center rounded text-muted-foreground/40 transition-colors",
          GRIP_SIZE,
          dragDisabled
            ? "cursor-default opacity-0"
            : "cursor-grab hover:text-muted-foreground active:cursor-grabbing"
        )}
      >
        <GripVertical className="size-3 shrink-0" />
      </button>
      <div className="flex min-w-0 flex-1 items-center gap-2 text-left">
        {isActive ? (
          <Layers3 className="size-3.5 shrink-0 text-primary" />
        ) : (
          <FolderIcon className="size-3.5 shrink-0 text-muted-foreground" />
        )}
        <span
          className={cn(
            "truncate flex-1 text-xs",
            isActive && "text-primary"
          )}
        >
          {displayName}
        </span>
        {isActive && <Check className="size-3.5 shrink-0 text-primary" />}
      </div>
    </ListboxItem>
  );
}

/**
 * The library name button in the sidebar header plus its command popover.
 *
 * Libraries can be reordered by dragging their grips; the order is a local
 * preference persisted via `library-order`.
 */
export function SidebarLibrarySwitcher({
  library,
  recentLibraries,
  open,
  onOpenChange,
  onSelectLibrary,
  onOpenDialog,
  onCreateLibrary,
}: SidebarLibrarySwitcherProps) {
  const { t } = useTranslation();

  // Ordering is stored as library IDs, so it never refers to a path that may
  // later belong to a different library. `ensureLibraryOrder` snapshots the set
  // once and persists it, so the backend's recency list (which moves the active
  // library to the front on every switch) can no longer reshuffle the sidebar.
  const [order, setOrder] = useState<string[]>(() =>
    ensureLibraryOrder(recentLibraries)
  );
  const [query, setQuery] = useState("");
  const listboxRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // The popover renders in a portal, so its content (and the list) mounts only
  // after it opens. Focus the list on the next frame: arrow keys then work
  // immediately, and the whole popover behaves as one keyboard surface.
  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => {
      listboxRef.current?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [open]);

  // Re-sync whenever the library set changes (new library added/removed) or the
  // popover opens. `ensureLibraryOrder` keeps the remembered relative order and
  // only appends genuinely new entries.
  useEffect(() => {
    setOrder(ensureLibraryOrder(recentLibraries));
  }, [recentLibraries]);

  // Reset the search each time the popover closes.
  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  // The active library keeps whatever position the user gave it — it is never
  // promoted to the top just because it is active. It is only forced into the
  // list when the backend has not reported it yet (e.g. right after creating it).
  const allLibraries = useMemo(() => {
    const known = recentLibraries.some((ref) => ref.id === library.id);
    const refs = known
      ? recentLibraries
      : [...recentLibraries, { id: library.id, path: library.path }];
    return applyLibraryOrder(refs, order);
  }, [recentLibraries, library.id, library.path, order]);

  const visibleLibraries = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return allLibraries;
    return allLibraries.filter(
      (ref) =>
        ref.id === library.id ||
        libraryDisplayName(ref.path).toLowerCase().includes(needle)
    );
  }, [allLibraries, library.id, query]);

  // Pointer-only: arrow keys belong to the listbox (roving selection), so a
  // keyboard drag gesture would compete with navigation. The grips are
  // `tabIndex={-1}` for the same reason.
  const sensors = useSensors(
    // A small distance threshold keeps a plain click from starting a drag.
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      // Always reorder against the full list — the visible list may be filtered.
      const from = allLibraries.findIndex((ref) => ref.id === String(active.id));
      const to = allLibraries.findIndex((ref) => ref.id === String(over.id));
      if (from < 0 || to < 0) return;

      // Only IDs are persisted; paths are deliberately left out of app data.
      const next = arrayMove(allLibraries, from, to).map((ref) => ref.id);
      setOrder(next);
      writeLibraryOrder(next);
    },
    [allLibraries]
  );

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger
        className="min-w-0 w-fit max-w-full h-8 pl-1 pr-2 py-1 flex items-center gap-2 text-xs font-semibold rounded-lg hover:bg-foreground/5 text-sidebar-foreground transition-colors cursor-pointer outline-none border-0 shadow-none bg-transparent header-interactive-container wails-no-drag"
        title={library.name}
      >
        <Layers3 className="size-4 shrink-0 text-foreground/80" />
        <span className="truncate min-w-0 max-w-[140px] leading-tight">
          {library.name}
        </span>
        <ChevronsUpDown className="size-3 text-muted-foreground/70 shrink-0" />
      </PopoverTrigger>
      <PopoverContent
        side="right"
        align="start"
        sideOffset={8}
        className="w-64 gap-0 p-0 rounded-xl shadow-xl border border-neutral-300 dark:border-neutral-700 bg-popover text-popover-foreground z-50 overflow-hidden ring-0"
      >
        {/* Filtering is done here instead of by cmdk: the library rows are
            dnd-kit sortables, not CommandItems, so cmdk must not hijack their
            clicks or intercept arrow keys. */}
        <Command className="rounded-none p-0" shouldFilter={false}>
          {/* Borderless search: no fill, just a hairline underneath. The line is
              a 1px element rather than a border so it renders exactly like the
              separator above the actions (borders can land on half pixels and
              get anti-aliased to a lighter shade). */}
          <div className="relative shrink-0">
            <CommandInput
              ref={searchRef}
              value={query}
              onValueChange={setQuery}
              // Arrow keys move into the list, so the popover behaves like one
              // keyboard surface instead of trapping focus in the field.
              onKeyDown={(event) => {
                if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                  event.preventDefault();
                  listboxRef.current?.focus();
                }
              }}
              placeholder={t("sidebar.searchLibraryPlaceholder")}
              wrapperClassName="px-0 py-0"
              // `addonClassName="py-0 pl-0"` removes the addon's own inset so
              // SEARCH_FIELD_PADDING alone decides where the icon sits.
              addonClassName="py-0 pl-0"
              groupClassName={`${SEARCH_FIELD_PADDING} rounded-none border-0 bg-transparent focus-within:border-ring/60 has-[[data-slot=input-group-control]:focus-visible]:border-ring/60 has-[[data-slot=input-group-control]:focus-visible]:ring-0`}
              className="h-4 text-xs leading-none"
            />
            <div
              aria-hidden="true"
              className={`pointer-events-none absolute inset-x-0 bottom-0 h-px ${DIVIDER_BG}`}
            />
          </div>

          {/* Only the library list scrolls (and only it gets capped): the block
              of actions below stays visible however many libraries exist.
              `min-h-0` is what lets this flex child actually shrink. */}
          <div className={`max-h-64 min-h-0 overflow-y-auto overflow-x-hidden no-scrollbar ${LIST_PADDING}`}>
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              modifiers={[restrictToVerticalAxis]}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={visibleLibraries.map((ref) => ref.id)}
                strategy={verticalListSortingStrategy}
              >
                {/* A real listbox so arrow keys, Home/End, Enter/Space and
                    typeahead all work; dnd-kit handles the drags on the grips.
                    Selecting the highlighted option switches library, which is
                    why Enter/Space route through `onSelectLibrary` below. */}
                <Listbox
                  focusRef={listboxRef}
                  // Typing while the list is focused continues in the search
                  // field, so filtering never requires a manual focus change.
                  onKeyDown={(event) => {
                    if (
                      event.key.length === 1 &&
                      !event.metaKey &&
                      !event.ctrlKey &&
                      !event.altKey
                    ) {
                      event.preventDefault();
                      setQuery((prev) => prev + event.key);
                      searchRef.current?.focus();
                    }
                  }}
                  aria-label={t("sidebar.libraryList")}
                  value={[library.id]}
                  onValueChange={(next) => {
                    const selectedId = next[0];
                    if (!selectedId || selectedId === library.id) {
                      onOpenChange(false);
                      return;
                    }
                    const target = allLibraries.find(
                      (ref) => ref.id === selectedId
                    );
                    if (!target) return;
                    onOpenChange(false);
                    // The path is only the address to open; identity is the
                    // ID, and switching never rewrites library data.
                    onSelectLibrary(target.path);
                  }}
                  className="flex flex-col"
                >
                  {visibleLibraries.map((ref) => (
                    <SortableLibraryRow
                      key={ref.id}
                      id={ref.id}
                      displayName={libraryDisplayName(ref.path)}
                      isActive={ref.id === library.id}
                      // Reordering a filtered list would be ambiguous, so only
                      // allow it when every library is visible.
                      dragDisabled={
                        allLibraries.length < 2 || Boolean(query.trim())
                      }
                    />
                  ))}
                </Listbox>
              </SortableContext>
            </DndContext>

            {visibleLibraries.length === 0 && (
              <p className="py-4 text-center text-xs text-muted-foreground">
                {t("sidebar.noLibrariesFound")}
              </p>
            )}
          </div>

          <CommandSeparator className={`my-0 h-px shrink-0 ${DIVIDER_BG}`} />

          <CommandGroup className="shrink-0 p-1">
            <CommandItem
              value="__action_create_library__ New Library..."
              onSelect={() => {
                onOpenChange(false);
                onCreateLibrary();
              }}
              className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs cursor-pointer hover:bg-foreground/5"
            >
              <FolderPlus className="size-3.5 text-muted-foreground shrink-0" />
              <span>{t("sidebar.createLibrary.action")}</span>
            </CommandItem>
            <CommandItem
              value="__action_open_dialog__ Open Library..."
              onSelect={() => {
                onOpenChange(false);
                onOpenDialog();
              }}
              className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs cursor-pointer hover:bg-foreground/5"
            >
              <FolderOpen className="size-3.5 text-muted-foreground shrink-0" />
              <span>{t("sidebar.openLibrary")}</span>
            </CommandItem>
          </CommandGroup>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
