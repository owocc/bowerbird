import React, { useState } from "react";
import {
  Download,
  X,
  Check,
  Filter,
  Folder as FolderIcon,
  CheckSquare,
  Square,
  AlertCircle,
  Loader2,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@workspace/ui/components/card";
import { Button } from "@workspace/ui/components/button";
import { Badge } from "@workspace/ui/components/badge";
import { Separator } from "@workspace/ui/components/separator";
import { cn } from "@workspace/ui/lib/utils";
import type { Folder, FlatFolder } from "@/lib/api";

export interface ExtractedImageItem {
  url: string;
  width: number;
  height: number;
  ext: string;
}

export interface BatchCollectorModalProps {
  images: ExtractedImageItem[];
  folders: FlatFolder[];
  onImport: (selectedUrls: string[], folderId?: string) => Promise<{ success: boolean; count?: number; error?: string }>;
  onClose: () => void;
}

export function BatchCollectorModal({
  images,
  folders,
  onImport,
  onClose,
}: BatchCollectorModalProps) {
  const [selectedUrls, setSelectedUrls] = useState<Set<string>>(
    new Set(images.map((it) => it.url))
  );
  const [minWidth, setMinWidth] = useState<number>(300);
  const [selectedFolder, setSelectedFolder] = useState<string>("");
  const [isImporting, setIsImporting] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<{ message: string; isError?: boolean } | null>(null);

  const filteredImages = images.filter((img) => img.width >= minWidth);

  const toggleSelectAll = () => {
    if (selectedUrls.size === filteredImages.length) {
      setSelectedUrls(new Set());
    } else {
      setSelectedUrls(new Set(filteredImages.map((it) => it.url)));
    }
  };

  const toggleImage = (url: string) => {
    const next = new Set(selectedUrls);
    if (next.has(url)) {
      next.delete(url);
    } else {
      next.add(url);
    }
    setSelectedUrls(next);
  };

  const handleStartImport = async () => {
    if (selectedUrls.size === 0) {
      setFeedback({ message: "Please select at least one image", isError: true });
      setTimeout(() => setFeedback(null), 2500);
      return;
    }

    setIsImporting(true);
    const result = await onImport(Array.from(selectedUrls), selectedFolder || undefined);
    setIsImporting(false);

    if (result.success) {
      setFeedback({ message: `✓ Imported ${result.count || selectedUrls.size} images to Bowerbird` });
      setTimeout(() => {
        onClose();
      }, 1200);
    } else {
      setFeedback({ message: result.error || "Failed to import", isError: true });
      setTimeout(() => setFeedback(null), 3000);
    }
  };

  return (
    <div className="fixed inset-0 z-[2147483646] flex flex-col bg-slate-950/85 backdrop-blur-md text-foreground font-sans select-none animate-in fade-in duration-200">
      {/* Top Header */}
      <div className="h-14 px-6 border-b border-border/70 bg-card/90 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="size-7 rounded-lg bg-primary flex items-center justify-center font-bold text-sm text-primary-foreground shadow-2xs">
            B
          </div>
          <div>
            <div className="font-semibold text-sm tracking-tight text-foreground flex items-center gap-2">
              <span>Bowerbird Batch Collector</span>
              <Badge variant="secondary" className="font-mono text-[10px]">
                {images.length} found
              </Badge>
            </div>
            <div className="text-[11px] text-muted-foreground">
              Extract and organize images from current webpage
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground h-8 gap-1.5"
          >
            <X className="size-4" />
            <span>Close</span>
          </Button>
        </div>
      </div>

      {/* Filter & Action Controls Bar */}
      <div className="px-6 py-2.5 border-b border-border/60 bg-muted/20 flex items-center justify-between gap-4 shrink-0">
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={toggleSelectAll}
            className="h-8 gap-1.5 text-xs"
          >
            {selectedUrls.size === filteredImages.length && filteredImages.length > 0 ? (
              <CheckSquare className="size-3.5 text-primary" />
            ) : (
              <Square className="size-3.5 text-muted-foreground" />
            )}
            <span>
              Select All ({selectedUrls.size}/{filteredImages.length})
            </span>
          </Button>

          <Separator orientation="vertical" className="h-5" />

          {/* Size Filter */}
          <div className="flex items-center gap-2 text-xs">
            <span className="text-muted-foreground">Min Width:</span>
            <select
              value={minWidth}
              onChange={(e) => setMinWidth(Number(e.target.value))}
              className="h-8 rounded-xl border border-input/60 bg-card px-2.5 text-xs text-foreground outline-none cursor-pointer focus-visible:ring-2 focus-visible:ring-ring/30"
            >
              <option value={0}>All Sizes</option>
              <option value={150}>&gt; 150 px</option>
              <option value={300}>&gt; 300 px</option>
              <option value={600}>&gt; 600 px</option>
              <option value={1000}>&gt; 1000 px</option>
            </select>
          </div>

          {/* Target Folder */}
          <div className="flex items-center gap-2 text-xs">
            <span className="text-muted-foreground">Folder:</span>
            <select
              value={selectedFolder}
              onChange={(e) => setSelectedFolder(e.target.value)}
              className="h-8 rounded-xl border border-input/60 bg-card px-2.5 text-xs text-foreground outline-none cursor-pointer max-w-[180px] truncate focus-visible:ring-2 focus-visible:ring-ring/30"
            >
              <option value="">(Uncategorized)</option>
              {folders.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Import Action Button */}
        <div className="flex items-center gap-3">
          {feedback && (
            <div
              className={cn(
                "text-xs font-medium flex items-center gap-1.5",
                feedback.isError ? "text-destructive" : "text-emerald-400"
              )}
            >
              {feedback.isError ? <AlertCircle className="size-3.5" /> : <Check className="size-3.5" />}
              <span>{feedback.message}</span>
            </div>
          )}

          <Button
            variant="default"
            size="sm"
            onClick={handleStartImport}
            disabled={isImporting || selectedUrls.size === 0}
            className="h-8 px-4 gap-1.5 shadow-sm"
          >
            {isImporting ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Download className="size-3.5" />
            )}
            <span>Import Selected ({selectedUrls.size})</span>
          </Button>
        </div>
      </div>

      {/* Gallery Grid */}
      <div className="flex-1 overflow-y-auto p-6 grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-4 auto-rows-max">
        {filteredImages.map((img) => {
          const isSelected = selectedUrls.has(img.url);

          return (
            <div
              key={img.url}
              onClick={() => toggleImage(img.url)}
              className={cn(
                "group relative aspect-square rounded-2xl border-2 overflow-hidden bg-slate-900 flex flex-col cursor-pointer transition-all shadow-xs",
                isSelected
                  ? "border-primary ring-2 ring-primary/20 scale-[1.01]"
                  : "border-border/60 hover:border-border hover:bg-slate-800/80"
              )}
            >
              <div className="flex-1 relative flex items-center justify-center overflow-hidden bg-black/40">
                <img
                  src={img.url}
                  alt=""
                  loading="lazy"
                  className="w-full h-full object-cover transition-transform group-hover:scale-105 duration-200"
                  onError={(e) => {
                    (e.target as HTMLElement).style.display = "none";
                  }}
                />

                {/* Selection Checkbox Pill */}
                <div className="absolute top-2.5 left-2.5 flex items-center">
                  <div
                    className={cn(
                      "size-5 rounded-md flex items-center justify-center border transition-colors shadow-sm",
                      isSelected
                        ? "bg-primary border-primary text-primary-foreground"
                        : "bg-black/60 border-white/30 text-transparent"
                    )}
                  >
                    <Check className="size-3 stroke-[3]" />
                  </div>
                </div>

                {/* Dimension & Format Badges */}
                <div className="absolute bottom-2.5 right-2.5 flex items-center gap-1.5">
                  <Badge
                    variant="secondary"
                    className="bg-black/75 border-white/10 text-[10px] font-mono px-1.5 py-0.5"
                  >
                    {img.width}×{img.height}
                  </Badge>
                  {img.ext && (
                    <Badge
                      variant="outline"
                      className="bg-black/75 border-white/10 text-[9px] uppercase font-mono px-1 py-0.5"
                    >
                      {img.ext}
                    </Badge>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
