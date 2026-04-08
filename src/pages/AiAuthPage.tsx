import { useEffect, useState, useCallback } from "react";
import {
  Shield, Plus, Trash2, Loader2, Check, Download, Monitor,
  ExternalLink, FlaskConical, KeyRound,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { aiAuthService } from "@/services/ai-auth";
import type { AiAuthSettings, AiServiceConfig, AiProvider, AiAuthType } from "@/services/types";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

const PROVIDER_LABELS: Record<AiProvider, string> = {
  open_ai: "OpenAI",
  anthropic: "Anthropic",
  google_gemini: "Google Gemini",
};

const AUTH_TYPE_LABELS: Record<AiAuthType, string> = {
  api_key: "API Key",
  oauth: "OAuth",
};

function generateId(): string {
  return `svc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function emptyService(): AiServiceConfig {
  return {
    id: generateId(),
    provider: "open_ai",
    enabled: true,
    authType: "api_key",
    apiKey: "",
    oauthClientId: "",
    oauthClientSecret: "",
    oauthTokenUrl: "",
    oauthAccessToken: "",
    oauthTokenExpires: "",
    oauthScopes: "",
  };
}

function getTokenStatus(svc: AiServiceConfig): "valid" | "expired" | "not_configured" {
  if (svc.authType !== "oauth") return "not_configured";
  if (!svc.oauthAccessToken) return "not_configured";
  if (svc.oauthTokenExpires) {
    const expires = new Date(svc.oauthTokenExpires);
    if (expires < new Date()) return "expired";
  }
  return "valid";
}

function ServiceCard({
  service,
  index,
  gatewayMode,
  onUpdate,
  onDelete,
  onTest,
}: {
  service: AiServiceConfig;
  index: number;
  gatewayMode: boolean;
  onUpdate: (svc: AiServiceConfig) => void;
  onDelete: (id: string) => void;
  onTest: (provider: string) => void;
}) {
  const { t } = useTranslation();
  const tokenStatus = getTokenStatus(service);

  function update(patch: Partial<AiServiceConfig>) {
    onUpdate({ ...service, ...patch });
  }

  return (
    <div
      className={cn(
        "animate-slide-up rounded-xl border border-white/[0.06] bg-card/40 backdrop-blur-xl p-5 space-y-4 transition-all duration-200 hover:border-white/10 hover:bg-card/80",
        !service.enabled && "opacity-50",
      )}
      style={{ animationDelay: `${(index + 2) * 80}ms` }}
    >
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full border border-white/[0.06] bg-muted/30">
            <KeyRound className="h-4 w-4 text-primary" />
          </div>
          <div>
            <span className="text-sm font-medium">{PROVIDER_LABELS[service.provider]}</span>
            <p className="text-[10px] text-muted-foreground">
              {AUTH_TYPE_LABELS[service.authType]}
              {service.authType === "oauth" && (
                <>
                  {" "}
                  <Badge
                    variant="outline"
                    className={cn(
                      "text-[9px] ml-1",
                      tokenStatus === "valid" && "border-green-500/30 bg-green-500/15 text-green-400",
                      tokenStatus === "expired" && "border-red-500/30 bg-red-500/15 text-red-400",
                      tokenStatus === "not_configured" && "border-muted-foreground/30 bg-muted/15 text-muted-foreground",
                    )}
                  >
                    {t(`aiAuth.tokenStatus.${tokenStatus}`)}
                  </Badge>
                </>
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Switch
            checked={service.enabled}
            onCheckedChange={(checked) => update({ enabled: checked })}
          />
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 text-muted-foreground hover:text-red-400"
            onClick={() => onDelete(service.id)}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Provider + Auth type */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
            {t("aiAuth.provider")}
          </label>
          <Select value={service.provider} onValueChange={(v) => update({ provider: v as AiProvider })}>
            <SelectTrigger className="bg-muted/30 border-white/[0.06] h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="open_ai">OpenAI</SelectItem>
              <SelectItem value="anthropic">Anthropic</SelectItem>
              <SelectItem value="google_gemini">Google Gemini</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
            {t("aiAuth.authType")}
          </label>
          <Select value={service.authType} onValueChange={(v) => update({ authType: v as AiAuthType })}>
            <SelectTrigger className="bg-muted/30 border-white/[0.06] h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="api_key">API Key</SelectItem>
              <SelectItem value="oauth">OAuth</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* API Key field */}
      {service.authType === "api_key" && (
        <div className="space-y-1.5">
          <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
            API Key
          </label>
          <Input
            className="bg-muted/30 border-white/[0.06] h-8 text-xs font-mono"
            type="password"
            value={service.apiKey}
            onChange={(e) => update({ apiKey: e.target.value })}
            placeholder="sk-..."
          />
        </div>
      )}

      {/* OAuth fields */}
      {service.authType === "oauth" && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                {t("aiAuth.oauthClientId")}
              </label>
              <Input
                className="bg-muted/30 border-white/[0.06] h-8 text-xs font-mono"
                value={service.oauthClientId}
                onChange={(e) => update({ oauthClientId: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                {t("aiAuth.oauthClientSecret")}
              </label>
              <Input
                className="bg-muted/30 border-white/[0.06] h-8 text-xs font-mono"
                type="password"
                value={service.oauthClientSecret}
                onChange={(e) => update({ oauthClientSecret: e.target.value })}
              />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                {t("aiAuth.oauthTokenUrl")}
              </label>
              <Input
                className="bg-muted/30 border-white/[0.06] h-8 text-xs font-mono"
                value={service.oauthTokenUrl}
                onChange={(e) => update({ oauthTokenUrl: e.target.value })}
                placeholder="https://..."
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                {t("aiAuth.oauthScopes")}
              </label>
              <Input
                className="bg-muted/30 border-white/[0.06] h-8 text-xs font-mono"
                value={service.oauthScopes}
                onChange={(e) => update({ oauthScopes: e.target.value })}
                placeholder="openid profile"
              />
            </div>
          </div>
        </>
      )}

      {/* Test button */}
      {gatewayMode && (
        <Button
          variant="outline"
          size="sm"
          className="border-white/[0.06] text-xs"
          onClick={() => onTest(service.provider)}
        >
          <FlaskConical className="mr-1.5 h-3 w-3" />
          {t("aiAuth.testConnection")}
        </Button>
      )}
    </div>
  );
}

export function AiAuthSection({ gatewayMode: gatewayModeProp }: { gatewayMode: boolean }) {
  const { t } = useTranslation();
  const [settings, setSettings] = useState<AiAuthSettings | null>(null);
  const gatewayMode = gatewayModeProp;
  const [saving, setSaving] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [_testing, setTesting] = useState<string | null>(null);

  const fetchSettings = useCallback(async () => {
    try {
      const aiSettings = await aiAuthService.getSettings();
      setSettings(aiSettings);
    } catch (e: any) {
      toast.error(e?.message || String(e));
    }
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  function updateService(updated: AiServiceConfig) {
    if (!settings) return;
    setSettings({
      ...settings,
      services: settings.services.map((s) => (s.id === updated.id ? updated : s)),
    });
  }

  function deleteService(id: string) {
    if (!settings) return;
    setSettings({
      ...settings,
      services: settings.services.filter((s) => s.id !== id),
    });
  }

  function addService() {
    if (!settings) return;
    setSettings({
      ...settings,
      services: [...settings.services, emptyService()],
    });
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
    setExporting(true);
    try {
      const path = await aiAuthService.exportCaCert();
      toast.success(t("aiAuth.caExported", { path }));
    } catch (e: any) {
      toast.error(e?.message || String(e));
    } finally {
      setExporting(false);
    }
  }

  async function handleTest(provider: string) {
    setTesting(provider);
    try {
      await aiAuthService.test(provider);
      toast.success(t("aiAuth.testSuccess"));
    } catch (e: any) {
      toast.error(e?.message || String(e));
    } finally {
      setTesting(null);
    }
  }

  async function handleRefreshTokens() {
    try {
      await aiAuthService.refreshTokens();
      await fetchSettings();
      toast.success(t("aiAuth.tokensRefreshed"));
    } catch (e: any) {
      toast.error(e?.message || String(e));
    }
  }

  if (!settings) return null;

  return (
    <div className="space-y-4 mt-4">
      {/* Master toggle */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-primary" />
            <div>
              <h3 className="text-sm font-medium">{t("aiAuth.masterToggle")}</h3>
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

        <div className="space-y-1.5">
          <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
            {t("aiAuth.proxyPort")}
          </label>
          <Input
            className="bg-muted/30 border-white/[0.06] h-8 text-xs font-mono w-32"
            type="number"
            value={settings.proxyPort}
            onChange={(e) => setSettings({ ...settings, proxyPort: parseInt(e.target.value) || 8443 })}
          />
        </div>
      </div>

      {/* Services */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          {t("aiAuth.servicesCount", { count: settings.services.length })}
        </p>
        <div className="flex items-center gap-2">
          {settings.services.some((s) => s.authType === "oauth") && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={handleRefreshTokens}
            >
              {t("aiAuth.refreshTokens")}
            </Button>
          )}
          <Button variant="outline" size="sm" className="border-white/[0.06] text-xs" onClick={addService}>
            <Plus className="mr-1.5 h-3 w-3" />
            {t("aiAuth.addService")}
          </Button>
        </div>
      </div>

      <div className="space-y-3">
        {settings.services.map((svc, i) => (
          <ServiceCard
            key={svc.id}
            service={svc}
            index={i}
            gatewayMode={gatewayMode}
            onUpdate={updateService}
            onDelete={deleteService}
            onTest={handleTest}
          />
        ))}
        {settings.services.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-6">
            {t("aiAuth.noServices")}
          </p>
        )}
      </div>

      {/* CA Certificate */}
      <div className="rounded-lg border border-white/[0.06] bg-muted/20 p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Shield className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-medium">{t("aiAuth.caCertificate")}</h3>
        </div>
        <p className="text-xs text-muted-foreground">{t("aiAuth.caCertDesc")}</p>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="border-white/[0.06] text-xs"
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
            className="border-white/[0.06] text-xs"
            onClick={handleExportCa}
            disabled={exporting}
          >
            {exporting
              ? <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
              : <Download className="mr-1.5 h-3 w-3" />}
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
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          className="text-xs shadow-[0_0_15px_rgba(254,151,185,0.15)]"
          onClick={handleSave}
          disabled={saving}
        >
          {saving
            ? <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
            : <Check className="mr-1.5 h-3 w-3" />}
          {saving ? t("aiAuth.saving") : t("aiAuth.save")}
        </Button>
      </div>
    </div>
  );
}
