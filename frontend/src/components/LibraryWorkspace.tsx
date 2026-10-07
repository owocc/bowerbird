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
  ImportFromBase64,
  CloseLibrary,
} from "../../bindings/bowerbird/libraryservice";
import type { Item, LibraryInfo } from "../../bindings/bowerbird/models";
import { formatBytes, formatDate, getFileCategory } from "@/lib/formatters";

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
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [selectedItem, setSelectedItem] = useState<Item | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const dragCounter = useRef(0);
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

  // Helper to import a single File object using Promise.withResolvers
  const processAndImportFile = async (file: globalThis.File): Promise<boolean> => {
    const { promise, resolve } = Promise.withResolvers<boolean>();
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const base64 = reader.result as string;
        await ImportFromBase64(file.name, base64);
        resolve(true);
      } catch (err) {
        console.error("导入文件失败:", file.name, err);
        resolve(false);
      }
    };
    reader.onerror = () => resolve(false);
    reader.readAsDataURL(file);
    return promise;
  };

  // Batch import files
  const handleBatchImport = async (fileList: FileList | globalThis.File[]) => {
    const list = Array.from(fileList);
    if (list.length === 0) return;

    setImportStatus(`正在复制并导入 ${list.length} 个文件...`);
    let count = 0;
    for (const file of list) {
      const success = await processAndImportFile(file);
      if (success) count++;
    }
    setImportStatus(`成功导入 ${count} 个文件并完成副本隔离`);
    setTimeout(() => setImportStatus(null), 3000);
    await refreshItems();
  };

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
        await handleBatchImport(filesToImport);
      }
    };

    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [handleBatchImport]);

  // Global Drag and Drop event handlers
  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current += 1;
    if (e.dataTransfer.types.includes("Files")) {
      setIsDraggingOver(true);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current -= 1;
    if (dragCounter.current === 0) {
      setIsDraggingOver(false);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current = 0;
    setIsDraggingOver(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      await handleBatchImport(e.dataTransfer.files);
      return;
    }

    // Browser image drop via URL
    const imageUrl = e.dataTransfer.getData("text/uri-list") || e.dataTransfer.getData("URL");
    if (imageUrl && (imageUrl.startsWith("http://") || imageUrl.startsWith("https://") || imageUrl.startsWith("data:"))) {
      setImportStatus("正在从网络抓取并导入图片...");
      try {
        const res = await fetch(imageUrl);
        const blob = await res.blob();
        const ext = blob.type.split("/")[1] || "png";
        const filename = `web_image_${Date.now()}.${ext}`;
        const reader = new FileReader();
        const { promise, resolve } = Promise.withResolvers<boolean>();
        reader.onload = async () => {
          try {
            await ImportFromBase64(filename, reader.result as string);
            resolve(true);
          } catch {
            resolve(false);
          }
        };
        reader.onerror = () => resolve(false);
        reader.readAsDataURL(blob);
        await promise;
        await refreshItems();
        setTimeout(() => setImportStatus(null), 3500);
      } catch (err) {
        console.error("抓取网络图片失败:", err);
        setImportStatus(`网络图片抓取失败: ${String(err)}`);
        setTimeout(() => setImportStatus(null), 3500);
      }
    }
  };

  // Drag-out to Finder / Explorer using standard native file absolute path
  const handleDragStart = (e: React.DragEvent, item: Item) => {
    const filePath = item.filePath || (item.itemPath ? `${item.itemPath}/${item.filename}` : "");
    const fileUrl = item.fileUrl || `file://${encodeURI(filePath)}`;
    const mime = item.mimeType || "application/octet-stream";

    // 1. Standard OS File URI for macOS Finder, Windows Explorer, desktop apps
    e.dataTransfer.setData("text/uri-list", fileUrl);

    // 2. Absolute physical file path for terminals, editors, drop handlers
    e.dataTransfer.setData("text/plain", filePath);

    // 3. Standard DownloadURL format with native file:// scheme
    e.dataTransfer.setData("DownloadURL", `${mime}:${item.filename}:${fileUrl}`);

    // 4. Application-specific absolute path
    e.dataTransfer.setData("application/x-bowerbird-path", filePath);

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
      className="flex flex-col h-screen w-screen bg-background text-foreground antialiased select-none overflow-hidden wails-no-drag"
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Hidden file input for manual browse selection */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0) {
            handleBatchImport(e.target.files);
            e.target.value = "";
          }
        }}
      />

      {/* Drag-over dropzone overlay */}
      {isDraggingOver && (
        <div className="absolute inset-0 z-50 bg-background/85 backdrop-blur-md flex flex-col items-center justify-center border-4 border-dashed border-primary transition-all pointer-events-none wails-no-drag">
          <div className="size-16 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mb-4 animate-bounce">
            <Upload className="size-8" />
          </div>
          <h3 className="text-xl font-bold tracking-tight">释放文件以复制到 Library</h3>
          <p className="text-sm text-muted-foreground mt-1">
            将自动创建专属目录与 metadata.json，并在 libSQL 中建立索引
          </p>
        </div>
      )}

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
          {importStatus && (
            <span className="text-[11px] text-primary font-medium animate-pulse">
              {importStatus}
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
                  <span className="text-[10px] text-muted-foreground uppercase font-semibold">本地物理文件绝对路径 (已隔离)</span>
                  <div className="p-2.5 rounded-lg bg-muted/40 border border-border/60 font-mono text-[11px] text-foreground break-all select-text">
                    {selectedItem.filePath || `${selectedItem.itemPath}/${selectedItem.filename}`}
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
                      const path = selectedItem.filePath || `${selectedItem.itemPath}/${selectedItem.filename}`;
                      await navigator.clipboard.writeText(path);
                      setCopiedLink(true);
                      setTimeout(() => setCopiedLink(false), 2000);
                    }}
                    className="h-8 gap-1.5 text-xs"
                  >
                    {copiedLink ? <Check className="size-3.5 text-green-500" /> : <Copy className="size-3.5" />}
                    <span>{copiedLink ? "已复制路径" : "复制绝对路径"}</span>
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
          {item.width > 0 ? (
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
