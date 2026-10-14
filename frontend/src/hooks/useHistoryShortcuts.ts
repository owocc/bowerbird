import { useEffect } from "react";
import { useRouter } from "@tanstack/react-router";

/**
 * Browser-style Back/Forward keyboard shortcuts, wired to the router history.
 *
 *   macOS          Cmd+[ / Cmd+]
 *   Windows/Linux  Alt+← / Alt+→  and  Ctrl+[ / Ctrl+]
 *
 * Mounted once per window (see the router's `RootLayout`). It is a DOM listener,
 * so it only fires while one of the app's windows is focused, and it stands down
 * inside editable elements so typing in the search box is never hijacked.
 */
export function useHistoryShortcuts() {
  const router = useRouter();

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }

      const { code, metaKey, ctrlKey, altKey, shiftKey } = event;
      if (shiftKey) return;

      const isBackKey = metaKey || ctrlKey;
      if (isBackKey && !altKey) {
        if (code === "BracketLeft") {
          event.preventDefault();
          router.history.back();
          return;
        }
        if (code === "BracketRight") {
          event.preventDefault();
          router.history.forward();
          return;
        }
      }

      if (altKey && !metaKey && !ctrlKey) {
        if (code === "ArrowLeft") {
          event.preventDefault();
          router.history.back();
          return;
        }
        if (code === "ArrowRight") {
          event.preventDefault();
          router.history.forward();
          return;
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [router]);
}
