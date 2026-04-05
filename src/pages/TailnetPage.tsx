import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Monitor, Smartphone, Server, LogOut, Settings2, Loader2,
  RefreshCw, Check, Power, ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useTailnetStore } from "@/stores/tailnet";
import { cn } from "@/lib/utils";
import { tailnetService } from "@/services/tailnet";
import type { TailnetDevice } from "@/services/types";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

function deviceIcon(os: string) {
  switch (os.toLowerCase()) {
    case "macos": case "windows": case "linux": return Monitor;
    case "ios": case "android": return Smartphone;
    default: return Server;
  }
}

function DeviceCard({
  device, index, isCurrentExit, onSetExitNode,
}: {
  device: TailnetDevice; index: number; isCurrentExit: boolean;
  onSetExitNode: (name: string) => void;
}) {
  const { t } = useTranslation();
  const Icon = deviceIcon(device.os);
  const isOnline = device.status === "online";

  return (
    <div
      className={cn(
        "animate-slide-up rounded-xl border border-white/[0.06] bg-card/40 backdrop-blur-xl p-4 transition-all duration-200 hover:border-white/10 hover:bg-card/80",
        !isOnline && "opacity-50"
      )}
      style={{ animationDelay: `${(index + 3) * 80}ms` }}
    >
      <div className="flex items-center gap-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-full border border-white/[0.06] bg-muted/30">
          <Icon className="h-5 w-5 text-muted-foreground" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium truncate text-sm">{device.name}</span>
            {device.isSelf && (
              <Badge variant="outline" className="text-[10px] border-primary/30 bg-primary/15 text-primary">
                {t("tailnet.thisDevice")}
              </Badge>
            )}
            <span className="relative">
              <span className={cn("block h-2 w-2 rounded-full", isOnline ? "bg-green-500" : "bg-muted-foreground/40")} />
              {isOnline && <span className="absolute inset-0 h-2 w-2 rounded-full bg-green-500 animate-ping opacity-75" />}
            </span>
          </div>
          <p className="text-xs text-muted-foreground">{device.ip} • {device.os} • {device.hostname}</p>
        </div>
        {device.isExitNode && !device.isSelf && (
          <Button
            variant={isCurrentExit ? "default" : "outline"}
            size="sm"
            className={cn(
              "transition-all duration-200",
              isCurrentExit ? "shadow-[0_0_15px_rgba(254,151,185,0.15)]" : "border-white/[0.06]"
            )}
            onClick={() => onSetExitNode(isCurrentExit ? "" : device.name)}
            disabled={!isOnline}
          >
            <LogOut className="mr-2 h-3.5 w-3.5" />
            {isCurrentExit ? t("tailnet.active") : t("tailnet.exitNode")}
          </Button>
        )}
      </div>
    </div>
  );
}

