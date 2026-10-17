import React, { useState } from "react";
import {
  Folder as FolderIcon,
  Inbox,
  AlertCircle,
  Check,
  Loader2,
  X,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@workspace/ui/components/card";
import { Badge } from "@workspace/ui/components/badge";
import { Separator } from "@workspace/ui/components/separator";
import { cn } from "@workspace/ui/lib/utils";
import type { AppRunningStatus, FlatFolder } from "@/lib/api";

export interface DragDropPanelProps {
  status: AppRunningStatus;
  folders: FlatFolder[];
  onDropMedia: (folderId?: string, folderName?: string, dataTransfer?: DataTransfer | null) => Promise<{ success: boolean; error?: string }>;
  onClose: () => void;
}

export function DragDropPanel({
  status,
  folders,
  onDropMedia,
  onClose,
}: DragDropPanelProps) {
  const [activeHoverSlot, setActiveHoverSlot] = useState<string | null>(null);
  const [dropState, setDropState] = useState<{
    slotId: string;
    folderName?: string;
    status: "saving" | "success" | "error";
    error?: string;
  } | null>(null);

  const handleDragOver = (e: React.DragEvent, slotId: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = "copy";
    }
    if (activeHoverSlot !== slotId) {
      setActiveHoverSlot(slotId);
    }
  };

  const handleDragLeave = (e: React.DragEvent, slotId: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (activeHoverSlot === slotId) {
      setActiveHoverSlot(null);
    }
  };

  const handleDrop = async (
    e: React.DragEvent,
    slotId: string,
    folderId?: string,
    folderName?: string
  ) => {
    e.preventDefault();
    e.stopPropagation();
    setActiveHoverSlot(null);

    setDropState({
      slotId,
      folderName,
      status: "saving",
    });

    const result = await onDropMedia(folderId, folderName, e.dataTransfer);
    if (result.success) {
      setDropState({
        slotId,
        folderName,
        status: "success",
      });
      setTimeout(() => {
        onClose();
      }, 1000);
    } else {
      setDropState({
        slotId,
        folderName,
        status: "error",
        error: result.error || "Failed to import",
      });
      setTimeout(() => {
        setDropState(null);
      }, 2000);
    }
  };

  return (
    <Card className="w-[300px] border-border/80 bg-card/95 backdrop-blur-xl shadow-2xl rounded-2xl overflow-hidden select-none animate-in fade-in slide-in-from-right-4 duration-200">
      {/* Header */}
      <CardHeader className="p-3.5 pb-2.5 flex flex-row items-center justify-between space-y-0 border-b border-border/60 bg-muted/20">
        <div className="flex items-center gap-2">
          <div className="size-6 rounded-lg bg-primary flex items-center justify-center font-bold text-xs text-primary-foreground shadow-2xs">
            B
          </div>
          <div>
            <CardTitle className="text-xs font-semibold text-foreground">
              Bowerbird Quick Drop
            </CardTitle>
            <div className="text-[10px] text-muted-foreground leading-tight">
              {status.running ? status.libraryName || "Connected" : "Offline"}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Badge
            variant={status.running ? "success" : "destructive"}
            className="text-[9px] px-1.5 py-0.5"
          >
            {status.running ? "Active" : "Stopped"}
          </Badge>
          <button
            type="button"
            onClick={onClose}
            className="size-5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="size-3" />
          </button>
        </div>
      </CardHeader>

      <CardContent className="p-3 flex flex-col gap-2.5">
        {/* Offline Warning */}
        {!status.running && (
          <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-3.5 text-center flex flex-col items-center gap-1.5">
            <AlertCircle className="size-5 text-destructive" />
            <div className="text-xs font-semibold text-destructive">
              Bowerbird is not running
            </div>
            <div className="text-[11px] text-muted-foreground leading-relaxed">
              Please start the desktop app to drop assets into your library.
            </div>
          </div>
        )}

        {status.running && (
          <>
            {/* Primary Drop Target: Quick Save */}
            <div
              onDragOver={(e) => handleDragOver(e, "root")}
              onDragLeave={(e) => handleDragLeave(e, "root")}
              onDrop={(e) => handleDrop(e, "root", undefined, "Library Root")}
              className={cn(
                "group relative flex items-center justify-between rounded-xl border-2 border-dashed p-3 transition-all cursor-copy",
                dropState?.slotId === "root"
                  ? dropState.status === "saving"
                    ? "border-primary bg-primary/15"
                    : dropState.status === "success"
                    ? "border-emerald-500 bg-emerald-500/15"
                    : "border-destructive bg-destructive/15"
                  : activeHoverSlot === "root"
                  ? "border-primary bg-primary/20 scale-[1.02] shadow-xs"
                  : "border-primary/40 bg-primary/5 hover:border-primary/70 hover:bg-primary/10"
              )}
            >
              <div className="flex items-center gap-2.5 min-w-0 pointer-events-none">
                <div className="rounded-lg p-1.5 bg-primary/10 text-primary">
                  {dropState?.slotId === "root" && dropState.status === "saving" ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : dropState?.slotId === "root" && dropState.status === "success" ? (
                    <Check className="size-4 text-emerald-400" />
                  ) : (
                    <Inbox className="size-4" />
                  )}
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-foreground truncate">
                    {dropState?.slotId === "root"
                      ? dropState.status === "saving"
                        ? "Saving to Library..."
                        : dropState.status === "success"
                        ? "Saved!"
                        : dropState.error || "Failed"
                      : "Quick Save"}
                  </div>
                  <div className="text-[10px] text-muted-foreground truncate">
                    {status.libraryName || "Library Root (Unclassified)"}
                  </div>
                </div>
              </div>

              <Badge variant="outline" className="text-[9px] pointer-events-none">
                Root
              </Badge>
            </div>

            <Separator className="my-0.5" />

            {/* Folder Drop Slots */}
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between px-1">
                <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                  Drop into Folder ({folders.length})
                </span>
              </div>

              <div className="max-h-[220px] overflow-y-auto space-y-1.5 pr-0.5">
                {folders.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-border/60 p-3 text-center text-[11px] text-muted-foreground">
                    No folders created yet
                  </div>
                ) : (
                  folders.map((folder) => {
                    const isHovered = activeHoverSlot === folder.id;
                    const isCurrentDrop = dropState?.slotId === folder.id;

                    return (
                      <div
                        key={folder.id}
                        onDragOver={(e) => handleDragOver(e, folder.id)}
                        onDragLeave={(e) => handleDragLeave(e, folder.id)}
                        onDrop={(e) => handleDrop(e, folder.id, folder.id, folder.name)}
                        className={cn(
                          "group relative flex items-center justify-between rounded-xl border p-2.5 transition-all cursor-copy",
                          isCurrentDrop
                            ? dropState.status === "saving"
                              ? "border-primary bg-primary/15"
                              : dropState.status === "success"
                              ? "border-emerald-500 bg-emerald-500/15"
                              : "border-destructive bg-destructive/15"
                            : isHovered
                            ? "border-primary bg-primary/15 scale-[1.02] shadow-xs"
                            : "border-border/60 bg-muted/30 hover:border-border hover:bg-muted/60"
                        )}
                      >
                        <div className="flex items-center gap-2 min-w-0 pointer-events-none">
                          <div className="text-primary shrink-0">
                            {isCurrentDrop && dropState.status === "saving" ? (
                              <Loader2 className="size-3.5 animate-spin" />
                            ) : isCurrentDrop && dropState.status === "success" ? (
                              <Check className="size-3.5 text-emerald-400" />
                            ) : (
                              <FolderIcon className="size-3.5" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <div className="text-xs font-medium text-foreground truncate">
                              {isCurrentDrop
                                ? dropState.status === "saving"
                                  ? `Saving to ${folder.name}...`
                                  : dropState.status === "success"
                                  ? "Saved!"
                                  : dropState.error || "Failed"
                                : folder.name}
                            </div>
                            {folder.path !== folder.name && (
                              <div className="text-[9px] text-muted-foreground truncate">
                                {folder.path}
                              </div>
                            )}
                          </div>
                        </div>

                        {folder.itemCount > 0 && (
                          <Badge
                            variant="secondary"
                            className="text-[9px] font-mono px-1.5 pointer-events-none"
                          >
                            {folder.itemCount}
                          </Badge>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
