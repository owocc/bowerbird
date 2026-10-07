import { useState, useEffect, useCallback, useRef } from "react";
import {
  Search,
  Filter,
  ArrowUpDown,
  FolderOpen,
  Upload,
  Trash2,
  FileImage,
  FileVideo,
  FileAudio,
  FileText,
  FileArchive,
  File,
  Layers,
  Database,
  X,
  Copy,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  GetItems,
  DeleteItem,
  RevealInFinder,
  CloseLibrary,
  StartDrag,
} from "../../bindings/bowerbird/core/service";
import type { Item, LibraryInfo } from "../../bindings/bowerbird/core/models";
import { formatBytes, formatDate, getFileCategory, escapePathForShell } from "@/lib/formatters";
import { useFileDrop } from "@/hooks/useFileDrop";
import { DropzoneOverlay } from "@/components/DropzoneOverlay";

interface LibraryWorkspaceProps {
  library: LibraryInfo;
  onLibraryClosed: () => void;
}

export function LibraryWorkspace({ library, onLibraryClosed }: LibraryWorkspaceProps) {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortOrder, setSortOrder] = useState<"desc" | "asc">("desc");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [selectedItem, setSelectedItem] = useState<Item | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Load items from libSQL database
  const refreshItems = useCallback(async () => {
    try {
      const data = await GetItems(searchQuery, sortOrder);
      setItems(data || []);
    } catch (err) {
      console.error("加载资产失败:", err);
    } finally {
      setLoading(false);
    }
  }, [searchQuery, sortOrder]);

  useEffect(() => {
    refreshItems();
  }, [refreshItems]);

  // Encapsulated native file drop & network import hook
  const { state: dropState, importFileList, dragHandlers } = useFileDrop({
    onRefresh: refreshItems,
  });

  // Handle global paste (Cmd+V / Ctrl+V)
  useEffect(() => {
    const handlePaste = async (e: ClipboardEvent) => {
      if (!e.clipboardData) return;
      const clipboardItems = e.clipboardData.items;
      const filesToImport: globalThis.File[] = [];

      for (let i = 0; i < clipboardItems.length; i++) {
        const item = clipboardItems[i];
        if (item.kind === "file") {
          const file = item.getAsFile();
          if (file) {
            filesToImport.push(file);
          }
        }
      }

      if (filesToImport.length > 0) {
        e.preventDefault();
        await importFileList(filesToImport);
      }
    };

    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [importFileList]);
  // Drag-out using native file session and standard OS file formats
  const handleDragStart = (e: React.DragEvent, item: Item) => {
    // 1. Trigger native OS file drag (points directly to physical file on disk)
    StartDrag(item.id).catch(() => {
      // Native drag initiated or fallback to HTML5 dataTransfer
    });

    const rawPath = item.filePath || (item.itemPath ? `${item.itemPath}/${item.filename}` : "");
    const shellPath = item.shellPath || escapePathForShell(rawPath);
    let fileUrl = item.fileUrl;
    if (!fileUrl && rawPath) {
      fileUrl = encodeURI(`file://${rawPath.startsWith("/") ? "" : "/"}${rawPath}`);
    } else if (fileUrl && fileUrl.includes(" ")) {
      fileUrl = encodeURI(fileUrl);
    }
    const mime = item.mimeType || "application/octet-stream";

    // 2. Standard OS File URI for Finder and graphical drop targets
    e.dataTransfer.setData("text/uri-list", fileUrl);

    // 3. Shell-escaped path for Terminal / iTerm (all spaces formatted with \ )
    e.dataTransfer.setData("text/plain", shellPath);

    // 4. Standard DownloadURL format with native file:// scheme
    e.dataTransfer.setData("DownloadURL", `${mime}:${item.filename}:${fileUrl}`);

    // 5. Raw unescaped path
    e.dataTransfer.setData("application/x-bowerbird-path", rawPath);

    e.dataTransfer.effectAllowed = "copy";
  };

  // Delete item
  const handleDeleteItem = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    try {
      await DeleteItem(id);
      if (selectedItem?.id === id) {
        setSelectedItem(null);
      }
      await refreshItems();
    } catch (err) {
      console.error("删除资产失败:", err);
    }
  };

  // Reveal in Finder
  const handleReveal = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    try {
      await RevealInFinder(id);
    } catch (err) {
      console.error("定位文件失败:", err);
    }
  };

  // Filter items by category
  const filteredItems = items.filter((item) => {
    if (categoryFilter === "all") return true;
    return getFileCategory(item.extension) === categoryFilter;
  });

  return (
    <div
      data-file-drop-target="true"
      className="flex flex-col h-screen w-screen bg-background text-foreground antialiased select-none overflow-hidden wails-no-drag"
      {...dragHandlers}
    >
      {/* Hidden file input for manual browse selection */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0) {
            importFileList(e.target.files);
            e.target.value = "";
          }
        }}
      />

      {/* Encapsulated Drag & Drop State Overlay (active hover + importing progress + feedback) */}
      <DropzoneOverlay state={dropState} />

      {/* Top Application Bar */}
      <header
        className="h-14 border-b border-border bg-sidebar/40 px-5 flex items-center justify-between gap-4 shrink-0 wails-drag"
      >
        {/* Left: Library Identity */}
        <div className="flex items-center gap-3 wails-no-drag">
          <div className="size-8 rounded-xl bg-primary flex items-center justify-center text-primary-foreground shadow-xs">
            <Layers className="size-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-sm tracking-tight">{library.name}</span>
              <Badge variant="outline" className="text-[10px] font-mono px-1.5 py-0 h-4">
                {items.length} 项
              </Badge>
            </div>
            <p className="text-[10px] text-muted-foreground font-mono truncate max-w-xs" title={library.path}>
              {library.path}
            </p>
          </div>
        </div>

        {/* Center: Search Bar */}
        <div className="flex-1 max-w-md mx-2 wails-no-drag">
          <div className="relative">
            <Search className="size-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="搜索名称、格式、标签..."
              className="pl-9 h-8 text-xs bg-muted/40 border-border/80 rounded-xl"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-2 wails-no-drag">
          <Button
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            className="h-8 gap-1.5 text-xs shadow-xs"
          >
            <Upload className="size-3.5" />
            <span>导入文件</span>
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              await CloseLibrary();
              onLibraryClosed();
            }}
            className="h-8 gap-1.5 text-xs"
          >
            <FolderOpen className="size-3.5" />
            <span>切换资源库</span>
          </Button>
        </div>
      </header>

      {/* Sub-bar: Filter Tags and Status */}
      <div className="h-10 border-b border-border/60 bg-muted/10 px-5 flex items-center justify-between text-xs shrink-0 wails-no-drag">
        <div className="flex items-center gap-1.5">
          <Filter className="size-3.5 text-muted-foreground mr-1" />
          {[
            { id: "all", label: "全部" },
            { id: "image", label: "图片" },
            { id: "video", label: "视频" },
            { id: "document", label: "文档" },
            { id: "archive", label: "压缩包" },
            { id: "other", label: "其他" },
          ].map((cat) => (
            <button
              key={cat.id}
              onClick={() => setCategoryFilter(cat.id)}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors ${
                categoryFilter === cat.id
                  ? "bg-secondary text-secondary-foreground shadow-2xs font-semibold"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3">
          {dropState.message && (
            <span className="text-[11px] text-primary font-medium animate-pulse font-mono truncate max-w-xs" title={dropState.message}>
              {dropState.message}
            </span>
          )}
          <button
            onClick={() => setSortOrder(sortOrder === "desc" ? "asc" : "desc")}
            className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground px-2 py-1 rounded-md"
          >
            <ArrowUpDown className="size-3" />
            <span>{sortOrder === "desc" ? "最新导入" : "最早导入"}</span>
          </button>
        </div>
      </div>

      {/* Main Grid View */}
      <main className="flex-1 overflow-y-auto p-5 wails-no-drag">
        {loading ? (
          <div className="h-full flex items-center justify-center text-xs text-muted-foreground">
            正在载入资产索引...
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-8 border-2 border-dashed border-border/50 rounded-2xl max-w-2xl mx-auto my-8">
            <div className="size-14 rounded-2xl bg-muted/60 flex items-center justify-center text-muted-foreground mb-4">
              <Upload className="size-7" />
            </div>
            <h3 className="text-base font-semibold tracking-tight">暂无资产</h3>
            <p className="text-xs text-muted-foreground mt-1.5 max-w-sm leading-relaxed">
              将任意本地文件、文件夹或浏览器图片直接拖拽至此处，或者使用快捷键 <kbd className="px-1.5 py-0.5 rounded bg-muted border font-mono">Cmd+V</kbd> 粘贴剪贴板图片。
            </p>
            <Button
              size="sm"
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              className="mt-4 text-xs h-8 gap-1.5"
            >
              <Upload className="size-3.5" />
              <span>选择文件导入</span>
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7 gap-4">
            {filteredItems.map((item) => (
              <AssetCard
                key={item.id}
                item={item}
                onClick={() => setSelectedItem(item)}
                onDragStart={(e) => handleDragStart(e, item)}
                onDelete={(e) => handleDeleteItem(e, item.id)}
                onReveal={(e) => handleReveal(e, item.id)}
              />
            ))}
          </div>
        )}
      </main>

      {/* Footer bar with system stats */}
      <footer className="h-8 border-t border-border/60 bg-muted/20 px-5 flex items-center justify-between text-[11px] text-muted-foreground shrink-0 font-mono wails-no-drag">
        <div className="flex items-center gap-2">
          <Database className="size-3 text-primary" />
          <span>libSQL 索引库正常</span>
          <span>·</span>
          <span>已展示 {filteredItems.length} 项</span>
        </div>
        <div className="flex items-center gap-2">
          <span>支持将卡片直接拖拽至访达 (Finder) 导出</span>
        </div>
      </footer>

      {/* Item Detail Dialog */}
      {selectedItem && (
        <Dialog open={!!selectedItem} onOpenChange={(open) => !open && setSelectedItem(null)}>
          <DialogContent className="max-w-2xl text-xs">
            <DialogHeader>
              <DialogTitle className="text-base truncate pr-6">{selectedItem.name}</DialogTitle>
              <DialogDescription className="text-xs font-mono">
                {selectedItem.filename}
              </DialogDescription>
            </DialogHeader>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-2">
              {/* Preview Box */}
              <div className="aspect-square rounded-xl border border-border bg-muted/30 overflow-hidden flex items-center justify-center relative">
                {selectedItem.hasThumbnail || getFileCategory(selectedItem.extension) === "image" ? (
                  <img
                    src={selectedItem.originalUrl}
                    alt={selectedItem.name}
                    className="w-full h-full object-contain"
                  />
                ) : (
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <FileIcon category={getFileCategory(selectedItem.extension)} className="size-16" />
                    <span className="font-mono text-sm uppercase font-bold">{selectedItem.extension}</span>
                  </div>
                )}
              </div>

              {/* Metadata Details */}
              <div className="space-y-3 font-sans">
                <div className="space-y-1">
                  <span className="text-[10px] text-muted-foreground uppercase font-semibold">基本信息</span>
                  <div className="p-3 rounded-xl bg-muted/40 border border-border/60 space-y-2">
                    <div className="flex justify-between py-0.5 border-b border-border/40">
                      <span className="text-muted-foreground">文件大小</span>
                      <span className="font-mono">{formatBytes(selectedItem.size)}</span>
                    </div>
                    {selectedItem.hex && (
                      <div className="flex justify-between items-center py-0.5 border-b border-border/40">
                        <span className="text-muted-foreground">内容指纹 (HEX)</span>
                        <span className="font-mono text-[10px] truncate max-w-[200px]" title={selectedItem.hex}>
                          {selectedItem.hex}
                        </span>
                      </div>
                    )}
                    {selectedItem.width > 0 && (
                      <div className="flex justify-between py-0.5 border-b border-border/40">
                        <span className="text-muted-foreground">图片尺寸</span>
                        <span className="font-mono">{selectedItem.width} × {selectedItem.height} px</span>
                      </div>
                    )}
                    <div className="flex justify-between py-0.5 border-b border-border/40">
                      <span className="text-muted-foreground">MIME 类型</span>
                      <span className="font-mono">{selectedItem.mimeType}</span>
                    </div>
                    <div className="flex justify-between py-0.5 border-b border-border/40">
                      <span className="text-muted-foreground">创建时间</span>
                      <span className="font-mono">{formatDate(selectedItem.createdAt)}</span>
                    </div>
                    <div className="flex justify-between py-0.5">
                      <span className="text-muted-foreground">导入时间</span>
                      <span className="font-mono">{formatDate(selectedItem.importedAt)}</span>
                    </div>
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-muted-foreground uppercase font-semibold">本地物理文件路径</span>
                    <span className="text-[10px] text-muted-foreground">支持终端直接执行 (\转义)</span>
                  </div>
                  <div className="p-2.5 rounded-lg bg-muted/40 border border-border/60 font-mono text-[11px] text-foreground break-all select-text">
                    {selectedItem.shellPath || escapePathForShell(selectedItem.filePath || `${selectedItem.itemPath}/${selectedItem.filename}`)}
                  </div>
                </div>

                <div className="pt-2 flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => RevealInFinder(selectedItem.id)}
                    className="h-8 gap-1.5 text-xs"
                  >
                    <FolderOpen className="size-3.5" />
                    <span>在访达中定位</span>
                  </Button>

                  <Button
                    size="sm"
                    variant="outline"
                    onClick={async () => {
                      const path = selectedItem.shellPath || escapePathForShell(selectedItem.filePath || `${selectedItem.itemPath}/${selectedItem.filename}`);
                      await navigator.clipboard.writeText(path);
                      setCopiedLink(true);
                      setTimeout(() => setCopiedLink(false), 2000);
                    }}
                    className="h-8 gap-1.5 text-xs"
                  >
                    {copiedLink ? <Check className="size-3.5 text-green-500" /> : <Copy className="size-3.5" />}
                    <span>{copiedLink ? "已复制终端路径" : "复制终端路径 (\\空格)"}</span>
                  </Button>

                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={async () => {
                      await DeleteItem(selectedItem.id);
                      setSelectedItem(null);
                      await refreshItems();
                    }}
                    className="h-8 gap-1.5 text-xs"
                  >
                    <Trash2 className="size-3.5" />
                    <span>删除资产</span>
                  </Button>
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

// Single Asset Card
interface AssetCardProps {
  item: Item;
  onClick: () => void;
  onDragStart: (e: React.DragEvent) => void;
  onDelete: (e: React.MouseEvent) => void;
  onReveal: (e: React.MouseEvent) => void;
}

function AssetCard({ item, onClick, onDragStart, onDelete, onReveal }: AssetCardProps) {
  const category = getFileCategory(item.extension);
  const isImage = category === "image";

  return (
    <Card
      draggable={true}
      onDragStart={onDragStart}
      onClick={onClick}
      className="group relative flex flex-col overflow-hidden border-border bg-card/60 hover:bg-card hover:border-primary/50 transition-all cursor-pointer shadow-2xs hover:shadow-md select-none draggable-asset-card wails-no-drag"
    >
      {/* Thumbnail or Fallback Icon */}
      <div className="aspect-square w-full bg-muted/40 overflow-hidden flex items-center justify-center relative">
        {item.hasThumbnail ? (
          <img
            src={item.thumbnailUrl}
            alt={item.name}
            loading="lazy"
            draggable={false}
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105 pointer-events-none"
          />
        ) : isImage ? (
          <img
            src={item.originalUrl}
            alt={item.name}
            loading="lazy"
            draggable={false}
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105 pointer-events-none"
          />
        ) : (
          <div className="flex flex-col items-center gap-1.5 text-muted-foreground p-3">
            <FileIcon category={category} className="size-10" />
            <span className="font-mono text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-muted">
              {item.extension}
            </span>
          </div>
        )}

        {/* Quick action bar on hover */}
        <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity bg-background/80 backdrop-blur-md rounded-lg p-1 shadow-sm">
          <button
            onClick={onReveal}
            title="在访达中显示"
            className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
          >
            <FolderOpen className="size-3.5" />
          </button>
          <button
            onClick={onDelete}
            title="删除"
            className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="size-3.5" />
          </button>
        </div>

        {/* Drag out hint badge */}
        <div className="absolute bottom-2 left-2 opacity-0 group-hover:opacity-100 transition-opacity">
          <Badge variant="secondary" className="text-[9px] px-1.5 py-0 h-4 bg-background/80 backdrop-blur-md">
            拖拽到访达
          </Badge>
        </div>
      </div>

      {/* Card Info Footer */}
      <div className="p-2.5 flex flex-col gap-1">
        <p className="text-xs font-medium truncate leading-tight" title={item.filename}>
          {item.name}
        </p>
        <div className="flex items-center justify-between text-[10px] text-muted-foreground font-mono">
          <span>{formatBytes(item.size)}</span>
          {item.hex ? (
            <span className="text-[9px] uppercase tracking-wider text-muted-foreground/80 font-mono" title={`SHA256: ${item.hex}`}>
              {item.hex.slice(0, 8)}
            </span>
          ) : item.width > 0 ? (
            <span>{item.width}×{item.height}</span>
          ) : (
            <span className="uppercase">{item.extension}</span>
          )}
        </div>
      </div>
    </Card>
  );
}

// Icon selector based on file category
function FileIcon({ category, className }: { category: string; className?: string }) {
  switch (category) {
    case "image":
      return <FileImage className={className} />;
    case "video":
      return <FileVideo className={className} />;
    case "audio":
      return <FileAudio className={className} />;
    case "document":
      return <FileText className={className} />;
    case "archive":
      return <FileArchive className={className} />;
    default:
      return <File className={className} />;
  }
}
