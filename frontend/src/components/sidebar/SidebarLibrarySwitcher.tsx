import {
  Check,
  ChevronsUpDown,
  Folder as FolderIcon,
  FolderOpen,
  Layers3,
  LogOut,
} from "lucide-react";
import { useTranslation } from "react-i18next";

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { LibraryInfo } from "../../../bindings/bowerbird/core/models";

const OPEN_DIALOG_VALUE = "__action_open_dialog__";
const CLOSE_LIBRARY_VALUE = "__action_close__";

export const LIBRARY_OPEN_DIALOG_VALUE = OPEN_DIALOG_VALUE;
export const LIBRARY_CLOSE_VALUE = CLOSE_LIBRARY_VALUE;

function libraryDisplayName(path: string): string {
  const normalized = path.replace(/[/\\]+$/, "");
  const parts = normalized.split(/[/\\]/);
  const lastPart = parts[parts.length - 1] || path;
  return lastPart.endsWith(".library") ? lastPart.slice(0, -8) : lastPart;
}

export interface SidebarLibrarySwitcherProps {
  library: LibraryInfo;
  recentLibraries: string[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectLibrary: (value: string) => void;
  onOpenDialog: () => void;
  onCloseLibrary: () => void;
}

/** The library name button in the sidebar header plus its command popover. */
export function SidebarLibrarySwitcher({
  library,
  recentLibraries,
  open,
  onOpenChange,
  onSelectLibrary,
  onOpenDialog,
  onCloseLibrary,
}: SidebarLibrarySwitcherProps) {
  const { t } = useTranslation();
  const otherRecentLibraries = recentLibraries.filter(
    (p) => p !== library.path
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
        align="start"
        sideOffset={4}
        className="w-64 p-0 rounded-xl shadow-xl border border-neutral-300 dark:border-neutral-700 bg-popover text-popover-foreground z-50 overflow-hidden ring-0"
      >
        <Command className="rounded-xl">
          <CommandInput
            placeholder={t("sidebar.searchLibraryPlaceholder")}
            className="h-8 text-xs"
          />
          <CommandList className="max-h-64 p-1">
            <CommandEmpty className="py-4 text-center text-xs text-muted-foreground">
              {t("sidebar.noLibrariesFound")}
            </CommandEmpty>
            <CommandGroup>
              <CommandItem
                value={`${library.name} ${library.path}`}
                onSelect={() => onOpenChange(false)}
                className="flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs cursor-pointer bg-accent/40 font-medium"
              >
                <Layers3 className="size-3.5 text-primary shrink-0" />
                <span className="truncate flex-1 text-xs">{library.name}</span>
                <Check className="size-3.5 text-primary shrink-0" />
              </CommandItem>

              {otherRecentLibraries.map((p) => {
                const displayName = libraryDisplayName(p);
                return (
                  <CommandItem
                    key={p}
                    value={`${displayName} ${p}`}
                    onSelect={() => {
                      onOpenChange(false);
                      onSelectLibrary(p);
                    }}
                    className="flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs cursor-pointer hover:bg-foreground/5"
                  >
                    <FolderIcon className="size-3.5 text-muted-foreground shrink-0" />
                    <span className="truncate flex-1 text-xs">
                      {displayName}
                    </span>
                  </CommandItem>
                );
              })}
            </CommandGroup>

            <CommandSeparator className="my-1" />

            <CommandGroup>
              <CommandItem
                value={`${OPEN_DIALOG_VALUE} Open Library...`}
                onSelect={() => {
                  onOpenChange(false);
                  onOpenDialog();
                }}
                className="flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs cursor-pointer hover:bg-foreground/5"
              >
                <FolderOpen className="size-3.5 text-muted-foreground shrink-0" />
                <span>{t("sidebar.openLibrary")}</span>
              </CommandItem>
              <CommandItem
                value={`${CLOSE_LIBRARY_VALUE} Close Library`}
                onSelect={() => {
                  onOpenChange(false);
                  onCloseLibrary();
                }}
                className="flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs cursor-pointer text-muted-foreground hover:text-destructive hover:bg-destructive/10"
              >
                <LogOut className="size-3.5 shrink-0" />
                <span>{t("sidebar.closeLibrary")}</span>
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
