import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { Events } from "@/lib/host-runtime";
import { GetActiveLibrary } from "../../bindings/bowerbird/core/service";
import type { LibraryInfo } from "../../bindings/bowerbird/core/models";

/**
 * App-wide active-library state.
 *
 * Keeps active library state synchronized across all windows (main window and
 * secondary setup/settings windows) via Wails runtime event bus.
 */
interface LibraryContextValue {
  library: LibraryInfo | null;
  /** False until the initial `GetActiveLibrary` probe resolves. */
  ready: boolean;
  openLibrary: (library: LibraryInfo) => void;
  closeLibrary: () => void;
  /** Replaces the active library in place (e.g. after a rename). */
  notifyLibraryChanged: (library: LibraryInfo) => void;
}

const LibraryContext = createContext<LibraryContextValue | null>(null);

export function LibraryProvider({ children }: { children: React.ReactNode }) {
  const [library, setLibrary] = useState<LibraryInfo | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const lib = await GetActiveLibrary();
        if (!cancelled && lib) setLibrary(lib);
      } catch (err) {
        console.error("Failed to check active library:", err);
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Listen for library lifecycle events broadcast across all windows
  useEffect(() => {
    const unsubOpen = Events.On("library-opened", (event: any) => {
      const data = event?.data;
      if (data && typeof data === "object") {
        setLibrary(data as LibraryInfo);
      } else {
        GetActiveLibrary().then((lib) => {
          if (lib) setLibrary(lib);
        }).catch(console.error);
      }
    });

    const unsubClose = Events.On("library-closed", () => {
      setLibrary(null);
    });

    return () => {
      unsubOpen();
      unsubClose();
    };
  }, []);

  const value = useMemo<LibraryContextValue>(
    () => ({
      library,
      ready,
      openLibrary: (lib) => setLibrary(lib),
      closeLibrary: () => setLibrary(null),
      notifyLibraryChanged: (lib) => setLibrary(lib),
    }),
    [library, ready]
  );

  return <LibraryContext.Provider value={value}>{children}</LibraryContext.Provider>;
}

export function useLibrary(): LibraryContextValue {
  const context = useContext(LibraryContext);
  if (!context) {
    throw new Error("useLibrary must be used within a LibraryProvider");
  }
  return context;
}
