import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { AlignJustify, Bug, Info, LogOut, Maximize, RotateCw, Settings } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { AppMenuItem } from "../../bindings/bowerbird/core/models";
import { loadAppMenu, runAppMenuAction } from "@/lib/app-menu";
import { usesInAppMenuBar } from "@/lib/platform";
import { cn } from "@/lib/utils";

/**
 * Icons for the `icon` names emitted by `core.AppMenuModel`. A name without an
 * entry simply renders without an icon.
 */
const MENU_ICONS: Record<string, React.ReactNode> = {
  settings: <Settings className="size-3.5" />,
  about: <Info className="size-3.5" />,
  reload: <RotateCw className="size-3.5" />,
  fullscreen: <Maximize className="size-3.5" />,
  devtools: <Bug className="size-3.5" />,
  quit: <LogOut className="size-3.5" />,
};

interface AppMenuRowProps {
  icon?: React.ReactNode;
  label: string;
  hint?: string;
  onClick: () => void;
  destructive?: boolean;
}

function AppMenuRow({ icon, label, hint, onClick, destructive }: AppMenuRowProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs transition-colors cursor-pointer",
        destructive
          ? "text-destructive hover:bg-destructive/10"
          : "text-popover-foreground hover:bg-muted/60"
      )}
    >
      {icon && <span className="shrink-0 text-muted-foreground">{icon}</span>}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {hint && (
        <kbd className="shrink-0 font-mono text-[10px] text-muted-foreground">{hint}</kbd>
      )}
    </button>
  );
}

export interface AppMenuButtonProps {
  className?: string;
  /** Which edge of the trigger the popover is anchored to. Use "end" when the
   *  button sits near the right edge of the window (e.g. in the sidebar). */
  align?: "start" | "center" | "end";
}

/**
 * The application menu button (the ≡ button), drawn by the app itself.
 *
 * Rendered on Windows and Linux only (see `usesInAppMenuBar`). macOS registers
 * its menu natively into the global menu bar (`core.BuildNativeAppMenu`), so it
 * needs no reimplementation and draws nothing here.
 *
 * The rows come from `core.GetAppMenu`, so this component never hardcodes a
 * label, an order or a shortcut: the Go bridge is the single source of truth.
 * Running a row goes through `runAppMenuAction`, which the shortcut layer
 * (`useAppShortcuts`) uses too.
 */
export function AppMenuButton({ className, align = "start" }: AppMenuButtonProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<AppMenuItem[]>([]);

  useEffect(() => {
    if (!usesInAppMenuBar()) return;

    let cancelled = false;
    loadAppMenu()
      .then((loaded) => {
        if (!cancelled) setItems(loaded);
      })
      .catch((err) => {
        console.error("Failed to load the application menu:", err);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // macOS registers its menu natively; the app draws no button there.
  if (!usesInAppMenuBar()) return null;

  const run = (action: string) => async () => {
    setOpen(false);
    try {
      await runAppMenuAction(action);
    } catch (err) {
      console.error(`Application menu action "${action}" failed:`, err);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        title={t("appMenu.label")}
        className={cn(
          "inline-flex size-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground cursor-pointer outline-none wails-no-drag",
          className
        )}
      >
        <AlignJustify className="size-4" />
      </PopoverTrigger>
      <PopoverContent
        align={align}
        side="bottom"
        sideOffset={6}
        className="w-52 gap-0 rounded-xl border border-border/60 bg-popover p-1 shadow-xl"
      >
        {items.map((item, index) =>
          item.separator ? (
            <div key={`separator-${index}`} className="my-1 h-px bg-border/60" />
          ) : (
            <AppMenuRow
              key={item.action}
              icon={MENU_ICONS[item.icon]}
              label={t(item.labelKey, { defaultValue: item.title })}
              hint={item.shortcut}
              onClick={run(item.action)}
              destructive={item.destructive}
            />
          )
        )}
      </PopoverContent>
    </Popover>
  );
}
