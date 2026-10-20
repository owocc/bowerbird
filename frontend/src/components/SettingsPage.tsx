import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
  Check,
  Monitor,
  Moon,
  Sun,
  Settings2,
  Blocks,
  Lock,
  FileImage,
  FileVideo,
  Puzzle,
  Sparkles,
  ZoomIn,
  Globe,
  Copy,
  CheckCheck,
  Layers,
  Camera,
  Bookmark,
  MousePointerClick,
  Keyboard,
  Crop,
  AppWindow,
  Trash2,
  Store,
  RefreshCw,
  Download,
  ArrowUpCircle,
  Loader2,
  HardDrive,
  FolderOpen,
  Network,
  WifiOff,
  CheckCircle2,
  XCircle,
  Activity,
  Radio,
  Smartphone,
  QrCode,
  Wifi,
} from "lucide-react";
import { MacTrafficLightSpacer } from "@/components/MacTrafficLightSpacer";
import { isMacOS } from "@/lib/macos";
import { useTheme, type Theme } from "@/components/theme-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import {
  GetAssetServerPort,
  OpenExternalURL,
  CheckPluginUpdates,
  UpgradePlugin,
  GetPendingPluginInstall,
  GetNetworkSettings,
  SetNetworkSettings,
  TestNetworkConnection,
  ScanLocalPlugins,
  OpenLogsWindow,
  GetMobileServerStatus,
  SetMobileServerEnabled,
  RegenerateMobilePairingCode,
  GetMobilePairingURL,
  SetMobileAllowedNetworks,
} from "../../bindings/bowerbird/core/service";
import type { PluginUpdateInfo, NetworkSettings, NetworkTestResult, MobileServerStatus } from "../../bindings/bowerbird/core/models";
import { QRCodeSVG } from "qrcode.react";
import { loadRemotePlugin, loadAllInstalledPlugins } from "@/plugins/preview/remote-loader";
import { PluginInstallDialog } from "@/components/PluginInstallDialog";
import { Events } from "@wailsio/runtime";
import { copyTextToClipboard } from "@/lib/clipboard";
import {
  getLanguagePreference,
  setLanguagePreference,
  type LanguagePreference,
} from "@/i18n";
import { notifySuccess, notifyError } from "@/lib/notify";
import { SuccessCodes } from "@/lib/error-codes";
import {
  previewRegistry,
  usePreviewPlugins,
  type PreviewPluginStatus,
} from "@/plugins/preview/registry";
import { cn } from "@/lib/utils";

type SettingsSectionId = "general" | "shortcuts" | "plugins" | "network" | "data" | "extension" | "mobile";

interface ThemeOption {
  value: Theme;
  icon: typeof Sun;
  labelKey: string;
  descriptionKey: string;
}

const THEME_OPTIONS: ThemeOption[] = [
  {
    value: "light",
    icon: Sun,
    labelKey: "settings.appearance.light",
    descriptionKey: "settings.appearance.lightDescription",
  },
  {
    value: "dark",
    icon: Moon,
    labelKey: "settings.appearance.dark",
    descriptionKey: "settings.appearance.darkDescription",
  },
  {
    value: "system",
    icon: Monitor,
    labelKey: "settings.appearance.auto",
    descriptionKey: "settings.appearance.autoDescription",
  },
];

interface LanguageOption {
  value: LanguagePreference;
  icon: typeof Globe;
  labelKey: string;
  descriptionKey: string;
}

const LANGUAGE_OPTIONS: LanguageOption[] = [
  {
    value: "system",
    icon: Monitor,
    labelKey: "settings.language.auto",
    descriptionKey: "settings.language.autoDescription",
  },
  {
    value: "zh",
    icon: Globe,
    labelKey: "settings.language.zh",
    descriptionKey: "settings.language.zhDescription",
  },
  {
    value: "en",
    icon: Globe,
    labelKey: "settings.language.en",
    descriptionKey: "settings.language.enDescription",
  },
];

interface ProxyModeOption {
  value: "system" | "direct" | "custom";
  icon: typeof Network;
  labelKey: string;
  descriptionKey: string;
}

const PROXY_MODE_OPTIONS: ProxyModeOption[] = [
  {
    value: "system",
    icon: Monitor,
    labelKey: "settings.network.modeSystem",
    descriptionKey: "settings.network.modeSystemDesc",
  },
  {
    value: "direct",
    icon: WifiOff,
    labelKey: "settings.network.modeDirect",
    descriptionKey: "settings.network.modeDirectDesc",
  },
  {
    value: "custom",
    icon: Network,
    labelKey: "settings.network.modeCustom",
    descriptionKey: "settings.network.modeCustomDesc",
  },
];

function PluginIcon({ pluginId, className }: { pluginId: string; className?: string }) {
  switch (pluginId) {
    case "builtin.image":
      return <FileImage className={className} />;
    case "builtin.video":
      return <FileVideo className={className} />;
    case "plugin.prompt-metadata":
      return <Sparkles className={className} />;
    default:
      return <Puzzle className={className} />;
  }
}

