import * as React from "react";
import { Check, Download, ShieldCheck } from "lucide-react";
import type { MarketplacePlugin } from "../data/plugins";
import { isBuiltinMarketplacePlugin } from "../data/plugins";
import { DesktopContext } from "../lib/desktop-context";
import { useI18n } from "../lib/i18n";

interface Props {
  plugin: MarketplacePlugin;
  onInstall?: (plugin: MarketplacePlugin, e: React.MouseEvent) => void;
}

export function PluginActionButton({ plugin, onInstall }: Props) {
  const { t } = useI18n();
  const { installedPlugins, installingId, installViaAPI, installViaProtocol } =
    React.useContext(DesktopContext);

  if (isBuiltinMarketplacePlugin(plugin)) {
    return (
      <span className="px-2.5 py-1 rounded-full bg-primary/10 text-primary text-xs font-semibold flex items-center gap-1 border border-primary/20">
        <ShieldCheck className="w-3 h-3" />
        <span>{t("builtin")}</span>
      </span>
    );
  }

  const isInstalled = installedPlugins.has(plugin.id);
  const isInstalling = installingId === plugin.id;

  if (isInstalled) {
    return (
      <span className="px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-xs font-semibold flex items-center gap-1">
        <Check className="w-3 h-3" />
        <span>已安装</span>
      </span>
    );
  }

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (onInstall) {
      onInstall(plugin, e);
      return;
    }
    if (installViaAPI) {
      void installViaAPI(plugin);
    } else {
      installViaProtocol(plugin);
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isInstalling}
      className="px-3 py-1 rounded-full bg-secondary hover:bg-primary hover:text-primary-foreground text-foreground border border-border text-xs font-bold transition-all cursor-pointer flex items-center gap-1"
    >
      <Download className="w-3 h-3" />
      <span>{isInstalling ? "安装中" : "安装"}</span>
    </button>
  );
}
