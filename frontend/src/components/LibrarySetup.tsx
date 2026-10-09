import { useState } from "react";
import { useTranslation, Trans } from "react-i18next";
import { FolderPlus, FolderOpen, Folder, Sparkles, AlertCircle, ArrowRight, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { AppMenuButton } from "@/components/AppMenuButton";
import { usesInAppMenuBar } from "@/lib/platform";
import {
  CreateLibrary,
  OpenLibrary,
  SelectDirectory,
  SelectLibraryDialog,
  OpenSettingsWindow,
} from "../../bindings/bowerbird/core/service";
import type { LibraryInfo } from "../../bindings/bowerbird/core/models";

interface LibrarySetupProps {
  onLibraryOpened: (lib: LibraryInfo) => void;
}

export function LibrarySetup({ onLibraryOpened }: LibrarySetupProps) {
  const { t } = useTranslation();
  const [libName, setLibName] = useState("MyAssets");
  const [parentDir, setParentDir] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Pick target folder for new library
  const handlePickDirectory = async () => {
    setError(null);
    try {
      const selected = await SelectDirectory();
      if (selected) {
        setParentDir(selected);
      }
    } catch (err) {
      setError(t("setup.errors.selectDirectory", { error: String(err) }));
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
      setError(t("setup.errors.enterName"));
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const lib = await CreateLibrary(parentDir, libName.trim());
      if (lib) {
        onLibraryOpened(lib);
      }
    } catch (err) {
      setError(t("setup.errors.createLibrary", { error: String(err) }));
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
          onLibraryOpened(lib);
        }
      }
    } catch (err) {
      setError(t("setup.errors.openLibrary", { error: String(err) }));
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

  return (
    <div className="relative min-h-screen bg-background flex flex-col items-center justify-center p-6 select-none wails-no-drag">
      {/* Top-left: app menu button (Windows/Linux; it carries the settings entry) */}
      <div className="absolute top-3 left-3">
        <AppMenuButton className="size-8" />
      </div>

      {/* Top-right: settings entry point for macOS, whose menu is native */}
      {!usesInAppMenuBar() && (
        <button
          type="button"
          onClick={handleOpenSettings}
          title={t("settings.title")}
          className="absolute top-3 right-3 inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors cursor-pointer"
        >
          <Settings className="size-4" />
          <span>{t("settings.title")}</span>
        </button>
      )}

      <div className="w-full max-w-xl space-y-6">
        {/* Brand header */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium">
            <Sparkles className="size-3.5" />
            <span>{t("setup.badge")}</span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight">{t("setup.title")}</h1>
          <p className="text-sm text-muted-foreground">
            {t("setup.subtitle")}
          </p>
        </div>

        {error && (
          <div className="p-3.5 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-xs flex items-center gap-2.5">
            <AlertCircle className="size-4 shrink-0" />
            <p className="flex-1">{error}</p>
          </div>
        )}

        {/* Create new library card */}
        <Card className="border-border shadow-sm">
          <CardHeader className="pb-4">
            <CardTitle className="text-base flex items-center gap-2">
              <FolderPlus className="size-4 text-primary" />
              <span>{t("setup.create.title")}</span>
            </CardTitle>
            <CardDescription className="text-xs">
              <Trans
                i18nKey="setup.create.description"
                components={{ code: <code className="font-mono text-foreground font-semibold" /> }}
              />
            </CardDescription>
          </CardHeader>
          <form onSubmit={handleCreate}>
            <CardContent className="space-y-4 text-xs">
              <div className="space-y-1.5">
                <label className="font-medium text-foreground">{t("setup.create.nameLabel")}</label>
                <div className="flex items-center gap-2">
                  <Input
                    value={libName}
                    onChange={(e) => setLibName(e.target.value)}
                    placeholder={t("setup.create.namePlaceholder")}
                    className="text-xs h-9"
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
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/80">{t("setup.create.previewLabel")}</span>
                  <p className="font-mono text-foreground break-all">{previewPath}</p>
                </div>
              )}
            </CardContent>
            <CardFooter className="pt-2 flex justify-end">
              <Button type="submit" disabled={loading || !parentDir} className="gap-2 text-xs h-9">
                <span>{loading ? t("setup.create.creating") : t("setup.create.submit")}</span>
                <ArrowRight className="size-3.5" />
              </Button>
            </CardFooter>
          </form>
        </Card>

        {/* Open existing library option */}
        <div className="relative text-center">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t border-border" />
          </div>
          <span className="relative bg-background px-3 text-xs text-muted-foreground uppercase font-semibold">
            {t("setup.or")}
          </span>
        </div>

        <Card className="border-dashed border-border bg-muted/20">
          <CardContent className="py-4 flex items-center justify-between gap-4">
            <div className="space-y-0.5 text-xs">
              <p className="font-medium">{t("setup.open.title")}</p>
              <p className="text-[11px] text-muted-foreground">{t("setup.open.description")}</p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={loading}
              onClick={handleOpenExisting}
              className="shrink-0 gap-1.5 text-xs h-9"
            >
              <FolderOpen className="size-3.5" />
              <span>{t("setup.open.button")}</span>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
