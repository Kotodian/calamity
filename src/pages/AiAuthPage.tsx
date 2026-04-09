import { useEffect, useState, useCallback } from "react";
import {
  Shield, Check, Download, Monitor, ExternalLink, FlaskConical,
  Loader2, RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { aiAuthService } from "@/services/ai-auth";
import type { AiAuthSettings, AiProvider, ProviderStatus } from "@/services/types";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

export function AiAuthSection({ gatewayMode }: { gatewayMode: boolean }) {
  const { t } = useTranslation();
  const [settings, setSettings] = useState<AiAuthSettings | null>(null);
  const [providers, setProviders] = useState<ProviderStatus[]>([]);
  const [saving, setSaving] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [installing, setInstalling] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [s, p] = await Promise.all([
        aiAuthService.getSettings(),
        aiAuthService.scanProviders(),
      ]);
      setSettings(s);
      setProviders(p);
    } catch (e: any) {
      toast.error(e?.message || String(e));
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  async function handleScan() {
    setScanning(true);
    try {
      const p = await aiAuthService.scanProviders();
      setProviders(p);
      toast.success(t("aiAuth.scanComplete"));
    } catch (e: any) {
      toast.error(e?.message || String(e));
    } finally {
      setScanning(false);
    }
  }

  function toggleProvider(provider: AiProvider, enabled: boolean) {
    if (!settings) return;
    const current = new Set(settings.providers);
    if (enabled) {
      current.add(provider);
    } else {
      current.delete(provider);
    }
    setSettings({ ...settings, providers: Array.from(current) });
  }

  async function handleSave() {
    if (!settings) return;
    setSaving(true);
    try {
      await aiAuthService.updateSettings(settings);
      toast.success(t("aiAuth.saved"));
    } catch (e: any) {
      toast.error(e?.message || String(e));
    } finally {
      setSaving(false);
    }
  }

  async function handleInstallCa() {
    setInstalling(true);
    try {
      await aiAuthService.installCaCert();
      toast.success(t("aiAuth.caInstalled"));
    } catch (e: any) {
      toast.error(e?.message || String(e));
    } finally {
      setInstalling(false);
    }
  }

  async function handleExportCa() {
    try {
      const path = await aiAuthService.exportCaCert();
      toast.success(t("aiAuth.caExported", { path }));
    } catch (e: any) {
      toast.error(e?.message || String(e));
    }
  }

  async function handleTest(provider: string) {
    try {
      const result = await aiAuthService.test(provider);
      toast.success(result);
    } catch (e: any) {
      toast.error(e?.message || String(e));
    }
  }

  if (!settings) return null;

  return (
    <div className="space-y-4 mt-4">
      {/* Master toggle */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Shield className="h-4 w-4 text-primary" />
          <div>
            <p className="text-sm font-medium">{t("aiAuth.masterToggle")}</p>
            <p className="text-xs text-muted-foreground">
              {gatewayMode
                ? t("aiAuth.masterToggleDesc")
                : t("aiAuth.requiresGateway")}
            </p>
          </div>
        </div>
        <Switch
          checked={settings.enabled}
          onCheckedChange={(checked) => setSettings({ ...settings, enabled: checked })}
          disabled={!gatewayMode}
        />
      </div>

      {!gatewayMode && (
        <p className="text-xs text-yellow-400/80 bg-yellow-400/5 rounded-lg px-3 py-2">
          {t("aiAuth.gatewayModeRequired")}
        </p>
      )}

      {/* Provider list — auto-discovered credentials */}
      {settings.enabled && gatewayMode && (
        <>
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
              {t("aiAuth.detectedCredentials")}
            </p>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={handleScan}
              disabled={scanning}
            >
              <RefreshCw className={cn("mr-1.5 h-3 w-3", scanning && "animate-spin")} />
              {t("aiAuth.rescan")}
            </Button>
          </div>

          <div className="space-y-2">
            {providers.map((p) => (
              <div
                key={p.provider}
                className={cn(
                  "rounded-lg border border-white/[0.06] bg-muted/20 p-3 flex items-center justify-between transition-all",
                  !p.credentialFound && "opacity-50",
                )}
              >
                <div className="flex items-center gap-3">
                  <div>
                    <p className="text-sm font-medium">{p.name}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      {p.credentialFound ? (
                        <Badge
                          variant="outline"
                          className="text-[9px] border-green-500/30 bg-green-500/15 text-green-400"
                        >
                          {p.source}
                        </Badge>
                      ) : (
                        <Badge
                          variant="outline"
                          className="text-[9px] border-muted-foreground/30 text-muted-foreground"
                        >
                          {t("aiAuth.notFound")}
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {p.credentialFound && settings.providers.includes(p.provider) && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => handleTest(p.provider)}
                    >
                      <FlaskConical className="h-3 w-3" />
                    </Button>
                  )}
                  <Switch
                    checked={settings.providers.includes(p.provider)}
                    onCheckedChange={(v) => toggleProvider(p.provider, v)}
                    disabled={!p.credentialFound}
                  />
                </div>
              </div>
            ))}
          </div>

          {/* CA Certificate */}
          <div className="rounded-lg border border-white/[0.06] bg-muted/20 p-3 space-y-2">
            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
              {t("aiAuth.caCertificate")}
            </p>
            <p className="text-xs text-muted-foreground">{t("aiAuth.caCertDesc")}</p>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="border-white/[0.06] text-xs h-7"
                onClick={handleInstallCa}
                disabled={installing}
              >
                {installing
                  ? <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
                  : <Monitor className="mr-1.5 h-3 w-3" />}
                {t("aiAuth.installCa")}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="border-white/[0.06] text-xs h-7"
                onClick={handleExportCa}
              >
                <Download className="mr-1.5 h-3 w-3" />
                {t("aiAuth.exportCa")}
              </Button>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <ExternalLink className="h-3 w-3" />
              <span>{t("aiAuth.lanDownload")}</span>
              <code className="rounded bg-muted/30 px-1.5 py-0.5 font-mono text-[11px]">
                http://gateway-ip:8900
              </code>
            </div>
          </div>

          {/* Save */}
          <Button
            size="sm"
            className="text-xs"
            onClick={handleSave}
            disabled={saving}
          >
            {saving
              ? <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
              : <Check className="mr-1.5 h-3 w-3" />}
            {saving ? t("aiAuth.saving") : t("aiAuth.save")}
          </Button>
        </>
      )}
    </div>
  );
}
