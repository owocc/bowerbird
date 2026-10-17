import React, { useState, useEffect } from "react";
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
  ChevronRight,
  Globe,
  Plus,
  X,
} from "lucide-react";
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
    const conn = await checkConnection(targetUrl);
    setStatus(conn);
    setIsChecking(false);

    if (conn.connected) {
      const [fList, tList] = await Promise.all([
        fetchFolders(targetUrl),
        fetchTags(targetUrl),
      ]);
      setFolders(fList);
      setTags(tList);
    }
  };

  useEffect(() => {
    getStoredApiUrl().then((url) => {
      setApiUrl(url);
      loadData(url);
    });
  }, []);

  const getActiveTab = async (): Promise<chrome.tabs.Tab | null> => {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    return tabs[0] || null;
  };

  // 1. Capture Visible Screen
  const handleCaptureVisible = async () => {
    if (!status.connected) {
      showToast("Cannot connect to Bowerbird", true);
      return;
    }
    setActionLoading("visible");
    try {
      const tab = await getActiveTab();
      if (!tab?.id) throw new Error("No active tab");

      const dataUrl = await chrome.tabs.captureVisibleTab({ format: "png" });
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
        chrome.runtime.sendMessage({ type: "FLASH_BADGE", text: "✓", color: "#10b981" });
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
      await chrome.tabs.sendMessage(tab.id, { type: "START_AREA_SELECTION" });
      window.close(); // Close popup so user can draw selection
    } catch {
      // Content script injection fallback
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["content-scripts/content.js"],
      });
      await chrome.tabs.sendMessage(tab.id, { type: "START_AREA_SELECTION" });
      window.close();
    }
  };

  // 3. Save Bookmark
  const handleSaveBookmark = async () => {
    if (!status.connected) {
      showToast("Cannot connect to Bowerbird", true);
      return;
    }
    setActionLoading("bookmark");
    try {
      const tab = await getActiveTab();
      if (!tab?.url) throw new Error("No active tab URL");

      let screenshotUrl: string | undefined;
      try {
        screenshotUrl = await chrome.tabs.captureVisibleTab({ format: "png" });
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
        chrome.runtime.sendMessage({ type: "FLASH_BADGE", text: "✓", color: "#10b981" });
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
      await chrome.tabs.sendMessage(tab.id, { type: "OPEN_BATCH_COLLECTOR" });
      window.close();
    } catch {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["content-scripts/content.js"],
      });
      await chrome.tabs.sendMessage(tab.id, { type: "OPEN_BATCH_COLLECTOR" });
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
    <div style={{ padding: "16px", display: "flex", flexDirection: "column", gap: "14px" }}>
      {/* Top Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <div
            style={{
              width: "26px",
              height: "26px",
              borderRadius: "7px",
              background: "#6366f1",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 800,
              fontSize: "14px",
              color: "white",
            }}
          >
            B
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: "13px", letterSpacing: "-0.01em" }}>
              Bowerbird Clipper
            </div>
            <div style={{ fontSize: "10px", color: "var(--text-muted)" }}>Desktop Companion</div>
          </div>
        </div>

        <button
          onClick={() => setShowSettings(!showSettings)}
          style={{
            background: showSettings ? "var(--card-hover)" : "transparent",
            color: "var(--text-muted)",
            padding: "5px",
            borderRadius: "6px",
            display: "flex",
          }}
          title="Settings"
        >
          <Settings size={15} />
        </button>
      </div>

      {/* Connection Status Banner */}
      <div
        style={{
          borderRadius: "8px",
          padding: "8px 12px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          background: status.connected ? "rgba(16, 185, 129, 0.1)" : "rgba(239, 68, 68, 0.1)",
          border: `1px solid ${status.connected ? "rgba(16, 185, 129, 0.25)" : "rgba(239, 68, 68, 0.25)"}`,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "8px", overflow: "hidden" }}>
          <div
            style={{
              width: "8px",
              height: "8px",
              borderRadius: "50%",
              background: status.connected ? "#10b981" : "#ef4444",
              flexShrink: 0,
            }}
          />
          <span style={{ fontSize: "11px", fontWeight: 500, textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap" }}>
            {status.connected
              ? `Connected: ${status.libraryName || "Active"}`
              : "Disconnected from Bowerbird"}
          </span>
        </div>

        <button
          onClick={() => loadData(apiUrl)}
          disabled={isChecking}
          style={{
            background: "transparent",
            color: "var(--text-muted)",
            display: "flex",
            alignItems: "center",
            padding: "2px",
          }}
          title="Retry connection"
        >
          <RefreshCw size={12} className={isChecking ? "animate-spin" : ""} />
        </button>
      </div>

      {/* Settings Drawer */}
      {showSettings && (
        <div
          style={{
            background: "var(--card-bg)",
            border: "1px solid var(--border)",
            borderRadius: "8px",
            padding: "12px",
            display: "flex",
            flexDirection: "column",
            gap: "10px",
          }}
        >
          <div style={{ fontSize: "11px", fontWeight: 600, color: "var(--text-muted)" }}>
            Desktop API Endpoint
          </div>
          <div style={{ display: "flex", gap: "6px" }}>
            <input
              type="text"
              value={apiUrl}
              onChange={(e) => setApiUrl(e.target.value)}
              placeholder="http://127.0.0.1:41595"
              style={{
                flex: 1,
                background: "var(--bg)",
                border: "1px solid var(--border)",
                borderRadius: "6px",
                padding: "6px 10px",
                color: "var(--text-main)",
              }}
            />
            <button
              onClick={handleSaveApiUrl}
              disabled={isSavingSettings}
              style={{
                background: "var(--primary)",
                color: "white",
                borderRadius: "6px",
                padding: "6px 12px",
                fontSize: "11px",
                fontWeight: 600,
              }}
            >
              Save
            </button>
          </div>
        </div>
      )}

      {/* Quick Action Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
        <button
          onClick={handleCaptureVisible}
          disabled={actionLoading !== null}
          style={{
            background: "var(--card-bg)",
            border: "1px solid var(--border)",
            borderRadius: "8px",
            padding: "12px 10px",
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-start",
            gap: "6px",
            textAlign: "left",
            transition: "all 0.15s ease",
          }}
        >
          <div style={{ color: "#818cf8" }}>
            <Camera size={18} />
          </div>
          <div>
            <div style={{ fontSize: "12px", fontWeight: 600 }}>Visible Area</div>
            <div style={{ fontSize: "10px", color: "var(--text-muted)" }}>Capture screen</div>
          </div>
        </button>

        <button
          onClick={handleCaptureArea}
          disabled={actionLoading !== null}
          style={{
            background: "var(--card-bg)",
            border: "1px solid var(--border)",
            borderRadius: "8px",
            padding: "12px 10px",
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-start",
            gap: "6px",
            textAlign: "left",
            transition: "all 0.15s ease",
          }}
        >
          <div style={{ color: "#38bdf8" }}>
            <Crop size={18} />
          </div>
          <div>
            <div style={{ fontSize: "12px", fontWeight: 600 }}>Selected Area</div>
            <div style={{ fontSize: "10px", color: "var(--text-muted)" }}>Crop region</div>
          </div>
        </button>

        <button
          onClick={handleSaveBookmark}
          disabled={actionLoading !== null}
          style={{
            background: "var(--card-bg)",
            border: "1px solid var(--border)",
            borderRadius: "8px",
            padding: "12px 10px",
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-start",
            gap: "6px",
            textAlign: "left",
            transition: "all 0.15s ease",
          }}
        >
          <div style={{ color: "#34d399" }}>
            <Bookmark size={18} />
          </div>
          <div>
            <div style={{ fontSize: "12px", fontWeight: 600 }}>Web Bookmark</div>
            <div style={{ fontSize: "10px", color: "var(--text-muted)" }}>Save link card</div>
          </div>
        </button>

        <button
          onClick={handleOpenBatchCollector}
          disabled={actionLoading !== null}
          style={{
            background: "var(--card-bg)",
            border: "1px solid var(--border)",
            borderRadius: "8px",
            padding: "12px 10px",
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-start",
            gap: "6px",
            textAlign: "left",
            transition: "all 0.15s ease",
          }}
        >
          <div style={{ color: "#f472b6" }}>
            <Layers size={18} />
          </div>
          <div>
            <div style={{ fontSize: "12px", fontWeight: 600 }}>Batch Grabber</div>
            <div style={{ fontSize: "10px", color: "var(--text-muted)" }}>All page images</div>
          </div>
        </button>
      </div>

      {/* Target Folder Selector */}
      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "5px", fontSize: "11px", color: "var(--text-muted)", fontWeight: 500 }}>
          <FolderIcon size={12} />
          <span>Save to Folder</span>
        </div>
        <select
          value={selectedFolder}
          onChange={(e) => setSelectedFolder(e.target.value)}
          style={{
            background: "var(--card-bg)",
            border: "1px solid var(--border)",
            borderRadius: "6px",
            padding: "7px 10px",
            color: "var(--text-main)",
            cursor: "pointer",
          }}
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
      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "5px", fontSize: "11px", color: "var(--text-muted)", fontWeight: 500 }}>
          <TagIcon size={12} />
          <span>Tags</span>
        </div>

        {selectedTags.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: "5px" }}>
            {selectedTags.map((t) => (
              <span
                key={t}
                style={{
                  background: "rgba(99, 102, 241, 0.2)",
                  color: "#c7d2fe",
                  border: "1px solid rgba(99, 102, 241, 0.4)",
                  borderRadius: "4px",
                  padding: "2px 6px",
                  fontSize: "11px",
                  display: "flex",
                  alignItems: "center",
                  gap: "4px",
                }}
              >
                {t}
                <X
                  size={10}
                  onClick={() => handleRemoveTag(t)}
                  style={{ cursor: "pointer" }}
                />
              </span>
            ))}
          </div>
        )}

        <div style={{ display: "flex", gap: "6px" }}>
          <input
            type="text"
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAddTag()}
            placeholder="Add tag and press Enter..."
            style={{
              flex: 1,
              background: "var(--card-bg)",
              border: "1px solid var(--border)",
              borderRadius: "6px",
              padding: "6px 10px",
              color: "var(--text-main)",
            }}
          />
          <button
            onClick={handleAddTag}
            style={{
              background: "var(--card-hover)",
              color: "var(--text-main)",
              borderRadius: "6px",
              padding: "0 10px",
              display: "flex",
              alignItems: "center",
            }}
          >
            <Plus size={14} />
          </button>
        </div>
      </div>

      {/* Note / Annotation */}
      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Optional notes or annotation..."
          rows={2}
          style={{
            background: "var(--card-bg)",
            border: "1px solid var(--border)",
            borderRadius: "6px",
            padding: "6px 10px",
            color: "var(--text-main)",
            resize: "none",
          }}
        />
      </div>

      {/* Feedback Toast */}
      {feedback && (
        <div
          style={{
            background: feedback.isError ? "var(--error)" : "var(--success)",
            color: "white",
            padding: "8px 12px",
            borderRadius: "6px",
            fontSize: "11px",
            fontWeight: 600,
            textAlign: "center",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "6px",
          }}
        >
          {feedback.isError ? <AlertCircle size={13} /> : <Check size={13} />}
          <span>{feedback.message}</span>
        </div>
      )}
    </div>
  );
}
