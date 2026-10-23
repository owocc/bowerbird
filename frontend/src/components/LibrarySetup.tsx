import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  FolderPlus,
  FolderOpen,
  Folder,
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Settings,
  Layers3,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AppMenuButton } from "@/components/AppMenuButton";
import { MacTrafficLightSpacer } from "@/components/MacTrafficLightSpacer";
import { usesInAppMenuBar } from "@/lib/platform";
import {
  CreateLibrary,
  OpenLibrary,
  SelectDirectory,
  SelectLibraryDialog,
  OpenSettingsWindow,
  CloseSetupWindow,
  GetRecentLibraries,
} from "../../bindings/bowerbird/core/service";
import type { LibraryInfo } from "../../bindings/bowerbird/core/models";
import { getErrorMessage, notifyError, notifySuccess } from "@/lib/notify";
import { SuccessCodes, ErrorCodes } from "@/lib/error-codes";

interface LibrarySetupProps {
  onLibraryOpened?: (lib: LibraryInfo) => void;
}

type SetupView = "home" | "create";

function libraryDisplayName(path: string): string {
  const normalized = path.replace(/[/\\]+$/, "");
  const parts = normalized.split(/[/\\]/);
  const lastPart = parts[parts.length - 1] || path;
  return lastPart.endsWith(".library") ? lastPart.slice(0, -8) : lastPart;
}