export function TailnetPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { settings, devices, loading, fetchSettings, saveSettings, fetchDevices, setExitNode } = useTailnetStore();

  const [oauthId, setOauthId] = useState("");
  const [oauthSecret, setOauthSecret] = useState("");
  const [authKey, setAuthKey] = useState("");
  const [hostname, setHostname] = useState("calamity");
  const [tags, setTags] = useState("");
  const [testing, setTesting] = useState(false);
  const [manualExitNode, setManualExitNode] = useState("");

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  useEffect(() => {
    if (settings) {
      setOauthId(settings.oauthClientId);
      setOauthSecret(settings.oauthClientSecret);
      setAuthKey(settings.authKey);
      setHostname(settings.hostname);
      setTags(settings.tags?.join(", ") || "");
      setManualExitNode(settings.exitNode);
    }
  }, [settings]);

  useEffect(() => {
    if (settings?.oauthClientId && settings?.oauthClientSecret) {
      fetchDevices();
    }
  }, [settings?.oauthClientId, settings?.oauthClientSecret, fetchDevices]);

  const hasOAuth = !!(settings?.oauthClientId && settings?.oauthClientSecret);
  const onlineCount = devices.filter(d => d.status === "online").length;
  const currentExitName = settings?.exitNode || "";
  const currentExitDevice = devices.find(d => d.name === currentExitName || d.ip === currentExitName);

  async function handleTestOAuth() {
    setTesting(true);
    try {
      await tailnetService.testOAuth(oauthId, oauthSecret);
      toast.success(t("tailnet.testSuccess"));
    } catch (e: any) {
      toast.error(e?.message || String(e));
    } finally {
      setTesting(false);
    }
  }

  async function handleSave() {
    if (!settings) return;
    const enabled = !!(oauthId && oauthSecret);
    await saveSettings({
      ...settings,
      enabled,
      oauthClientId: oauthId,
      oauthClientSecret: oauthSecret,
      authKey,
      hostname,
      tags: tags.split(/[,，\s]+/).map(t => t.trim()).filter(Boolean),
    });
    toast.success(t("tailnet.saved"));
  }

  async function handleSetExitNode(name: string) {
    await setExitNode(name);
    setManualExitNode(name);
  }

  if (!settings) return null;

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between animate-slide-up">
        <div>
          <h1 className="text-xl font-semibold">{t("tailnet.title")}</h1>
          <p className="text-xs text-muted-foreground mt-0.5">{t("tailnet.subtitle")}</p>
        </div>
      </div>

      {/* Setup Section */}
      <div className="rounded-xl border border-white/[0.06] bg-card/40 backdrop-blur-xl p-5 animate-slide-up space-y-4" style={{ animationDelay: "80ms" }}>
        <div className="flex items-center gap-2">
          <Settings2 className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-medium">{t("tailnet.setup")}</h3>
        </div>
        <p className="text-xs text-muted-foreground">{t("tailnet.setupDescription")}</p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">{t("tailnet.oauthClientId")}</label>
            <Input className="bg-muted/30 border-white/[0.06] h-8 text-xs font-mono" value={oauthId} onChange={e => setOauthId(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">{t("tailnet.oauthClientSecret")}</label>
            <Input className="bg-muted/30 border-white/[0.06] h-8 text-xs font-mono" type="password" value={oauthSecret} onChange={e => setOauthSecret(e.target.value)} />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">{t("tailnet.authKey")}</label>
            <Input className="bg-muted/30 border-white/[0.06] h-8 text-xs font-mono" type="password" value={authKey} onChange={e => setAuthKey(e.target.value)} placeholder={t("tailnet.authKeyHint")} />
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">{t("tailnet.hostname")}</label>
            <Input className="bg-muted/30 border-white/[0.06] h-8 text-xs" value={hostname} onChange={e => setHostname(e.target.value)} />
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">{t("tailnet.tags")}</label>
          <Input className="bg-muted/30 border-white/[0.06] h-8 text-xs font-mono" value={tags} onChange={e => setTags(e.target.value)} placeholder="tag:server, tag:calamity" />
        </div>

        <div className="flex items-center gap-2">
          {oauthId && oauthSecret && (
            <Button variant="outline" size="sm" className="border-white/[0.06] text-xs" onClick={handleTestOAuth} disabled={testing}>
              {testing ? <Loader2 className="mr-1.5 h-3 w-3 animate-spin" /> : <Check className="mr-1.5 h-3 w-3" />}
              {testing ? t("tailnet.testing") : t("tailnet.testOAuth")}
            </Button>
          )}
          <Button size="sm" className="text-xs shadow-[0_0_15px_rgba(254,151,185,0.15)]" onClick={handleSave}>
            {t("tailnet.save")}
          </Button>
        </div>
      </div>

      {/* Exit Node */}
      {hasOAuth && (
        <div className="rounded-xl border border-primary/20 bg-primary/[0.04] backdrop-blur-xl p-4 animate-slide-up shadow-[0_0_25px_rgba(254,151,185,0.06)]" style={{ animationDelay: "160ms" }}>
          <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-2">{t("tailnet.exitNode")}</p>
          {currentExitName ? (
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-sm">{currentExitDevice?.name || currentExitName}</p>
                <p className="text-xs text-muted-foreground">{currentExitDevice?.ip || currentExitName}</p>
              </div>
              <Button variant="outline" size="sm" className="border-white/[0.06]" onClick={() => handleSetExitNode("")}>
                {t("tailnet.disconnect")}
              </Button>
            </div>
          ) : hasOAuth ? (
            <p className="text-sm text-muted-foreground">{t("tailnet.noExitNode")}</p>
          ) : (
            <div className="flex items-center gap-2">
              <Input
                className="bg-muted/30 border-white/[0.06] h-8 text-xs flex-1"
                value={manualExitNode}
                onChange={e => setManualExitNode(e.target.value)}
                placeholder={t("tailnet.manualExitNode")}
              />
              <Button size="sm" className="h-8 text-xs" onClick={() => handleSetExitNode(manualExitNode)}>
                <Power className="mr-1 h-3 w-3" /> Set
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Devices */}
      {settings.enabled && hasOAuth && (
        <>
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              {t("tailnet.devicesOnline", { online: onlineCount, total: devices.length })}
            </p>
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={fetchDevices} disabled={loading}>
              <RefreshCw className={cn("mr-1 h-3 w-3", loading && "animate-spin")} />
              {t("tailnet.refreshDevices")}
            </Button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {[...devices]
              .sort((a, b) => {
                if (a.isSelf !== b.isSelf) return a.isSelf ? -1 : 1;
                if ((a.status === "online") !== (b.status === "online")) return a.status === "online" ? -1 : 1;
                return 0;
              })
              .map((device, i) => (
                <DeviceCard
                  key={device.id}
                  device={device}
                  index={i}
                  isCurrentExit={device.name === currentExitName || device.ip === currentExitName}
                  onSetExitNode={handleSetExitNode}
                />
              ))}
          </div>
        </>
      )}

      {!hasOAuth && (
        <p className="text-xs text-muted-foreground text-center py-4">{t("tailnet.noOAuth")}</p>
      )}

      {/* BGP Rule Sync */}
      <div className="rounded-xl border border-white/[0.06] bg-card/40 backdrop-blur-xl p-5 animate-slide-up" style={{ animationDelay: "240ms" }}>
        <button
          type="button"
          onClick={() => navigate("/tailnet/bgp-sync")}
          className="flex w-full items-center justify-between text-left"
        >
          <div className="flex items-center gap-2">
            <RefreshCw className="h-4 w-4 text-primary" />
            <div>
              <h3 className="text-sm font-medium">{t("sidebar.bgpSync")}</h3>
              <p className="text-xs text-muted-foreground">{t("bgpSync.subtitle")}</p>
            </div>
          </div>
          <ArrowRight className="h-4 w-4 text-muted-foreground" />
        </button>
      </div>
    </div>
  );
}
