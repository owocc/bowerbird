import { ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { useHistoryNavigation } from "@/hooks/useHistoryNavigation";
import { cn } from "@/lib/utils";

/**
 * Back/Forward buttons for the unified toolbar. They drive the real router
 * history, so they walk the same stack as Cmd+[ / Cmd+] and the OS gesture.
 */
export function HistoryNavButtons({ className }: { className?: string }) {
  const { t } = useTranslation();
  const { canGoBack, canGoForward, goBack, goForward } = useHistoryNavigation();

  const buttonClass =
    "size-7 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/60 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-muted-foreground";

  return (
    <div className={cn("flex items-center gap-0.5 shrink-0 wails-no-drag", className)}>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        onClick={goBack}
        disabled={!canGoBack}
        title={t("common.back")}
        aria-label={t("common.back")}
        className={buttonClass}
      >
        <ChevronLeft className="size-4 pointer-events-none" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        onClick={goForward}
        disabled={!canGoForward}
        title={t("common.forward")}
        aria-label={t("common.forward")}
        className={buttonClass}
      >
        <ChevronRight className="size-4 pointer-events-none" />
      </Button>
    </div>
  );
}
