import { useCallback, useEffect, useRef, useState } from "react";
import { useCanGoBack, useRouter } from "@tanstack/react-router";

/**
 * Back/Forward state for the router's history.
 *
 * `@tanstack/history` tracks its own position in `location.state.__TSR_index`
 * (0 for the first entry this app created). "Can go back" is just
 * `__TSR_index !== 0`, which the installed router already exposes through
 * `useCanGoBack`.
 *
 * There is no `useCanGoForward`, and `history.length` is the *native*
 * `window.history.length` (it also counts entries that existed before the app
 * mounted), so it cannot be used to detect a forward entry. Instead we track the
 * highest index seen this session:
 *   - on PUSH the browser truncates the forward entries, so the max resets to
 *     the new index;
 *   - on BACK/FORWARD/REPLACE/GO the max only ever grows.
 * Then `canGoForward = index < maxIndex`.
 */
export function useHistoryNavigation() {
  const router = useRouter();
  const canGoBack = useCanGoBack();
  const maxIndexRef = useRef<number>(router.history.location.state.__TSR_index ?? 0);
  const [canGoForward, setCanGoForward] = useState(false);

  useEffect(() => {
    const sync = (index: number) => {
      setCanGoForward(index < maxIndexRef.current);
    };

    // Seed from the current entry in case the app mounted mid-history.
    const initialIndex = router.history.location.state.__TSR_index ?? 0;
    maxIndexRef.current = Math.max(maxIndexRef.current, initialIndex);
    sync(initialIndex);

    const unsubscribe = router.history.subscribe(({ location, action }) => {
      const index = location.state.__TSR_index ?? 0;
      if (action.type === "PUSH") {
        // Forward entries were discarded by the browser.
        maxIndexRef.current = index;
      } else if (index > maxIndexRef.current) {
        maxIndexRef.current = index;
      }
      sync(index);
    });
    return unsubscribe;
  }, [router]);

  const goBack = useCallback(() => router.history.back(), [router]);
  const goForward = useCallback(() => router.history.forward(), [router]);

  return { canGoBack, canGoForward, goBack, goForward };
}
