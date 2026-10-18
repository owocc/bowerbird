import * as React from "react";
import { Download, Trash2, Sparkles, Eye, ShieldCheck, Loader2 } from "lucide-react";
import { cn } from "@workspace/ui/lib/utils";
import { Badge } from "@workspace/ui/components/badge";
import { Button } from "@workspace/ui/components/button";
import { Switch } from "@workspace/ui/components/switch";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@workspace/ui/components/card";

export interface FormatBadgesProps extends React.ComponentProps<"div"> {
  extensions?: string[];
  max?: number;
  badgeClassName?: string;
}

export function FormatBadges({
  extensions = [],
  max = 5,
  className,
  badgeClassName,
  ...props
}: FormatBadgesProps) {
  if (!extensions || extensions.length === 0) return null;

  const visible = extensions.slice(0, max);
  const remaining = extensions.length - max;

  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)} {...props}>
      {visible.map((ext) => (
        <Badge
          key={ext}
          variant="outline"
          className={cn(
            "text-[10px] font-mono px-1.5 py-0 h-4.5 tracking-wider uppercase border-border/80 bg-muted/40 text-muted-foreground",
            badgeClassName
          )}
        >
          {ext.replace(/^\./, "")}
        </Badge>
      ))}
      {remaining > 0 && (
        <Badge
          variant="secondary"
          className={cn("text-[10px] px-1.5 py-0 h-4.5 text-muted-foreground", badgeClassName)}
        >
          +{remaining}
        </Badge>
      )}
    </div>
  );
}

export interface PluginCardItem {
  id: string;
  name: string;
  version?: string;
  description?: string;
  author?: string;
  kind?: "preview" | "metadata";
  priority?: number;
  extensions?: string[];
  mimePrefixes?: string[];
  supportsZoom?: boolean;
  builtin?: boolean;
  installed?: boolean;
  enabled?: boolean;
  canDisable?: boolean;
  icon?: string | React.ReactNode;
  installUrl?: string;
}

export interface PluginCardProps extends Omit<React.ComponentProps<"div">, "onClick"> {
  plugin: PluginCardItem;
  onInstall?: (plugin: PluginCardItem) => void;
  onUninstall?: (plugin: PluginCardItem) => void;
  onToggleEnable?: (plugin: PluginCardItem, enabled: boolean) => void;
  onClick?: (plugin: PluginCardItem) => void;
  isInstalling?: boolean;
  isUninstalling?: boolean;
  actionSlot?: React.ReactNode;
  footerSlot?: React.ReactNode;
}

export function PluginCard({
  plugin,
  onInstall,
  onUninstall,
  onToggleEnable,
  onClick,
  isInstalling = false,
  isUninstalling = false,
  actionSlot,
  footerSlot,
  className,
  ...props
}: PluginCardProps) {
  const isBuiltin = Boolean(plugin.builtin);
  const isInstalled = Boolean(plugin.installed);
  const isEnabled = plugin.enabled ?? true;
  const canDisable = plugin.canDisable ?? !isBuiltin;
  const isMetadata = plugin.kind === "metadata";

  const renderIcon = () => {
    if (plugin.icon) {
      if (typeof plugin.icon === "string") {
        return <img src={plugin.icon} alt="" className="size-6 object-contain" />;
      }
      return plugin.icon;
    }
    if (isMetadata) {
      return <Sparkles className="size-5 text-amber-500/90" />;
    }
    return <Eye className="size-5 text-indigo-500/90" />;
  };

  return (
    <Card
      className={cn(
        "group relative flex flex-col justify-between transition-all duration-200 border-border/80 bg-card/60 backdrop-blur-xs hover:border-border hover:shadow-xs",
        onClick && "cursor-pointer",
        className
      )}
      onClick={() => onClick?.(plugin)}
      {...props}
    >
      <CardHeader className="p-4 pb-2">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="size-9 rounded-xl flex items-center justify-center shrink-0 border border-border/60 bg-muted/40 shadow-2xs">
              {renderIcon()}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <CardTitle className="text-sm font-semibold tracking-tight truncate">
                  {plugin.name}
                </CardTitle>
                {plugin.version && (
                  <span className="text-[11px] font-mono text-muted-foreground/80">
                    v{plugin.version}
                  </span>
                )}
              </div>
              {plugin.author && (
                <p className="text-[11px] text-muted-foreground truncate">
                  by {plugin.author}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {isBuiltin && (
              <Badge variant="secondary" className="text-[10px] h-5 gap-1 font-normal bg-muted text-muted-foreground">
                <ShieldCheck className="size-3 text-muted-foreground" />
                Built-in
              </Badge>
            )}
            <Badge
              variant={isMetadata ? "indigo" : "secondary"}
              className="text-[10px] h-5 font-normal"
            >
              {isMetadata ? "Metadata" : "Preview"}
            </Badge>
          </div>
        </div>

        {plugin.description && (
          <CardDescription className="text-xs text-muted-foreground mt-2 line-clamp-2 leading-relaxed">
            {plugin.description}
          </CardDescription>
        )}
      </CardHeader>

      <CardContent className="px-4 py-2 flex-1 flex flex-col justify-end gap-3">
        {plugin.extensions && plugin.extensions.length > 0 && (
          <div className="space-y-1">
            <span className="text-[10px] font-medium text-muted-foreground/70 uppercase tracking-wider block">
              Formats
            </span>
            <FormatBadges extensions={plugin.extensions} max={6} />
          </div>
        )}
      </CardContent>

      <CardFooter className="p-4 pt-2 border-t border-border/40 flex items-center justify-between gap-2">
        {footerSlot ? (
          footerSlot
        ) : (
          <>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              {isInstalled && canDisable ? (
                <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                  <Switch
                    checked={isEnabled}
                    onCheckedChange={(checked) => onToggleEnable?.(plugin, checked)}
                    size="sm"
                  />
                  <span className="text-xs">{isEnabled ? "Enabled" : "Disabled"}</span>
                </div>
              ) : isInstalled && isBuiltin ? (
                <span className="text-xs text-muted-foreground/70">Always active</span>
              ) : null}
            </div>

            <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
              {actionSlot}

              {isInstalled ? (
                !isBuiltin && onUninstall && (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    disabled={isUninstalling}
                    onClick={() => onUninstall(plugin)}
                    className="text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                    title="Uninstall Plugin"
                  >
                    {isUninstalling ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="size-3.5" />
                    )}
                  </Button>
                )
              ) : (
                onInstall ? (
                  <Button
                    variant="accent"
                    size="xs"
                    disabled={isInstalling}
                    onClick={() => onInstall(plugin)}
                    className="gap-1 font-medium"
                  >
                    {isInstalling ? (
                      <Loader2 className="size-3 animate-spin" />
                    ) : (
                      <Download className="size-3" />
                    )}
                    Install
                  </Button>
                ) : plugin.installUrl ? (
                  <a
                    href={plugin.installUrl}
                    className="inline-flex shrink-0 items-center justify-center rounded-2xl border border-transparent bg-clip-padding font-medium whitespace-nowrap transition-all outline-none select-none bg-indigo-600 text-white hover:bg-indigo-500 shadow-xs h-6 gap-1 px-2.5 text-xs [&_svg:not([class*='size-'])]:size-3"
                  >
                    <Download className="size-3" />
                    Install
                  </a>
                ) : null
              )}
            </div>
          </>
        )}
      </CardFooter>
    </Card>
  );
}
