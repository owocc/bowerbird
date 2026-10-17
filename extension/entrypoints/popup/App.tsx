import React, { useState, useEffect } from "react";
import { browser } from "wxt/browser";
import {
  Camera,
  Crop,
  Bookmark,
  Layers,
  RefreshCw,
  Settings,
  Check,
  AlertCircle,
  Folder as FolderIcon,
  Tag as TagIcon,
  Plus,
  X,
  ExternalLink,
} from "lucide-react";
import { Button } from "@workspace/ui/components/button";
import { Badge } from "@workspace/ui/components/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@workspace/ui/components/card";
import { Input } from "@workspace/ui/components/input";
import { Textarea } from "@workspace/ui/components/textarea";
import { Separator } from "@workspace/ui/components/separator";
import { cn } from "@workspace/ui/lib/utils";
import {
  checkConnection,
  fetchFolders,
  fetchTags,
  importBookmark,
  importFromBase64,
  getStoredApiUrl,
  setStoredApiUrl,
  DEFAULT_API_URL,
  type APIStatusResult,
  type Folder,
  type Tag,
} from "@/lib/api";

export function App() {
  const [status, setStatus] = useState<APIStatusResult>({ connected: false });
  const [isChecking, setIsChecking] = useState<boolean>(true);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [selectedFolder, setSelectedFolder] = useState<string>("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState<string>("");
  const [note, setNote] = useState<string>("");

  const [apiUrl, setApiUrl] = useState<string>(DEFAULT_API_URL);
  const [showSettings, setShowSettings] = useState<boolean>(false);
  const [isSavingSettings, setIsSavingSettings] = useState<boolean>(false);

  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ message: string; isError?: boolean } | null>(null);

  const showToast = (message: string, isError = false) => {
    setFeedback({ message, isError });
    setTimeout(() => setFeedback(null), 3000);
  };

  const loadData = async (targetUrl?: string) => {
    setIsChecking(true);
    try {
      const conn = (await checkConnection(targetUrl)) || { connected: false, error: "Connection failed" };
      setStatus(conn);
      if (conn?.connected) {
        const [fList, tList] = await Promise.all([
          fetchFolders(targetUrl),
          fetchTags(targetUrl),
        ]);
        setFolders(fList || []);
        setTags(tList || []);
      } else {
        setFolders([]);
        setTags([]);
      }
    } catch (err: unknown) {
      setStatus({ connected: false, error: err instanceof Error ? err.message : "Error checking connection" });
      setFolders([]);
      setTags([]);
    } finally {
      setIsChecking(false);
    }
  };

  useEffect(() => {
    getStoredApiUrl().then((url) => {
      setApiUrl(url);
      loadData(url);
    });
  }, []);

  const getActiveTab = async () => {
    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
    return tabs[0] || null;
  };

  // 1. Capture Visible Screen
  const handleCaptureVisible = async () => {
    if (!status?.connected) {
      showToast("Cannot connect to Bowerbird", true);
      return;
    }
    setActionLoading("visible");
    try {
      const tab = await getActiveTab();
      if (!tab?.id) throw new Error("No active tab");

      const dataUrl = await browser.tabs.captureVisibleTab({ format: "png" });
      const pageTitle = tab.title || "Web Screenshot";
      const pageUrl = tab.url || "";

      const res = await importFromBase64(
        {
          base64: dataUrl,
          name: pageTitle,
          website: pageUrl,
          annotation: note,
          tags: selectedTags,
          folderId: selectedFolder || undefined,
        },
        apiUrl
      );

      if (res.success) {
        showToast("✓ Screenshot saved to Bowerbird");
        browser.runtime.sendMessage({ type: "FLASH_BADGE", text: "✓", color: "#10b981" });
      } else {
        showToast(res.error || "Failed to save", true);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error capturing screen";
      showToast(msg, true);
    } finally {
      setActionLoading(null);
    }
  };

  // 2. Interactive Area Selection
  const handleCaptureArea = async () => {
    const tab = await getActiveTab();
    if (!tab?.id) {
      showToast("No active tab", true);
      return;
    }
    try {
      await browser.tabs.sendMessage(tab.id, { type: "START_AREA_SELECTION" });
      window.close();
    } catch {
      if (browser.scripting?.executeScript) {
        await browser.scripting.executeScript({
          target: { tabId: tab.id },
          files: ["/content-scripts/content.js"],
        });
      }
      await browser.tabs.sendMessage(tab.id, { type: "START_AREA_SELECTION" });
      window.close();
    }
  };

  // 3. Save Bookmark
  const handleSaveBookmark = async () => {
    if (!status?.connected) {
      showToast("Cannot connect to Bowerbird", true);
      return;
    }
    setActionLoading("bookmark");
    try {
      const tab = await getActiveTab();
      if (!tab?.url) throw new Error("No active tab URL");

      let screenshotUrl: string | undefined;
      try {
        screenshotUrl = await browser.tabs.captureVisibleTab({ format: "png" });
      } catch {}

      const res = await importBookmark(
        {
          url: tab.url,
          title: tab.title || tab.url,
          base64: screenshotUrl,
          annotation: note,
          tags: ["bookmark", ...selectedTags],
          folderId: selectedFolder || undefined,
        },
        apiUrl
      );

      if (res.success) {
        showToast("✓ Bookmark saved to Bowerbird");
        browser.runtime.sendMessage({ type: "FLASH_BADGE", text: "✓", color: "#10b981" });
      } else {
        showToast(res.error || "Failed to save", true);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error saving bookmark";
      showToast(msg, true);
    } finally {
      setActionLoading(null);
    }
  };

  // 4. Batch Page Image Collector
  const handleOpenBatchCollector = async () => {
    const tab = await getActiveTab();
    if (!tab?.id) {
      showToast("No active tab", true);
      return;
    }
    try {
      await browser.tabs.sendMessage(tab.id, { type: "OPEN_BATCH_COLLECTOR" });
      window.close();
    } catch {
      if (browser.scripting?.executeScript) {
        await browser.scripting.executeScript({
          target: { tabId: tab.id },
          files: ["/content-scripts/content.js"],
        });
      }
      await browser.tabs.sendMessage(tab.id, { type: "OPEN_BATCH_COLLECTOR" });
      window.close();
    }
  };

  const handleAddTag = () => {
    const trimmed = tagInput.trim();
    if (trimmed && !selectedTags.includes(trimmed)) {
      setSelectedTags([...selectedTags, trimmed]);
      setTagInput("");
    }
  };

  const handleRemoveTag = (t: string) => {
    setSelectedTags(selectedTags.filter((it) => it !== t));
  };

  const handleSaveApiUrl = async () => {
    setIsSavingSettings(true);
    await setStoredApiUrl(apiUrl);
    await loadData(apiUrl);
    setIsSavingSettings(false);
    setShowSettings(false);
    showToast("Settings updated");
  };

  return (
    <div className="p-4 flex flex-col gap-3.5 bg-background text-foreground select-none">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="size-6 rounded-lg bg-primary flex items-center justify-center font-bold text-xs text-primary-foreground shadow-2xs">
            B
          </div>
          <div>
            <div className="font-semibold text-xs tracking-tight text-foreground">
              Bowerbird Clipper
            </div>
            <div className="text-[10px] text-muted-foreground">Desktop Companion</div>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={() => setShowSettings(!showSettings)}
            className={cn(showSettings && "bg-muted text-foreground")}
            title="Settings"
          >
            <Settings className="size-3.5" />
          </Button>
        </div>
      </div>

      {/* Connection Status Card */}
      <div
        className={cn(
          "rounded-xl border p-2.5 flex items-center justify-between transition-colors",
          status?.connected
            ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-300"
            : "border-destructive/30 bg-destructive/10 text-destructive"
        )}
      >
        <div className="flex items-center gap-2 min-w-0 pr-2">
          <span className="relative flex size-2 shrink-0">
            {status?.connected && (
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            )}
            <span
              className={cn(
                "relative inline-flex rounded-full size-2",
                status?.connected ? "bg-emerald-500" : "bg-destructive"
              )}
            />
          </span>
          <span className="text-[11px] font-medium truncate">
            {status?.connected
              ? `Connected: ${status.libraryName || "Active Library"}`
              : "Disconnected from Bowerbird"}
          </span>
        </div>

        <Button
          variant="ghost"
          size="icon-xs"
          onClick={() => loadData(apiUrl)}
          disabled={isChecking}
          className="text-muted-foreground hover:text-foreground shrink-0"
          title="Retry Connection"
        >
          <RefreshCw className={cn("size-3", isChecking && "animate-spin")} />
        </Button>
      </div>

      {/* Settings Panel */}
      {showSettings && (
        <Card className="bg-card/70 border-border/80">
          <CardHeader className="p-3 pb-2">
            <CardTitle className="text-[11px] font-semibold text-muted-foreground">
              Desktop API Endpoint
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3 pt-0 flex gap-2">
            <Input
              type="text"
              value={apiUrl}
              onChange={(e) => setApiUrl(e.target.value)}
              placeholder="http://127.0.0.1:41595"
              className="h-7 text-xs font-mono"
            />
            <Button
              size="sm"
              variant="default"
              onClick={handleSaveApiUrl}
              disabled={isSavingSettings}
              className="h-7 text-xs px-3"
            >
              Save
            </Button>
          </CardContent>
        </Card>
      )}

      {/* 2x2 Quick Action Cards */}
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={handleCaptureVisible}
          disabled={actionLoading !== null}
          className="group relative flex flex-col items-start gap-1 rounded-xl border border-border/70 bg-card/60 p-3 text-left transition-all hover:border-primary/50 hover:bg-muted/40 cursor-pointer shadow-2xs active:translate-y-px"
        >
          <div className="rounded-lg p-1.5 bg-indigo-500/10 text-indigo-400 group-hover:scale-105 transition-transform">
            <Camera className="size-4" />
          </div>
          <div className="mt-1">
            <div className="text-xs font-semibold text-foreground">Visible Area</div>
            <div className="text-[10px] text-muted-foreground">Capture screen</div>
          </div>
        </button>

        <button
          type="button"
          onClick={handleCaptureArea}
          disabled={actionLoading !== null}
          className="group relative flex flex-col items-start gap-1 rounded-xl border border-border/70 bg-card/60 p-3 text-left transition-all hover:border-primary/50 hover:bg-muted/40 cursor-pointer shadow-2xs active:translate-y-px"
        >
          <div className="rounded-lg p-1.5 bg-sky-500/10 text-sky-400 group-hover:scale-105 transition-transform">
            <Crop className="size-4" />
          </div>
          <div className="mt-1">
            <div className="text-xs font-semibold text-foreground">Selected Area</div>
            <div className="text-[10px] text-muted-foreground">Crop region</div>
          </div>
        </button>

        <button
          type="button"
          onClick={handleSaveBookmark}
          disabled={actionLoading !== null}
          className="group relative flex flex-col items-start gap-1 rounded-xl border border-border/70 bg-card/60 p-3 text-left transition-all hover:border-primary/50 hover:bg-muted/40 cursor-pointer shadow-2xs active:translate-y-px"
        >
          <div className="rounded-lg p-1.5 bg-emerald-500/10 text-emerald-400 group-hover:scale-105 transition-transform">
            <Bookmark className="size-4" />
          </div>
          <div className="mt-1">
            <div className="text-xs font-semibold text-foreground">Web Bookmark</div>
            <div className="text-[10px] text-muted-foreground">Save link card</div>
          </div>
        </button>

        <button
          type="button"
          onClick={handleOpenBatchCollector}
          disabled={actionLoading !== null}
          className="group relative flex flex-col items-start gap-1 rounded-xl border border-border/70 bg-card/60 p-3 text-left transition-all hover:border-primary/50 hover:bg-muted/40 cursor-pointer shadow-2xs active:translate-y-px"
        >
          <div className="rounded-lg p-1.5 bg-pink-500/10 text-pink-400 group-hover:scale-105 transition-transform">
            <Layers className="size-4" />
          </div>
          <div className="mt-1">
            <div className="text-xs font-semibold text-foreground">Batch Grabber</div>
            <div className="text-[10px] text-muted-foreground">Extract all media</div>
          </div>
        </button>
      </div>

      <Separator className="my-0.5" />

      {/* Target Folder Selector */}
      <div className="space-y-1.5">
        <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
          <FolderIcon className="size-3 text-primary" />
          <span>Save to Folder</span>
        </div>
        <select
          value={selectedFolder}
          onChange={(e) => setSelectedFolder(e.target.value)}
          className="w-full rounded-xl border border-input/60 bg-muted/40 px-2.5 py-1.5 text-xs text-foreground outline-none transition-all focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 cursor-pointer"
        >
          <option value="">(Uncategorized)</option>
          {folders.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </select>
      </div>

      {/* Tags Input */}
      <div className="space-y-1.5">
        <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
          <TagIcon className="size-3 text-primary" />
          <span>Tags</span>
        </div>

        {selectedTags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {selectedTags.map((t) => (
              <Badge key={t} variant="indigo" className="gap-1 pr-1 cursor-default">
                <span>{t}</span>
                <button
                  type="button"
                  onClick={() => handleRemoveTag(t)}
                  className="rounded-full hover:bg-indigo-500/30 p-0.5 transition-colors cursor-pointer"
                >
                  <X className="size-2.5" />
                </button>
              </Badge>
            ))}
          </div>
        )}

        <div className="flex gap-1.5">
          <Input
            type="text"
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAddTag()}
            placeholder="Add tag and press Enter..."
            className="h-7 text-xs"
          />
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={handleAddTag}
            className="h-7 px-2 shrink-0"
          >
            <Plus className="size-3.5" />
          </Button>
        </div>
      </div>

      {/* Note Textarea */}
      <div className="space-y-1">
        <Textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Optional notes or annotation..."
          rows={2}
          className="min-h-[50px] text-xs"
        />
      </div>

      {/* Feedback Toast */}
      {feedback && (
        <div
          className={cn(
            "rounded-xl border p-2 flex items-center justify-center gap-1.5 text-xs font-semibold animate-in fade-in zoom-in-95 duration-150",
            feedback.isError
              ? "border-destructive/40 bg-destructive/15 text-destructive"
              : "border-emerald-500/40 bg-emerald-500/15 text-emerald-400"
          )}
        >
          {feedback.isError ? (
            <AlertCircle className="size-3.5" />
          ) : (
            <Check className="size-3.5" />
          )}
          <span>{feedback.message}</span>
        </div>
      )}
    </div>
  );
}
