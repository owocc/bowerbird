import * as React from "react";
import { Events } from "@wailsio/runtime";
import { Download, AlertCircle, Sparkles, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@workspace/ui/components/dialog";
import { Button } from "@workspace/ui/components/button";
import { Badge } from "@workspace/ui/components/badge";
import { notifySuccess, notifyError } from "@/lib/notify";
import { loadRemotePlugin } from "@/plugins/preview/remote-loader";
import {
  InstallPluginFromURL,
  GetPendingPluginInstall,
  ClearPendingPluginInstall,
} from "../../bindings/bowerbird/core/service";

export interface PluginInstallRequest {
  manifestUrl: string;
  id: string;
  version?: string;
  name?: string;
}

export function PluginInstallDialog() {
  const [open, setOpen] = React.useState<boolean>(false);
  const [request, setRequest] = React.useState<PluginInstallRequest | null>(null);
  const [installing, setInstalling] = React.useState<boolean>(false);

  React.useEffect(() => {
    // Check if there is a pending install request on mount (e.g. Settings window just launched)
    GetPendingPluginInstall()
      .then((pending) => {
        if (pending && pending.manifestUrl && pending.id) {
          setRequest({
            manifestUrl: pending.manifestUrl,
            id: pending.id,
            version: pending.version || "1.0.0",
            name: pending.name || pending.id,
          });
          setOpen(true);
        }
      })
      .catch(() => {});

    const unsubscribe = Events.On("plugin:install-requested", (event: unknown) => {
      if (!event || typeof event !== "object" || !("data" in event)) return;
      const data = event.data;
      if (!data || typeof data !== "object") return;

      const manifestUrl =
        "manifestUrl" in data && typeof data.manifestUrl === "string"
          ? data.manifestUrl
          : "";
      const id = "id" in data && typeof data.id === "string" ? data.id : "";
      const version =
        "version" in data && typeof data.version === "string"
          ? data.version
          : undefined;
      const name =
        "name" in data && typeof data.name === "string" ? data.name : undefined;

      if (manifestUrl && id) {
        setRequest({ manifestUrl, id, version, name });
        setOpen(true);
      }
    });

    return () => unsubscribe();
  }, []);

  const handleInstall = async () => {
    if (!request) return;
    setInstalling(true);

    try {
      // 1. Download and install files only upon explicit manual confirmation
      let installed = false;
      try {
        const result = await InstallPluginFromURL(request.manifestUrl);
        if (result && result.id) {
          installed = true;
        }
      } catch (rpcErr) {
        console.warn("[PluginInstallDialog] Wails RPC failed, falling back to confirm-install endpoint:", rpcErr);
      }

      if (!installed) {
        const res = await fetch("http://127.0.0.1:41595/api/plugin/confirm-install", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            manifestUrl: request.manifestUrl,
          }),
        });

        if (!res.ok) {
          const text = await res.text();
          throw new Error(text || `Installation failed with HTTP ${res.status}`);
        }
      }
      // 2. Load the newly installed plugin into previewRegistry
      await loadRemotePlugin(request.id);

      await ClearPendingPluginInstall().catch(() => {});
      notifySuccess(
        `Plugin "${request.name || request.id}" installed successfully!`
      );
      setOpen(false);
      setRequest(null);
    } catch (err) {
      console.error("[PluginInstallDialog] Install error:", err);
      notifyError(err);
    } finally {
      setInstalling(false);
    }
  };

  const handleCancel = () => {
    if (installing) return;
    ClearPendingPluginInstall().catch(() => {});
    setOpen(false);
    setRequest(null);
  };

  if (!request) return null;

  return (
    <Dialog open={open} onOpenChange={(val) => !val && handleCancel()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2.5 text-primary">
            <div className="size-9 rounded-xl bg-primary/10 flex items-center justify-center border border-primary/20">
              <Sparkles className="size-5" />
            </div>
            <div>
              <DialogTitle className="text-base font-bold">
                Install Remote Plugin
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                Bowerbird received an installation request from the marketplace.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-3 py-2 text-xs">
          <div className="rounded-xl border border-border/80 bg-muted/30 p-3.5 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-foreground text-sm">
                {request.name || request.id}
              </span>
              {request.version && (
                <Badge variant="secondary" className="font-mono text-[10px]">
                  v{request.version}
                </Badge>
              )}
            </div>

            <div className="space-y-1 font-mono text-[11px] text-muted-foreground">
              <div className="flex items-center justify-between">
                <span>ID:</span>
                <span className="text-foreground">{request.id}</span>
              </div>
              <div className="flex items-start justify-between gap-2 pt-1 border-t border-border/50">
                <span className="shrink-0">Manifest:</span>
                <span className="text-right truncate max-w-[240px] text-muted-foreground select-all">
                  {request.manifestUrl}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-start gap-2 p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-300 text-[11px]">
            <AlertCircle className="size-4 shrink-0 mt-0.5" />
            <span>
              Plugins run with preview privileges inside your Bowerbird workspace.
              Ensure you trust the publisher before installing.
            </span>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="outline"
            size="sm"
            onClick={handleCancel}
            disabled={installing}
          >
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleInstall}
            disabled={installing}
            className="gap-1.5"
          >
            {installing ? (
              <>
                <Loader2 className="size-3.5 animate-spin" />
                <span>Installing...</span>
              </>
            ) : (
              <>
                <Download className="size-3.5" />
                <span>Install Plugin</span>
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
