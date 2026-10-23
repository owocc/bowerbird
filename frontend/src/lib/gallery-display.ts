import { useCallback, useState } from "react";

export type ThumbnailQuality = "speed" | "original";

export interface GalleryDisplayPrefs {
  thumbnailQuality: ThumbnailQuality;
  showName: boolean;
  showItemInfo: boolean;
  showExtension: boolean;
  includeSubfolders: boolean;
  showSidebar: boolean;
  showInspector: boolean;
}

export const GALLERY_DISPLAY_DEFAULTS: GalleryDisplayPrefs = {
  thumbnailQuality: "speed",
  showName: true,
  showItemInfo: true,
  showExtension: true,
  includeSubfolders: false,
  showSidebar: true,
  showInspector: true,
};

const STORAGE_KEY = "bowerbird.gallery.display";

function isBool(value: unknown): value is boolean {
  return typeof value === "boolean";
}

function parsePrefs(raw: string | null): GalleryDisplayPrefs {
  if (!raw) return { ...GALLERY_DISPLAY_DEFAULTS };
  try {
    const parsed = JSON.parse(raw) as Partial<GalleryDisplayPrefs>;
    return {
      thumbnailQuality:
        parsed.thumbnailQuality === "original" ? "original" : "speed",
      showName: isBool(parsed.showName)
        ? parsed.showName
        : GALLERY_DISPLAY_DEFAULTS.showName,
      showItemInfo: isBool(parsed.showItemInfo)
        ? parsed.showItemInfo
        : GALLERY_DISPLAY_DEFAULTS.showItemInfo,
      showExtension: isBool(parsed.showExtension)
        ? parsed.showExtension
        : GALLERY_DISPLAY_DEFAULTS.showExtension,
      includeSubfolders: isBool(parsed.includeSubfolders)
        ? parsed.includeSubfolders
        : GALLERY_DISPLAY_DEFAULTS.includeSubfolders,
      showSidebar: isBool(parsed.showSidebar)
        ? parsed.showSidebar
        : GALLERY_DISPLAY_DEFAULTS.showSidebar,
      showInspector: isBool(parsed.showInspector)
        ? parsed.showInspector
        : GALLERY_DISPLAY_DEFAULTS.showInspector,
    };
  } catch {
    return { ...GALLERY_DISPLAY_DEFAULTS };
  }
}

function readPrefs(): GalleryDisplayPrefs {
  try {
    if (typeof window === "undefined") return { ...GALLERY_DISPLAY_DEFAULTS };
    return parsePrefs(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    return { ...GALLERY_DISPLAY_DEFAULTS };
  }
}

function writePrefs(prefs: GalleryDisplayPrefs) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    /* ignore quota / private-mode errors */
  }
}

export function useGalleryDisplayPrefs() {
  const [prefs, setPrefsState] = useState<GalleryDisplayPrefs>(readPrefs);

  const setPrefs = useCallback(
    (
      patch:
        | Partial<GalleryDisplayPrefs>
        | ((prev: GalleryDisplayPrefs) => Partial<GalleryDisplayPrefs>)
    ) => {
      setPrefsState((prev) => {
        const next = {
          ...prev,
          ...(typeof patch === "function" ? patch(prev) : patch),
        };
        writePrefs(next);
        return next;
      });
    },
    []
  );

  return { prefs, setPrefs };
}