function PluginCard({
  item,
  updateInfo,
  onUpgrade,
  isUpgrading,
}: {
  item: PreviewPluginStatus;
  updateInfo?: PluginUpdateInfo;
  onUpgrade?: (pluginId: string) => Promise<void>;
  isUpgrading?: boolean;
}) {
  const { t } = useTranslation();
  const { plugin, enabled, canDisable } = item;
  const displayName = plugin.nameKey ? t(plugin.nameKey) : plugin.name;
  const displayDescription = plugin.descriptionKey
    ? t(plugin.descriptionKey)
    : plugin.description;

  const extensions = plugin.extensions ?? [];

  const handleUninstall = async () => {
    try {
      await fetch("http://127.0.0.1:41595/api/plugin/uninstall", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: plugin.id }),
      });
    } catch (err) {
      console.warn("Uninstall error:", err);
    }
    previewRegistry.unregister(plugin.id);
    notifySuccess(t("settings.plugins.uninstalledSuccess", { defaultValue: `Uninstalled ${displayName}` }));
  };

  return (
    <div
      className={cn(
        "rounded-xl border p-4 transition-colors",
        enabled
          ? "border-border/70 bg-card/70 hover:border-border"
          : "border-border/40 bg-muted/20 opacity-85 hover:opacity-100"
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0">
          <div
            className={cn(
              "mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl transition-colors",
              enabled
                ? "bg-primary/10 text-primary"
                : "bg-muted/60 text-muted-foreground"
            )}
          >
            <PluginIcon pluginId={plugin.id} className="size-4.5" />
          </div>
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-xs font-semibold text-foreground truncate">
                {displayName}
              </h3>
              <span className="text-[10px] font-mono text-muted-foreground">
                {plugin.id}
              </span>
              {plugin.version && (
                <Badge
                  variant="secondary"
                  className="h-4 px-1.5 text-[10px] font-mono"
                >
                  v{plugin.version}
                </Badge>
              )}
              {plugin.builtin ? (
                <Badge
                  variant="outline"
                  className="h-4 px-1.5 text-[10px] border-primary/30 bg-primary/5 text-primary"
                >
                  {t("settings.plugins.builtinBadge")}
                </Badge>
              ) : (
                <Badge
                  variant="secondary"
                  className="h-4 px-1.5 text-[10px] bg-primary/10 text-primary border border-primary/20"
                >
                  Remote
                </Badge>
              )}
              {updateInfo && (
                <Badge
                  variant="default"
                  className="h-4 px-1.5 text-[10px] bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 gap-1 font-mono"
                >
                  <ArrowUpCircle className="size-2.5" />
                  v{updateInfo.latestVersion} Available
                </Badge>
              )}
              {plugin.kind === "metadata" && (
                <Badge
                  variant="secondary"
                  className="h-4 px-1.5 text-[10px] gap-1"
                >
                  <Sparkles className="size-2.5" />
                  {t("settings.plugins.metadataBadge")}
                </Badge>
              )}
              {plugin.supportsZoom && (
                <Badge
                  variant="secondary"
                  className="h-4 px-1.5 text-[10px] gap-1"
                >
                  <ZoomIn className="size-2.5" />
                  {t("settings.plugins.supportsZoom")}
                </Badge>
              )}
            </div>

            {displayDescription && (
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                {displayDescription}
              </p>
            )}
          </div>
        </div>

        {/* Enable / Disable Switch Control (Built-in core plugins are locked on) */}
        <div className="shrink-0 flex items-center gap-2 pt-0.5">
          {updateInfo && (
            <Button
              variant="default"
              size="xs"
              disabled={isUpgrading}
              onClick={() => onUpgrade?.(plugin.id)}
              className="h-6 px-2 text-[10px] gap-1 bg-primary text-primary-foreground hover:bg-primary/90 cursor-pointer"
              title={`Upgrade to v${updateInfo.latestVersion}`}
            >
              {isUpgrading ? (
                <Loader2 className="size-2.5 animate-spin" />
              ) : (
                <Download className="size-2.5" />
              )}
              <span>{isUpgrading ? "Updating..." : "Update"}</span>
            </Button>
          )}
          {!plugin.builtin && (
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={handleUninstall}
              className="text-muted-foreground hover:text-destructive hover:bg-destructive/10 cursor-pointer"
              title={t("settings.plugins.uninstall", { defaultValue: "Uninstall Plugin" })}
            >
              <Trash2 className="size-3.5" />
            </Button>
          )}
          {!canDisable ? (
            <div
              title={t("settings.plugins.cannotDisableHint")}
              className="inline-flex items-center gap-2"
            >
              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
                <Lock className="size-3 text-muted-foreground/80" />
                <span>{t("settings.plugins.alwaysEnabled")}</span>
              </span>
              <Switch checked={true} disabled={true} aria-label={displayName} />
            </div>
          ) : (
            <label className="inline-flex items-center gap-2 cursor-pointer select-none">
              <span
                className={cn(
                  "text-[11px] font-medium transition-colors",
                  enabled ? "text-primary" : "text-muted-foreground"
                )}
              >
                {enabled
                  ? t("settings.plugins.enabled")
                  : t("settings.plugins.disabled")}
              </span>
              <Switch
                checked={enabled}
                onCheckedChange={(checked) =>
                  previewRegistry.setEnabled(plugin.id, checked)
                }
                aria-label={displayName}
              />
            </label>
          )}
        </div>
      </div>

      {extensions.length > 0 && (
        <div className="mt-3 pt-3 border-t border-border/40 flex items-start gap-2">
          <span className="text-[10px] font-medium text-muted-foreground shrink-0 pt-0.5">
            {t("settings.plugins.supportedFormats")}:
          </span>
          <div className="flex flex-wrap gap-1">
            {extensions.map((ext) => (
              <span
                key={ext}
                className="rounded-md bg-muted/60 px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground"
              >
                .{ext}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Settings window with a 2-column sidebar layout:
 * - General Settings (Colour mode)
 * - Plugin Management (Installed preview plugins, built-in Image & Video locked on)
 */
export function SettingsPage() {
  const { t } = useTranslation();
  const { theme, setTheme } = useTheme();
  const [activeSection, setActiveSection] = useState<SettingsSectionId>("general");
  const [languagePref, setLanguagePref] = useState<LanguagePreference>(getLanguagePreference());
  const [serverPort, setServerPort] = useState<number>(41595);
  const [copied, setCopied] = useState<boolean>(false);
  const installedPlugins = usePreviewPlugins();
  const [checkingUpdates, setCheckingUpdates] = useState(false);
  const [availableUpdates, setAvailableUpdates] = useState<Map<string, PluginUpdateInfo>>(new Map());
  const [upgradingId, setUpgradingId] = useState<string | null>(null);
  const [systemPaths, setSystemPaths] = useState<{ userDataDir: string; pluginsDir: string }>({
    userDataDir: "",
    pluginsDir: "",
  });
  const [openingFolder, setOpeningFolder] = useState<string | null>(null);
  const [copiedPathKey, setCopiedPathKey] = useState<string | null>(null);
  const [networkSettings, setNetworkSettingsState] = useState<NetworkSettings>({
    proxyMode: "system",
    customProxy: "",
  });
  const [customProxyInput, setCustomProxyInput] = useState<string>("");
  const [savingNetwork, setSavingNetwork] = useState(false);
  const [testTargetUrl, setTestTargetUrl] = useState<string>("https://raw.githubusercontent.com");
  const [testingConnection, setTestingConnection] = useState(false);
  const [testResult, setTestResult] = useState<NetworkTestResult | null>(null);
  const [scanningPlugins, setScanningPlugins] = useState(false);
  const [mobileStatus, setMobileStatus] = useState<MobileServerStatus | null>(null);
  const [mobilePairingUrl, setMobilePairingUrl] = useState<string>("");
  const [regeneratingCode, setRegeneratingCode] = useState(false);
  const [togglingMobile, setTogglingMobile] = useState(false);
  const [copiedMobileUrl, setCopiedMobileUrl] = useState(false);

  const loadMobileData = () => {
    GetMobileServerStatus()
      .then((status) => {
        if (status) setMobileStatus(status);
      })
      .catch(() => {});
    GetMobilePairingURL()
      .then((url) => {
        if (url) setMobilePairingUrl(url);
      })
      .catch(() => {});
  };

  useEffect(() => {
    loadMobileData();
  }, []);

  const handleToggleMobileServer = async (enabled: boolean) => {
    try {
      setTogglingMobile(true);
      await SetMobileServerEnabled(enabled);
      loadMobileData();
    } catch (err) {
      notifyError(err);
    } finally {
      setTogglingMobile(false);
    }
  };

  const handleRegeneratePairingCode = async () => {
    try {
      setRegeneratingCode(true);
      await RegenerateMobilePairingCode();
      loadMobileData();
      notifySuccess(t("settings.mobile.pairingCodeTitle"));
    } catch (err) {
      notifyError(err);
    } finally {
      setRegeneratingCode(false);
    }
  };

  const handleCopyMobileUrl = async () => {
    if (!mobilePairingUrl) return;
    await copyTextToClipboard(mobilePairingUrl);
    setCopiedMobileUrl(true);
    notifySuccess(t("settings.mobile.copiedUrl"));
    setTimeout(() => setCopiedMobileUrl(false), 2000);
  };
  const handleToggleNetwork = async (ifaceId: string, currentSelected: boolean) => {
    if (!mobileStatus?.availableNetworks) return;
    const currentAllowed = mobileStatus.availableNetworks
      .filter((n) => (n.id === ifaceId ? !currentSelected : n.selected))
      .map((n) => n.id);
    try {
      await SetMobileAllowedNetworks(currentAllowed);
      loadMobileData();
    } catch (err) {
      notifyError(err);
    }
  };
  useEffect(() => {
    GetNetworkSettings()
      .then((settings) => {
        if (settings) {
          setNetworkSettingsState(settings);
          setCustomProxyInput(settings.customProxy || "");
        }
      })
      .catch(() => {
        fetch("http://127.0.0.1:41595/api/network/settings")
          .then((res) => (res.ok ? res.json() : null))
          .then((json) => {
            if (json?.data) {
              setNetworkSettingsState(json.data);
              setCustomProxyInput(json.data.customProxy || "");
            }
          })
          .catch(() => {});
      });

    const unsub = Events.On("network-settings-changed", (evt: unknown) => {
      if (evt && typeof evt === "object" && "data" in evt && evt.data) {
        const s = evt.data as NetworkSettings;
        setNetworkSettingsState(s);
        setCustomProxyInput(s.customProxy || "");
      }
    });
    return () => unsub();
  }, []);

  const handleSaveNetworkSettings = async (mode: string, customProxyVal?: string) => {
    const proxyVal = customProxyVal !== undefined ? customProxyVal : customProxyInput;
    setSavingNetwork(true);
    try {
      const payload: NetworkSettings = {
        proxyMode: mode,
        customProxy: proxyVal.trim(),
      };
      let saved = false;
      try {
        await SetNetworkSettings(payload);
        saved = true;
      } catch {
        const res = await fetch("http://127.0.0.1:41595/api/network/settings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (res.ok) {
          saved = true;
        }
      }
      if (saved) {
        setNetworkSettingsState(payload);
        notifySuccess(t("settings.network.saveSuccess"));
      } else {
        throw new Error("Failed to save network settings");
      }
    } catch (err) {
      console.error("Save network settings failed:", err);
      notifyError(err);
    } finally {
      setSavingNetwork(false);
    }
  };

  const handleTestConnection = async () => {
    setTestingConnection(true);
    setTestResult(null);
    try {
      let res: NetworkTestResult | null = null;
      try {
        res = await TestNetworkConnection(testTargetUrl.trim());
      } catch {
        const fetchRes = await fetch("http://127.0.0.1:41595/api/network/test", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            targetUrl: testTargetUrl.trim(),
            proxyMode: networkSettings.proxyMode,
            customProxy: customProxyInput.trim(),
          }),
        });
        if (fetchRes.ok) {
          const json = await fetchRes.json();
          res = json.data;
        }
      }
      if (res) {
        setTestResult(res);
        if (res.success) {
          notifySuccess(t("settings.network.testSuccess"));
        } else {
          notifyError(res.error || t("settings.network.testFailed"));
        }
      }
    } catch (err) {
      console.error("Test connection failed:", err);
      notifyError(err);
    } finally {
      setTestingConnection(false);
    }
  };
  const handleScanLocalPlugins = async () => {
    setScanningPlugins(true);
    try {
      let plugins: any = null;
      try {
        plugins = await ScanLocalPlugins();
      } catch {
        const res = await fetch("http://127.0.0.1:41595/api/plugins/scan", { method: "POST" });
        if (res.ok) {
          const json = await res.json();
          plugins = json.data;
        }
      }
      await loadAllInstalledPlugins();
      const count = Array.isArray(plugins) ? plugins.length : installedPlugins.length;
      notifySuccess(t("settings.plugins.scanSuccess", { count, defaultValue: `Scan completed, synchronized local plugin folder (${count} plugins)` }));
    } catch (err) {
      console.error("Scan local plugins failed:", err);
      notifyError(err);
    } finally {
      setScanningPlugins(false);
    }
  };


  useEffect(() => {
    fetch("http://127.0.0.1:41595/api/system/paths")
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (json?.data) {
          setSystemPaths(json.data);
        }
      })
      .catch(() => {});
  }, []);

  const handleOpenFolder = async (type: "userData" | "plugins") => {
    setOpeningFolder(type);
    try {
      const endpoint = type === "userData" ? "open-user-data" : "open-plugins";
      const res = await fetch(`http://127.0.0.1:41595/api/system/${endpoint}`, { method: "POST" });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
    } catch (err) {
      console.error(`Failed to open ${type} folder:`, err);
      notifyError(err);
    } finally {
      setOpeningFolder(null);
    }
  };

  const handleCopyPath = (pathText: string, key: string) => {
    if (!pathText) return;
    copyTextToClipboard(pathText);
    setCopiedPathKey(key);
    notifySuccess(t("settings.data.pathCopied"));
    setTimeout(() => setCopiedPathKey(null), 2000);
  };
  useEffect(() => {
    // If there is a pending install request, switch automatically to the plugins tab
    GetPendingPluginInstall().then((pending) => {
      if (pending && pending.manifestUrl) {
        setActiveSection("plugins");
      }
    }).catch(() => {});

    const unsub = Events.On("plugin:install-requested", () => {
      setActiveSection("plugins");
    });
    return () => unsub();
  }, []);

  const handleCheckUpdates = async () => {
    try {
      let updates: PluginUpdateInfo[] = [];
      try {
        const res = await CheckPluginUpdates();
        if (res) updates = res;
      } catch {
        const res = await fetch("http://127.0.0.1:41595/api/plugins/check-updates");
        if (res.ok) {
          const json = await res.json();
          updates = json.data || [];
        }
      }

      const map = new Map<string, PluginUpdateInfo>();
      for (const u of updates) {
        if (u.hasUpdate) {
          map.set(u.id, u);
        }
      }
      setAvailableUpdates(map);

      if (map.size > 0) {
        notifySuccess(`Found ${map.size} plugin update${map.size > 1 ? "s" : ""}!`);
      } else {
        notifySuccess(t("settings.plugins.allUpToDate", { defaultValue: "All plugins are up to date." }));
      }
    } catch (err) {
      console.error("Check updates failed:", err);
      notifyError(err);
    } finally {
      setCheckingUpdates(false);
    }
  };

  const handleUpgrade = async (pluginId: string) => {
    setUpgradingId(pluginId);
    try {
      try {
        await UpgradePlugin(pluginId);
      } catch {
        const res = await fetch("http://127.0.0.1:41595/api/plugins/upgrade", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: pluginId }),
        });
        if (!res.ok) {
          const text = await res.text();
          throw new Error(text || `Upgrade failed with HTTP ${res.status}`);
        }
      }

      await loadRemotePlugin(pluginId);
      setAvailableUpdates((prev) => {
        const next = new Map(prev);
        next.delete(pluginId);
        return next;
      });
      notifySuccess(`Plugin "${pluginId}" updated successfully!`);
    } catch (err) {
      console.error("Upgrade failed:", err);
      notifyError(err);
    } finally {
      setUpgradingId(null);
    }
  };
  useEffect(() => {
    GetAssetServerPort().then((p) => {
      if (p && p > 0) {
        setServerPort(p);
      }
    }).catch(() => {});
  }, []);

  const handleCopyEndpoint = async () => {
    const url = `http://127.0.0.1:${serverPort}`;
    await copyTextToClipboard(url);
    setCopied(true);
    notifySuccess(SuccessCodes.EXTENSION_URL_COPIED);
    setTimeout(() => setCopied(false), 2000);
  };

  const navItems: {
    id: SettingsSectionId;
    label: string;
    icon: typeof Settings2;
    badge?: number;
  }[] = [
    {
      id: "general",
      label: t("settings.nav.general"),
      icon: Settings2,
    },
    {
      id: "shortcuts",
      label: t("settings.nav.shortcuts"),
      icon: Keyboard,
    },
    {
      id: "plugins",
      label: t("settings.nav.plugins"),
      icon: Blocks,
      badge: installedPlugins.length,
    },
    {
      id: "network",
      label: t("settings.nav.network"),
      icon: Network,
    },
    {
      id: "data",
      label: t("settings.nav.data"),
      icon: HardDrive,
    },
    {
      id: "extension",
      label: t("settings.nav.extension"),
      icon: Globe,
    },
    {
      id: "mobile",
      label: t("settings.nav.mobile"),
      icon: Smartphone,
    },
  ];
  return (
    <div className="h-screen w-screen overflow-hidden flex bg-background text-foreground antialiased select-none">
      {/* Left Navigation Sidebar */}
      <aside className="w-56 shrink-0 border-r border-sidebar-border bg-sidebar text-sidebar-foreground flex flex-col select-none">
        <div className="h-(--titlebar-height) px-3 flex items-center gap-2 shrink-0 wails-drag">
          <MacTrafficLightSpacer className="w-[72px] h-(--titlebar-height) shrink-0" />
          <span className="text-xs font-semibold tracking-tight text-sidebar-foreground truncate">
            {t("settings.title")}
          </span>
          <div className="flex-1 h-full" />
        </div>

        <nav
          aria-label={t("settings.title")}
          className="flex-1 px-2.5 py-2 space-y-1 overflow-y-auto wails-no-drag"
        >
          {navItems.map(({ id, label, icon: Icon, badge }) => {
            const isActive = activeSection === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setActiveSection(id)}
                className={cn(
                  "w-full flex items-center gap-2.5 h-8 px-2.5 rounded-lg text-xs transition-colors cursor-pointer",
                  isActive
                    ? "bg-primary/10 text-primary font-semibold shadow-2xs"
                    : "text-sidebar-foreground/80 hover:bg-sidebar-accent/70 hover:text-sidebar-foreground"
                )}
              >
                <Icon
                  className={cn(
                    "size-4 shrink-0",
                    isActive ? "text-primary" : "text-muted-foreground"
                  )}
                />
                <span className="flex-1 text-left truncate">{label}</span>
                {badge !== undefined && (
                  <span
                    className={cn(
                      "rounded-md px-1.5 py-0.5 text-[10px] font-mono",
                      isActive
                        ? "bg-primary/15 text-primary"
                        : "bg-sidebar-accent text-muted-foreground"
                    )}
                  >
                    {badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </aside>

      {/* Right Content Area */}
      <main className="flex-1 flex flex-col min-w-0 bg-background overflow-hidden">
        <header className="h-(--titlebar-height) shrink-0 border-b border-border/60 px-6 flex items-center justify-between bg-background/80 backdrop-blur wails-drag">
          <h1 className="text-xs font-semibold tracking-tight text-foreground">
            {activeSection === "general"
              ? t("settings.nav.general")
              : activeSection === "shortcuts"
              ? t("settings.nav.shortcuts")
              : activeSection === "plugins"
              ? t("settings.nav.plugins")
              : activeSection === "network"
              ? t("settings.nav.network")
              : activeSection === "data"
              ? t("settings.nav.data")
              : activeSection === "extension"
              ? t("settings.nav.extension")
              : t("settings.nav.mobile")}
          </h1>
        </header>

        <div className="flex-1 overflow-y-auto p-6 wails-no-drag">
          {activeSection === "general" && (
            <div className="max-w-xl space-y-6">
              <section className="space-y-3">
                <div className="space-y-0.5">
                  <h2 className="text-xs font-semibold">
                    {t("settings.appearance.title")}
                  </h2>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    {t("settings.appearance.description")}
                  </p>
                </div>

                <div className="grid grid-cols-3 gap-3" role="radiogroup">
                  {THEME_OPTIONS.map(
                    ({ value, icon: Icon, labelKey, descriptionKey }) => {
                      const selected = theme === value;
                      return (
                        <button
                          key={value}
                          type="button"
                          role="radio"
                          aria-checked={selected}
                          onClick={() => setTheme(value)}
                          className={cn(
                            "group relative flex flex-col items-center gap-1.5 rounded-xl border p-3.5 text-center transition-colors cursor-pointer",
                            selected
                              ? "border-primary bg-primary/10 text-foreground"
                              : "border-border/60 bg-muted/30 text-muted-foreground hover:border-border hover:bg-muted/60 hover:text-foreground"
                          )}
                        >
                          {selected && (
                            <span className="absolute right-2 top-2 flex size-4 items-center justify-center rounded-full bg-primary text-primary-foreground">
                              <Check className="size-2.5" />
                            </span>
                          )}
                          <Icon className="size-5" />
                          <span className="text-[11px] font-medium">
                            {t(labelKey)}
                          </span>
                          <span className="text-[10px] leading-tight text-muted-foreground">
                            {t(descriptionKey)}
                          </span>
                        </button>
                      );
                    }
                  )}
                </div>
              </section>

              <section className="space-y-3">
                <div className="space-y-0.5">
                  <h2 className="text-xs font-semibold">
                    {t("settings.language.title")}
                  </h2>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    {t("settings.language.description")}
                  </p>
                </div>

                <div className="grid grid-cols-3 gap-3" role="radiogroup">
                  {LANGUAGE_OPTIONS.map(
                    ({ value, icon: Icon, labelKey, descriptionKey }) => {
                      const selected = languagePref === value;
                      return (
                        <button
                          key={value}
                          type="button"
                          role="radio"
                          aria-checked={selected}
                          onClick={async () => {
                            setLanguagePref(value);
                            await setLanguagePreference(value);
                            notifySuccess(SuccessCodes.SETTINGS_SAVED);
                          }}
                          className={cn(
                            "group relative flex flex-col items-center gap-1.5 rounded-xl border p-3.5 text-center transition-colors cursor-pointer",
                            selected
                              ? "border-primary bg-primary/10 text-foreground"
                              : "border-border/60 bg-muted/30 text-muted-foreground hover:border-border hover:bg-muted/60 hover:text-foreground"
                          )}
                        >
                          {selected && (
                            <span className="absolute right-2 top-2 flex size-4 items-center justify-center rounded-full bg-primary text-primary-foreground">
                              <Check className="size-2.5" />
                            </span>
                          )}
                          <Icon className="size-5" />
                          <span className="text-[11px] font-medium">
                            {t(labelKey)}
                          </span>
                          <span className="text-[10px] leading-tight text-muted-foreground">
                            {t(descriptionKey)}
                          </span>
                        </button>
                      );
                    }
                  )}
                </div>
              </section>
            </div>
          )}

          {activeSection === "shortcuts" && (
            <div className="max-w-xl space-y-6">
              <section className="space-y-3">
                <div className="space-y-0.5">
                  <h2 className="text-xs font-semibold">
                    {t("settings.shortcuts.title")}
                  </h2>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    {t("settings.shortcuts.description")}
                  </p>
                </div>

                <div className="grid gap-2.5">
                  <div className="flex items-center justify-between rounded-xl border border-border/70 bg-card/70 p-3.5">
                    <div className="flex items-center gap-3">
                      <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <Crop className="size-4" />
                      </div>
                      <div>
                        <div className="text-xs font-medium">{t("settings.shortcuts.areaTitle")}</div>
                        <div className="text-[10px] text-muted-foreground">{t("settings.shortcuts.areaDesc")}</div>
                      </div>
                    </div>
                    <kbd className="inline-flex items-center gap-1 rounded-md border border-border bg-muted/60 px-2 py-1 text-[11px] font-mono font-medium text-foreground shadow-2xs">
                      {isMacOS() ? "⌥A" : "Alt+A"}
                    </kbd>
                  </div>

                  <div className="flex items-center justify-between rounded-xl border border-border/70 bg-card/70 p-3.5">
                    <div className="flex items-center gap-3">
                      <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <AppWindow className="size-4" />
                      </div>
                      <div>
                        <div className="text-xs font-medium">{t("settings.shortcuts.windowTitle")}</div>
                        <div className="text-[10px] text-muted-foreground">{t("settings.shortcuts.windowDesc")}</div>
                      </div>
                    </div>
                    <kbd className="inline-flex items-center gap-1 rounded-md border border-border bg-muted/60 px-2 py-1 text-[11px] font-mono font-medium text-foreground shadow-2xs">
                      {isMacOS() ? "⌥W" : "Alt+W"}
                    </kbd>
                  </div>

                  <div className="flex items-center justify-between rounded-xl border border-border/70 bg-card/70 p-3.5">
                    <div className="flex items-center gap-3">
                      <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <Monitor className="size-4" />
                      </div>
                      <div>
                        <div className="text-xs font-medium">{t("settings.shortcuts.fullscreenTitle")}</div>
                        <div className="text-[10px] text-muted-foreground">{t("settings.shortcuts.fullscreenDesc")}</div>
                      </div>
                    </div>
                    <kbd className="inline-flex items-center gap-1 rounded-md border border-border bg-muted/60 px-2 py-1 text-[11px] font-mono font-medium text-foreground shadow-2xs">
                      {isMacOS() ? "⌥S" : "Alt+S"}
                    </kbd>
                  </div>
                </div>
              </section>

              <section className="space-y-3">
                <div className="space-y-0.5">
                  <h2 className="text-xs font-semibold">
                    {t("settings.shortcuts.menuBarTitle")}
                  </h2>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    {t("settings.shortcuts.menuBarDesc")}
                  </p>
                </div>
              </section>
            </div>
          )}

          {activeSection === "plugins" && (
            <div className="max-w-2xl space-y-4">
              <div className="flex items-center justify-between gap-4">
                <div className="space-y-0.5">
                  <h2 className="text-xs font-semibold">
                    {t("settings.plugins.title")}
                  </h2>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    {t("settings.plugins.description")}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleScanLocalPlugins}
                    disabled={scanningPlugins}
                    className="h-8 gap-1.5 text-xs cursor-pointer"
                    title={t("settings.plugins.scanLocal", { defaultValue: "Scan Local Plugins" })}
                  >
                    <FolderOpen className={cn("size-3.5 text-primary", scanningPlugins && "animate-pulse")} />
                    <span>
                      {scanningPlugins
                        ? t("settings.plugins.scanning", { defaultValue: "Scanning…" })
                        : t("settings.plugins.scanLocal", { defaultValue: "Scan Local Plugins" })}
                    </span>
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleCheckUpdates}
                    disabled={checkingUpdates}
                    className="h-8 gap-1.5 text-xs cursor-pointer"
                  >
                    <RefreshCw className={cn("size-3.5", checkingUpdates && "animate-spin text-primary")} />
                    <span>{checkingUpdates ? "Checking..." : t("settings.plugins.checkUpdates", { defaultValue: "Check Updates" })}</span>
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => OpenExternalURL("http://localhost:3000")}
                    className="h-8 gap-1.5 text-xs cursor-pointer"
                  >
                    <Store className="size-3.5 text-primary" />
                    <span>{t("settings.plugins.visitMarketplace", { defaultValue: "Visit Marketplace" })}</span>
                  </Button>
                  <Badge variant="secondary" className="text-[11px] font-mono">
                    {t("settings.plugins.installedCount", {
                      count: installedPlugins.length,
                    })}
                  </Badge>
                </div>
              </div>

              <div className="space-y-3">
                {installedPlugins.map((item) => (
                  <PluginCard
                    key={item.plugin.id}
                    item={item}
                    updateInfo={availableUpdates.get(item.plugin.id)}
                    onUpgrade={handleUpgrade}
                    isUpgrading={upgradingId === item.plugin.id}
                  />
                ))}
              </div>
            </div>
          )}
          {activeSection === "network" && (
            <div className="max-w-2xl space-y-6">
              {/* Proxy Mode Selection */}
              <section className="space-y-3">
                <div className="space-y-0.5">
                  <h2 className="text-xs font-semibold">
                    {t("settings.network.proxyMode")}
                  </h2>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    {t("settings.network.proxyModeDesc")}
                  </p>
                </div>

                <div className="grid grid-cols-3 gap-3" role="radiogroup">
                  {PROXY_MODE_OPTIONS.map(
                    ({ value, icon: Icon, labelKey, descriptionKey }) => {
                      const selected = networkSettings.proxyMode === value;
                      return (
                        <button
                          key={value}
                          type="button"
                          role="radio"
                          aria-checked={selected}
                          disabled={savingNetwork}
                          onClick={() => handleSaveNetworkSettings(value)}
                          className={cn(
                            "group relative flex flex-col items-center gap-1.5 rounded-xl border p-3.5 text-center transition-colors cursor-pointer",
                            selected
                              ? "border-primary bg-primary/10 text-foreground"
                              : "border-border/60 bg-muted/30 text-muted-foreground hover:border-border hover:bg-muted/60 hover:text-foreground"
                          )}
                        >
                          {selected && (
                            <span className="absolute right-2 top-2 flex size-4 items-center justify-center rounded-full bg-primary text-primary-foreground">
                              <Check className="size-2.5" />
                            </span>
                          )}
                          <Icon className="size-5" />
                          <span className="text-[11px] font-medium">
                            {t(labelKey)}
                          </span>
                          <span className="text-[10px] leading-tight text-muted-foreground">
                            {t(descriptionKey)}
                          </span>
                        </button>
                      );
                    }
                  )}
                </div>
              </section>

              {/* Custom Proxy Address Input */}
              {networkSettings.proxyMode === "custom" && (
                <section className="rounded-xl border border-border/70 bg-card p-4 space-y-3">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-foreground">
                      {t("settings.network.customProxyLabel")}
                    </label>
                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                      {t("settings.network.customProxyHelp")}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <Input
                      value={customProxyInput}
                      onChange={(e) => setCustomProxyInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          handleSaveNetworkSettings("custom", customProxyInput);
                        }
                      }}
                      placeholder={t("settings.network.customProxyPlaceholder")}
                      className="flex-1 font-mono text-xs h-8 bg-muted/30"
                    />
                    <Button
                      size="sm"
                      disabled={savingNetwork || !customProxyInput.trim()}
                      onClick={() => handleSaveNetworkSettings("custom", customProxyInput)}
                      className="h-8 text-xs cursor-pointer"
                    >
                      {savingNetwork ? (
                        <Loader2 className="size-3.5 animate-spin mr-1.5" />
                      ) : (
                        <Check className="size-3.5 mr-1.5" />
                      )}
                      <span>{t("common.save", { defaultValue: "Save" })}</span>
                    </Button>
                  </div>
                </section>
              )}

              {/* Network Connectivity Test */}
              <section className="rounded-xl border border-border/70 bg-card p-4 space-y-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Activity className="size-4 text-primary" />
                    <h3 className="text-xs font-semibold text-foreground">
                      {t("settings.network.testTitle")}
                    </h3>
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    {t("settings.network.testDesc")}
                  </p>
                </div>

                <div className="space-y-2">
                  <label className="text-[11px] font-medium text-muted-foreground">
                    {t("settings.network.testTargetLabel")}
                  </label>
                  <div className="flex items-center gap-2">
                    <Input
                      value={testTargetUrl}
                      onChange={(e) => setTestTargetUrl(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          handleTestConnection();
                        }
                      }}
                      placeholder="https://raw.githubusercontent.com"
                      className="flex-1 font-mono text-xs h-8 bg-muted/30"
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={testingConnection || !testTargetUrl.trim()}
                      onClick={handleTestConnection}
                      className="h-8 text-xs cursor-pointer gap-1.5 shrink-0"
                    >
                      {testingConnection ? (
                        <Loader2 className="size-3.5 animate-spin text-primary" />
                      ) : (
                        <Radio className="size-3.5 text-primary" />
                      )}
                      <span>
                        {testingConnection
                          ? t("settings.network.testing")
                          : t("settings.network.testButton")}
                      </span>
                    </Button>
                  </div>
                </div>

                {/* Test Result Display */}
                {testResult && (
                  <div
                    className={cn(
                      "rounded-lg border p-3 space-y-2 text-xs",
                      testResult.success
                        ? "border-emerald-500/30 bg-emerald-500/5 text-foreground"
                        : "border-destructive/30 bg-destructive/5 text-foreground"
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 font-medium">
                        {testResult.success ? (
                          <CheckCircle2 className="size-4 text-emerald-500" />
                        ) : (
                          <XCircle className="size-4 text-destructive" />
                        )}
                        <span>
                          {testResult.success
                            ? t("settings.network.testSuccess")
                            : t("settings.network.testFailed")}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        {testResult.statusCode && (
                          <Badge variant="outline" className="text-[10px] font-mono">
                            HTTP {testResult.statusCode}
                          </Badge>
                        )}
                        <Badge
                          variant={testResult.success ? "secondary" : "destructive"}
                          className="text-[10px] font-mono"
                        >
                          {testResult.latencyMs} ms
                        </Badge>
                      </div>
                    </div>

                    <div className="text-[11px] text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1">
                      <span>
                        {t("settings.network.activeProxy")}:{" "}
                        <code className="text-foreground font-mono bg-muted px-1.5 py-0.5 rounded text-[10px]">
                          {testResult.activeProxy || "direct"}
                        </code>
                      </span>
                      <button
                        type="button"
                        onClick={() => OpenLogsWindow()}
                        className="text-primary hover:underline cursor-pointer inline-flex items-center gap-1"
                      >
                        <span>{t("appMenu.logs", { defaultValue: "Logs…" })}</span>
                      </button>
                    </div>

                    {testResult.error && (
                      <div className="text-[11px] font-mono text-destructive bg-destructive/10 p-2 rounded-md break-all">
                        {testResult.error}
                      </div>
                    )}
                  </div>
                )}
              </section>
            </div>
          )}
          {activeSection === "data" && (
            <div className="max-w-2xl space-y-6">
              <div className="space-y-0.5">
                <h2 className="text-xs font-semibold">{t("settings.data.title")}</h2>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  {t("settings.data.description")}
                </p>
              </div>

              {/* Plugins Directory Card */}
              <div className="rounded-xl border border-border/70 bg-card p-4 space-y-3">
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Puzzle className="size-4 text-primary" />
                      <h3 className="text-xs font-semibold text-foreground">
                        {t("settings.data.pluginsFolderTitle")}
                      </h3>
                    </div>
                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                      {t("settings.data.pluginsFolderDesc")}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={openingFolder === "plugins"}
                    onClick={() => handleOpenFolder("plugins")}
                    className="h-8 gap-1.5 text-xs font-medium cursor-pointer shrink-0"
                  >
                    {openingFolder === "plugins" ? (
                      <Loader2 className="size-3.5 animate-spin text-primary" />
                    ) : (
                      <FolderOpen className="size-3.5 text-primary" />
                    )}
                    <span>
                      {isMacOS()
                        ? t("settings.data.openInFileManager")
                        : t("settings.data.openInExplorer")}
                    </span>
                  </Button>
                </div>
                <div className="flex items-center justify-between gap-2 p-2 rounded-lg bg-muted/60 border border-border/50 text-xs font-mono text-muted-foreground">
                  <span className="truncate select-all">{systemPaths.pluginsDir || "~/Library/Application Support/bowerbird/plugins"}</span>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-6 shrink-0 cursor-pointer text-muted-foreground hover:text-foreground"
                    title={t("settings.data.copyPath")}
                    onClick={() => handleCopyPath(systemPaths.pluginsDir, "plugins")}
                  >
                    {copiedPathKey === "plugins" ? (
                      <CheckCheck className="size-3 text-emerald-500" />
                    ) : (
                      <Copy className="size-3" />
                    )}
                  </Button>
                </div>
              </div>

              {/* App Data Directory Card */}
              <div className="rounded-xl border border-border/70 bg-card p-4 space-y-3">
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <HardDrive className="size-4 text-primary" />
                      <h3 className="text-xs font-semibold text-foreground">
                        {t("settings.data.appDataFolderTitle")}
                      </h3>
                    </div>
                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                      {t("settings.data.appDataFolderDesc")}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={openingFolder === "userData"}
                    onClick={() => handleOpenFolder("userData")}
                    className="h-8 gap-1.5 text-xs font-medium cursor-pointer shrink-0"
                  >
                    {openingFolder === "userData" ? (
                      <Loader2 className="size-3.5 animate-spin text-primary" />
                    ) : (
                      <FolderOpen className="size-3.5 text-primary" />
                    )}
                    <span>
                      {isMacOS()
                        ? t("settings.data.openInFileManager")
                        : t("settings.data.openInExplorer")}
                    </span>
                  </Button>
                </div>
                <div className="flex items-center justify-between gap-2 p-2 rounded-lg bg-muted/60 border border-border/50 text-xs font-mono text-muted-foreground">
                  <span className="truncate select-all">{systemPaths.userDataDir || "~/Library/Application Support/bowerbird"}</span>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-6 shrink-0 cursor-pointer text-muted-foreground hover:text-foreground"
                    title={t("settings.data.copyPath")}
                    onClick={() => handleCopyPath(systemPaths.userDataDir, "userData")}
                  >
                    {copiedPathKey === "userData" ? (
                      <CheckCheck className="size-3 text-emerald-500" />
                    ) : (
                      <Copy className="size-3" />
                    )}
                  </Button>
                </div>
              </div>
            </div>
          )}


          {activeSection === "extension" && (
            <div className="max-w-2xl space-y-6">
              {/* Server Status & Endpoint */}
              <div className="rounded-xl border border-border/70 bg-card p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <span className="relative flex h-2.5 w-2.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
                    </span>
                    <span className="text-xs font-semibold">
                      {t("settings.extension.serverStatus")}
                    </span>
                  </div>
                  <Badge variant="outline" className="font-mono text-[10px] text-emerald-600 dark:text-emerald-400 border-emerald-500/30">
                    {t("settings.extension.running", { port: serverPort })}
                  </Badge>
                </div>

                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  {t("settings.extension.description")}
                </p>

                <div className="flex items-center gap-2 pt-1">
                  <div className="flex-1 rounded-lg bg-muted/50 border border-border/60 px-3 py-1.5 font-mono text-xs text-foreground select-all">
                    http://127.0.0.1:{serverPort}
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleCopyEndpoint}
                    className="h-8 gap-1.5 text-xs shrink-0 cursor-pointer"
                  >
                    {copied ? (
                      <CheckCheck className="size-3.5 text-emerald-500" />
                    ) : (
                      <Copy className="size-3.5" />
                    )}
                    {copied ? t("settings.extension.copied") : t("settings.extension.copyEndpoint")}
                  </Button>
                </div>
              </div>

              {/* Extension Features */}
              <div className="space-y-3">
                <h2 className="text-xs font-semibold text-foreground">
                  {t("settings.extension.features.title")}
                </h2>
                <div className="grid grid-cols-2 gap-2.5">
                  <div className="rounded-lg border border-border/60 bg-muted/20 p-3 flex items-start gap-2.5">
                    <MousePointerClick className="size-4 text-primary shrink-0 mt-0.5" />
                    <div className="space-y-0.5">
                      <div className="text-xs font-medium">{t("settings.extension.features.contextMenuTitle")}</div>
                      <div className="text-[10px] text-muted-foreground leading-tight">
                        {t("settings.extension.features.contextMenu")}
                      </div>
                    </div>
                  </div>
                  <div className="rounded-lg border border-border/60 bg-muted/20 p-3 flex items-start gap-2.5">
                    <Layers className="size-4 text-primary shrink-0 mt-0.5" />
                    <div className="space-y-0.5">
                      <div className="text-xs font-medium">{t("settings.extension.features.batchTitle")}</div>
                      <div className="text-[10px] text-muted-foreground leading-tight">
                        {t("settings.extension.features.batch")}
                      </div>
                    </div>
                  </div>
                  <div className="rounded-lg border border-border/60 bg-muted/20 p-3 flex items-start gap-2.5">
                    <Camera className="size-4 text-primary shrink-0 mt-0.5" />
                    <div className="space-y-0.5">
                      <div className="text-xs font-medium">{t("settings.extension.features.screenshotTitle")}</div>
                      <div className="text-[10px] text-muted-foreground leading-tight">
                        {t("settings.extension.features.screenshot")}
                      </div>
                    </div>
                  </div>
                  <div className="rounded-lg border border-border/60 bg-muted/20 p-3 flex items-start gap-2.5">
                    <Bookmark className="size-4 text-primary shrink-0 mt-0.5" />
                    <div className="space-y-0.5">
                      <div className="text-xs font-medium">{t("settings.extension.features.bookmarkTitle")}</div>
                      <div className="text-[10px] text-muted-foreground leading-tight">
                        {t("settings.extension.features.bookmark")}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Multi-browser Installation Guide */}
              <div className="space-y-3">
                <h2 className="text-xs font-semibold text-foreground">
                  {t("settings.extension.installGuide")}
                </h2>
                <div className="space-y-2">
                  <div className="rounded-lg border border-border/60 p-3 bg-muted/20 space-y-1">
                    <div className="text-xs font-medium text-foreground">
                      {t("settings.extension.browsers.chrome.name")}
                    </div>
                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                      {t("settings.extension.browsers.chrome.steps")}
                    </p>
                  </div>
                  <div className="rounded-lg border border-border/60 p-3 bg-muted/20 space-y-1">
                    <div className="text-xs font-medium text-foreground">
                      {t("settings.extension.browsers.firefox.name")}
                    </div>
                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                      {t("settings.extension.browsers.firefox.steps")}
                    </p>
                  </div>
                  <div className="rounded-lg border border-border/60 p-3 bg-muted/20 space-y-1">
                    <div className="text-xs font-medium text-foreground">
                      {t("settings.extension.browsers.safari.name")}
                    </div>
                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                      {t("settings.extension.browsers.safari.steps")}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
          {activeSection === "mobile" && (
            <div className="max-w-2xl space-y-6">
              {/* Server Status & Switch */}
              <div className="rounded-xl border border-border/70 bg-card p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <span className="relative flex h-2.5 w-2.5">
                      {mobileStatus?.running ? (
                        <>
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
                        </>
                      ) : (
                        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-muted-foreground/40" />
                      )}
                    </span>
                    <span className="text-xs font-semibold">
                      {t("settings.mobile.serverStatus")}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge
                      variant="outline"
                      className={cn(
                        "font-mono text-[10px]",
                        mobileStatus?.running
                          ? "text-emerald-600 dark:text-emerald-400 border-emerald-500/30"
                          : "text-muted-foreground border-border/60"
                      )}
                    >
                      {mobileStatus?.running
                        ? t("settings.mobile.running", { port: mobileStatus.port })
                        : t("settings.mobile.stopped")}
                    </Badge>
                    <Switch
                      checked={mobileStatus?.enabled ?? false}
                      disabled={togglingMobile}
                      onCheckedChange={handleToggleMobileServer}
                    />
                  </div>
                </div>

                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  {t("settings.mobile.description")}
                </p>

                {mobileStatus && (
                  <div className="text-[11px] text-muted-foreground pt-1 flex items-center justify-between border-t border-border/50">
                    <span>{t("settings.mobile.pairedDevices", { count: mobileStatus.pairedDevices })}</span>
                    <span>{t("settings.mobile.candidateIPs")}: {mobileStatus.addresses?.length ? mobileStatus.addresses.join(", ") : "—"}</span>
                  </div>
                )}
              </div>

              {/* Pairing Code Section */}
              <div className="rounded-xl border border-border/70 bg-card p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <h2 className="text-xs font-semibold text-foreground">
                      {t("settings.mobile.pairingCodeTitle")}
                    </h2>
                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                      {t("settings.mobile.pairingCodeDesc")}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleRegeneratePairingCode}
                    disabled={regeneratingCode || !mobileStatus?.running}
                    className="h-8 gap-1.5 text-xs shrink-0 cursor-pointer"
                  >
                    <RefreshCw className={cn("size-3.5", regeneratingCode && "animate-spin")} />
                    {regeneratingCode ? t("settings.mobile.regenerating") : t("settings.mobile.regenerate")}
                  </Button>
                </div>

                <div className="flex items-center justify-center p-3 rounded-xl bg-muted/30 border border-border/60">
                  <span className="font-mono text-3xl font-bold tracking-widest text-primary selection:bg-primary/20">
                    {mobileStatus?.pairingCode || "------"}
                  </span>
                </div>
              </div>

              {/* QR Code Section */}
              <div className="rounded-xl border border-border/70 bg-card p-4 space-y-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1">
                    <h2 className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                      <QrCode className="size-4 text-primary" />
                      {t("settings.mobile.qrTitle")}
                    </h2>
                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                      {t("settings.mobile.qrDesc")}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleCopyMobileUrl}
                    disabled={!mobilePairingUrl}
                    className="h-8 gap-1.5 text-xs shrink-0 cursor-pointer"
                  >
                    {copiedMobileUrl ? (
                      <CheckCheck className="size-3.5 text-emerald-500" />
                    ) : (
                      <Copy className="size-3.5" />
                    )}
                    {copiedMobileUrl ? t("settings.mobile.copiedUrl") : t("settings.mobile.copyUrl")}
                  </Button>
                </div>

                <div className="flex flex-col sm:flex-row items-center gap-6 p-4 rounded-xl bg-muted/20 border border-border/50">
                  <div className="p-3 bg-white rounded-xl shadow-xs shrink-0 ring-1 ring-border/40">
                    {mobilePairingUrl ? (
                      <QRCodeSVG
                        value={mobilePairingUrl}
                        size={168}
                        level="M"
                        includeMargin={false}
                      />
                    ) : (
                      <div className="size-[168px] flex items-center justify-center text-xs text-muted-foreground">
                        {t("settings.mobile.stopped")}
                      </div>
                    )}
                  </div>

                  <div className="space-y-2 text-[11px] leading-relaxed text-muted-foreground">
                    <p className="text-foreground/90 font-medium">
                      {t("settings.mobile.qrTip")}
                    </p>
                    {mobileStatus?.addresses && mobileStatus.addresses.length > 0 && (
                      <div className="space-y-1 pt-1">
                        <div className="font-semibold text-foreground/80">{t("settings.mobile.candidateIPs")}:</div>
                        <div className="flex flex-wrap gap-1">
                          {mobileStatus.addresses.map((ip) => (
                            <code
                              key={ip}
                              className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-muted/60 border border-border/60 text-foreground"
                            >
                              {ip}:{mobileStatus.port}
                            </code>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
              {/* Discovery Networks Section */}
              <div className="rounded-xl border border-border/70 bg-card p-4 space-y-3">
                <div className="space-y-0.5">
                  <h2 className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                    <Wifi className="size-4 text-primary" />
                    {t("settings.mobile.discoveryNetworks")}
                  </h2>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    {t("settings.mobile.discoveryNetworksDesc")}
                  </p>
                </div>

                <div className="space-y-2 pt-1">
                  {mobileStatus?.availableNetworks && mobileStatus.availableNetworks.length > 0 ? (
                    mobileStatus.availableNetworks.map((net) => (
                      <div
                        key={net.id}
                        className="flex items-center justify-between p-2.5 rounded-lg border border-border/50 bg-muted/20 hover:bg-muted/30 transition-colors"
                      >
                        <div className="flex items-center gap-2.5">
                          <span className="font-mono text-xs font-medium text-foreground">
                            {net.id}
                          </span>
                          <span className="font-mono text-[11px] text-muted-foreground">
                            ({net.ips?.join(", ")})
                          </span>
                          <Badge
                            variant="secondary"
                            className="text-[9px] px-1.5 py-0 h-4 uppercase"
                          >
                            {net.type === "lan"
                              ? t("settings.mobile.netLan")
                              : net.type === "tailscale"
                              ? "Tailscale"
                              : t("settings.mobile.netOther")}
                          </Badge>
                        </div>
                        <Switch
                          checked={net.selected}
                          onCheckedChange={() => handleToggleNetwork(net.id, net.selected)}
                        />
                      </div>
                    ))
                  ) : (
                    <div className="text-xs text-muted-foreground py-2 text-center">
                      {t("settings.mobile.noNetworksFound")}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
      <PluginInstallDialog />
    </div>
  );
}
