import { useState } from "react";
import { FolderPlus, FolderOpen, Folder, Sparkles, AlertCircle, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import {
  CreateLibrary,
  OpenLibrary,
  SelectDirectory,
  SelectLibraryDialog,
} from "../../bindings/bowerbird/core/service";
import type { LibraryInfo } from "../../bindings/bowerbird/core/models";

interface LibrarySetupProps {
  onLibraryOpened: (lib: LibraryInfo) => void;
}

export function LibrarySetup({ onLibraryOpened }: LibrarySetupProps) {
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
      setError(`选择目录失败: ${String(err)}`);
    }
  };

  // Create new .library directory
  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!parentDir) {
      setError("请先选择 Library 的存储目录");
      return;
    }
    if (!libName.trim()) {
      setError("请输入 Library 名称");
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
      setError(`创建 Library 失败: ${String(err)}`);
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
      setError(`打开 Library 失败: ${String(err)}`);
    } finally {
      setLoading(false);
    }
  };

  const previewPath = parentDir
    ? `${parentDir}/${libName.trim() || "MyAssets"}${libName.endsWith(".library") ? "" : ".library"}`
    : "";

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 select-none wails-no-drag">
      <div className="w-full max-w-xl space-y-6">
        {/* Brand header */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium">
            <Sparkles className="size-3.5" />
            <span>本地隔离资产库 · libSQL 索引存储</span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight">配置你的 Library 资源库</h1>
          <p className="text-sm text-muted-foreground">
            首次使用请先新建或打开已有资源库。所有导入文件将按独立目录副本存储，实现与原目录完全隔离。
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
              <span>新建资源库 (Create New Library)</span>
            </CardTitle>
            <CardDescription className="text-xs">
              在指定本地目录下创建专属的 <code className="font-mono text-foreground font-semibold">.library</code> 容器文件夹。
            </CardDescription>
          </CardHeader>
          <form onSubmit={handleCreate}>
            <CardContent className="space-y-4 text-xs">
              <div className="space-y-1.5">
                <label className="font-medium text-foreground">资源库名称 (Library Name)</label>
                <div className="flex items-center gap-2">
                  <Input
                    value={libName}
                    onChange={(e) => setLibName(e.target.value)}
                    placeholder="如: MyAssets"
                    className="text-xs h-9"
                  />
                  <span className="text-muted-foreground font-mono text-xs shrink-0">.library</span>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="font-medium text-foreground">存储路径 (Storage Location)</label>
                <div className="flex gap-2">
                  <Input
                    readOnly
                    value={parentDir || "尚未选择存储目录..."}
                    placeholder="请点击右侧按钮选择目录"
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
                    <span>选择位置</span>
                  </Button>
                </div>
              </div>

              {previewPath && (
                <div className="p-2.5 rounded-lg bg-muted/50 border border-border/60 text-[11px] text-muted-foreground space-y-0.5">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/80">将在本地创建:</span>
                  <p className="font-mono text-foreground break-all">{previewPath}</p>
                </div>
              )}
            </CardContent>
            <CardFooter className="pt-2 flex justify-end">
              <Button type="submit" disabled={loading || !parentDir} className="gap-2 text-xs h-9">
                <span>{loading ? "正在初始化..." : "创建并开启资源库"}</span>
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
            或
          </span>
        </div>

        <Card className="border-dashed border-border bg-muted/20">
          <CardContent className="py-4 flex items-center justify-between gap-4">
            <div className="space-y-0.5 text-xs">
              <p className="font-medium">已有现成资源库？</p>
              <p className="text-[11px] text-muted-foreground">直接加载本地已有的 .library 容器及现有索引数据。</p>
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
              <span>打开已有资源库</span>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