export function LibrarySetup({ onLibraryOpened }: LibrarySetupProps) {
  const { t } = useTranslation();
  const [view, setView] = useState<SetupView>("home");
  const [libName, setLibName] = useState("MyAssets");
  const [parentDir, setParentDir] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recentLibraries, setRecentLibraries] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    GetRecentLibraries()
      .then((list) => {
        if (!cancelled) setRecentLibraries(list || []);
      })
      .catch((err) => {
        console.error("Failed to load recent libraries:", err);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleOpened = (lib: LibraryInfo) => {
    if (onLibraryOpened) {
      onLibraryOpened(lib);
    }
    // Setup window automatically closes when library is opened
    CloseSetupWindow().catch(() => {});
  };

  // Pick target folder for new library
  const handlePickDirectory = async () => {
    setError(null);
    try {
      const selected = await SelectDirectory();
      if (selected) {
        setParentDir(selected);
      }
    } catch (err) {
      const msg = getErrorMessage(err);
      setError(msg);
      notifyError(err);
    }
  };

  // Create new .library directory
  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!parentDir) {
      setError(t("setup.errors.selectStorage"));
      return;
    }
    if (!libName.trim()) {
      const msg = getErrorMessage(ErrorCodes.LIB_NAME_REQUIRED);
      setError(msg);
      notifyError(ErrorCodes.LIB_NAME_REQUIRED);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const lib = await CreateLibrary(parentDir, libName.trim());
      if (lib) {
        notifySuccess(SuccessCodes.LIBRARY_CREATED);
        handleOpened(lib);
      }
    } catch (err) {
      const msg = getErrorMessage(err);
      setError(msg);
      notifyError(err);
    } finally {
      setLoading(false);
    }
  };

  // Open existing .library directory
  const handleOpenExisting = async () => {
    setError(null);
    setLoading(true);
    try {
      const selected = await SelectLibraryDialog();
      if (selected) {
        const lib = await OpenLibrary(selected);
        if (lib) {
          notifySuccess(SuccessCodes.LIBRARY_OPENED);
          handleOpened(lib);
        }
      }
    } catch (err) {
      const msg = getErrorMessage(err);
      setError(msg);
      notifyError(err);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenRecent = async (path: string) => {
    setError(null);
    setLoading(true);
    try {
      const lib = await OpenLibrary(path);
      if (lib) {
        notifySuccess(SuccessCodes.LIBRARY_OPENED);
        handleOpened(lib);
      }
    } catch (err) {
      const msg = getErrorMessage(err);
      setError(msg);
      notifyError(err);
    } finally {
      setLoading(false);
    }
  };

  const previewPath = parentDir
    ? `${parentDir}/${libName.trim() || "MyAssets"}${libName.endsWith(".library") ? "" : ".library"}`
    : "";

  const handleOpenSettings = async () => {
    try {
      await OpenSettingsWindow();
    } catch (err) {
      console.error("Failed to open settings window:", err);
    }
  };

  const switchView = (next: SetupView) => {
    setError(null);
    setView(next);
  };

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-background flex flex-col items-center justify-center p-6 select-none wails-no-drag">
      {/* Top titlebar drag area */}
      <div className="absolute top-0 left-0 right-0 h-(--titlebar-height) flex items-center px-3 z-10 wails-drag">
        <MacTrafficLightSpacer className="w-[80px] h-(--titlebar-height) shrink-0" />
        <div className="flex-1 h-full" />
      </div>

      {/* Top-left: app menu button (Windows/Linux; it carries the settings entry) */}
      <div className="absolute top-3 left-3 z-20 wails-no-drag">
        <AppMenuButton className="size-8" />
      </div>

      {/* Top-right: settings entry point for macOS, whose menu is native */}
      {!usesInAppMenuBar() && (
        <button
          type="button"
          onClick={handleOpenSettings}
          title={t("settings.title")}
          className="absolute top-3 right-3 z-20 inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors cursor-pointer wails-no-drag"
        >
          <Settings className="size-4" />
          <span>{t("settings.title")}</span>
        </button>
      )}

      <div className="w-full max-w-md space-y-8 pt-4">
        <h1 className="text-center text-3xl font-bold tracking-tight">
          {view === "create" ? t("setup.create.title") : t("setup.title")}
        </h1>

        {error && (
          <div className="p-3.5 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-xs flex items-center gap-2.5">
            <AlertCircle className="size-4 shrink-0" />
            <p className="flex-1">{error}</p>
          </div>
        )}

        {view === "home" ? (
          <div className="space-y-6">
            <div className="flex flex-col gap-3">
              <Button
                type="button"
                disabled={loading}
                onClick={() => switchView("create")}
                className="h-11 gap-2 text-sm"
              >
                <FolderPlus className="size-4" />
                <span>{t("setup.create.button")}</span>
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={loading}
                onClick={handleOpenExisting}
                className="h-11 gap-2 text-sm"
              >
                <FolderOpen className="size-4" />
                <span>{t("setup.open.button")}</span>
              </Button>
            </div>

            {recentLibraries.length > 0 && (
              <div className="space-y-2">
                <p className="px-1 text-xs font-medium text-muted-foreground">
                  {t("setup.recent.title")}
                </p>
                <div className="max-h-64 overflow-y-auto rounded-xl border border-border divide-y divide-border">
                  {recentLibraries.map((path) => (
                    <button
                      key={path}
                      type="button"
                      disabled={loading}
                      onClick={() => handleOpenRecent(path)}
                      title={path}
                      className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-muted/60 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Layers3 className="size-4 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">
                          {libraryDisplayName(path)}
                        </span>
                        <span className="block truncate text-[11px] text-muted-foreground font-mono">
                          {path}
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <form onSubmit={handleCreate} className="space-y-4 text-xs">
            <div className="space-y-1.5">
              <label className="font-medium text-foreground">{t("setup.create.nameLabel")}</label>
              <div className="flex items-center gap-2">
                <Input
                  value={libName}
                  onChange={(e) => setLibName(e.target.value)}
                  placeholder={t("setup.create.namePlaceholder")}
                  className="text-xs h-9"
                  autoFocus
                />
                <span className="text-muted-foreground font-mono text-xs shrink-0">.library</span>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="font-medium text-foreground">{t("setup.create.storageLabel")}</label>
              <div className="flex gap-2">
                <Input
                  readOnly
                  value={parentDir || t("setup.create.noDirectory")}
                  placeholder={t("setup.create.directoryPlaceholder")}
                  className={`text-xs h-9 font-mono ${!parentDir ? "text-muted-foreground italic" : ""}`}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handlePickDirectory}
                  className="shrink-0 h-9 gap-1.5"
                >
                  <Folder className="size-3.5" />
                  <span>{t("setup.create.chooseLocation")}</span>
                </Button>
              </div>
            </div>

            {previewPath && (
              <div className="p-2.5 rounded-lg bg-muted/50 border border-border/60 text-[11px] text-muted-foreground space-y-0.5">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/80">
                  {t("setup.create.previewLabel")}
                </span>
                <p className="font-mono text-foreground break-all">{previewPath}</p>
              </div>
            )}

            <div className="flex items-center justify-between pt-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={loading}
                onClick={() => switchView("home")}
                className="gap-1.5 text-xs h-9"
              >
                <ArrowLeft className="size-3.5" />
                <span>{t("setup.back")}</span>
              </Button>
              <Button type="submit" disabled={loading || !parentDir} className="gap-2 text-xs h-9">
                <span>{loading ? t("setup.create.creating") : t("setup.create.submit")}</span>
                <ArrowRight className="size-3.5" />
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
