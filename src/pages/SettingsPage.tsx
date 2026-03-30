import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Shield, Check } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useSettingsStore } from "@/stores/settings";
import type { Language, LogLevel, Theme } from "@/services/types";

export function SettingsPage() {
  const { t } = useTranslation();
  const { settings, tunStatus, fetchSettings, updateSettings, setTheme } = useSettingsStore();

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  if (!settings) return null;

  const tunEnabled = tunStatus?.targetEnhancedMode ?? settings.enhancedMode;
  const tunRunning = tunStatus?.running ?? false;
  const tunLastError = tunStatus?.lastError;
  const [sudoersInstalled, setSudoersInstalled] = useState<boolean | null>(null);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    if (tunEnabled) {
      (async () => {
        try {
          const { invoke } = await import("@tauri-apps/api/core");
          const ok = await invoke<boolean>("check_tun_sudoers");
          setSudoersInstalled(ok);
        } catch { setSudoersInstalled(false); }
      })();
    }
  }, [tunEnabled]);

  const handleInstallSudoers = async () => {
    setInstalling(true);
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const ok = await invoke<boolean>("install_tun_sudoers");
      setSudoersInstalled(ok);
    } catch { /* ignore */ }
    setInstalling(false);
  };

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-semibold animate-slide-up">{t("settings.title")}</h1>

      <Card className="animate-slide-up rounded-xl border border-white/[0.06] bg-card/40 backdrop-blur-xl shadow-[0_0_20px_rgba(254,151,185,0.08)] transition-all duration-200 hover:border-white/10 hover:bg-card/80" style={{ animationDelay: "80ms" }}>
        <CardHeader><CardTitle className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">{t("settings.appearance")}</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">{t("common.language")}</p>
              <p className="text-xs text-muted-foreground">{t("settings.languageDescription")}</p>
            </div>
            <Select value={settings.language} onValueChange={(v) => updateSettings({ language: v as Language })}>
              <SelectTrigger className="w-36 bg-muted/30 border-white/[0.06]"><SelectValue /></SelectTrigger>
              <SelectContent className="border-white/[0.06] bg-card/90 backdrop-blur-2xl">
                <SelectItem value="system">{t("common.languages.system")}</SelectItem>
                <SelectItem value="en">{t("common.languages.english")}</SelectItem>
                <SelectItem value="zh-CN">{t("common.languages.chinese")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Separator className="bg-white/[0.04]" />
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">{t("settings.theme")}</p>
              <p className="text-xs text-muted-foreground">{t("settings.themeDescription")}</p>
            </div>
            <Select value={settings.theme} onValueChange={(v) => setTheme(v as Theme)}>
              <SelectTrigger className="w-32 bg-muted/30 border-white/[0.06]"><SelectValue /></SelectTrigger>
              <SelectContent className="border-white/[0.06] bg-card/90 backdrop-blur-2xl">
                <SelectItem value="light">{t("common.theme.light")}</SelectItem>
                <SelectItem value="dark">{t("common.theme.dark")}</SelectItem>
                <SelectItem value="system">{t("common.theme.system")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card className="animate-slide-up rounded-xl border border-white/[0.06] bg-card/40 backdrop-blur-xl shadow-[0_0_20px_rgba(254,151,185,0.08)] transition-all duration-200 hover:border-white/10 hover:bg-card/80" style={{ animationDelay: "160ms" }}>
        <CardHeader><CardTitle className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">{t("settings.general")}</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">{t("settings.autoStart")}</p>
              <p className="text-xs text-muted-foreground">{t("settings.autoStartDescription")}</p>
            </div>
            <Switch checked={settings.autoStart} onCheckedChange={(v) => updateSettings({ autoStart: v })} />
          </div>
          <Separator className="bg-white/[0.04]" />
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">{t("settings.systemProxy")}</p>
              <p className="text-xs text-muted-foreground">
                {tunEnabled ? t("settings.tunProxyConflict") : t("settings.systemProxyDescription")}
              </p>
            </div>
            <Switch
              checked={settings.systemProxy}
              disabled={tunEnabled}
              onCheckedChange={(v) => updateSettings({ systemProxy: v })}
            />
          </div>
          <Separator className="bg-white/[0.04]" />
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">{t("settings.enhancedMode")}</p>
              <p className="text-xs text-muted-foreground">{t("settings.enhancedModeDescription")}</p>
            </div>
            <Switch checked={settings.enhancedMode} onCheckedChange={(v) => updateSettings({ enhancedMode: v })} />
          </div>
          {tunEnabled && (
            <>
              <div className="rounded-lg border border-white/[0.04] bg-muted/10 p-3 space-y-3">
                <div className="space-y-1">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{t("settings.tunStatus")}</p>
                  <p className="text-sm font-medium">{tunRunning ? t("settings.tunRunning") : t("settings.tunStopped")}</p>
                  <p className="text-xs text-muted-foreground">{t("settings.tunRequiresAdmin")}</p>
                  {tunLastError ? (
                    <p className="text-xs text-destructive">{t("settings.tunLastError", { error: tunLastError })}</p>
                  ) : null}
                  <div className="flex items-center gap-2 pt-1">
                    {sudoersInstalled ? (
                      <span className="flex items-center gap-1 text-xs text-green-500">
                        <Check className="h-3 w-3" /> {t("settings.tunSudoersInstalled")}
                      </span>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs border-white/[0.06]"
                        disabled={installing}
                        onClick={handleInstallSudoers}
                      >
                        <Shield className="h-3 w-3 mr-1" />
                        {installing ? t("settings.tunSudoersInstalling") : t("settings.tunSudoersInstall")}
                      </Button>
                    )}
                  </div>
                </div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{t("settings.tunConfiguration")}</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">{t("settings.stack")}</p>
                    <Select
                      value={settings.tunConfig.stack}
                      onValueChange={(v) => updateSettings({ tunConfig: { ...settings.tunConfig, stack: v as "system" | "gvisor" | "mixed" } })}
                    >
                      <SelectTrigger className="bg-muted/30 border-white/[0.06] h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="system">{t("common.theme.system")}</SelectItem>
                        <SelectItem value="gvisor">gVisor</SelectItem>
                        <SelectItem value="mixed">Mixed</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">{t("settings.mtu")}</p>
                    <Input
                      type="number"
                      className="bg-muted/30 border-white/[0.06] h-8 text-xs"
                      value={settings.tunConfig.mtu}
                      onChange={(e) => updateSettings({ tunConfig: { ...settings.tunConfig, mtu: parseInt(e.target.value) || 9000 } })}
                    />
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <p className="text-xs">{t("settings.autoRoute")}</p>
                  <Switch checked={settings.tunConfig.autoRoute} onCheckedChange={(v) => updateSettings({ tunConfig: { ...settings.tunConfig, autoRoute: v } })} />
                </div>
                <div className="flex items-center justify-between">
                  <p className="text-xs">{t("settings.strictRoute")}</p>
                  <Switch checked={settings.tunConfig.strictRoute} onCheckedChange={(v) => updateSettings({ tunConfig: { ...settings.tunConfig, strictRoute: v } })} />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">{t("settings.dnsHijack")}</p>
                  <Input
                    className="bg-muted/30 border-white/[0.06] h-8 text-xs font-mono"
                    value={settings.tunConfig.dnsHijack.join(", ")}
                    onChange={(e) => updateSettings({ tunConfig: { ...settings.tunConfig, dnsHijack: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) } })}
                  />
                </div>
              </div>
            </>
          )}
          <Separator className="bg-white/[0.04]" />
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">{t("settings.allowLan")}</p>
              <p className="text-xs text-muted-foreground">{t("settings.allowLanDescription")}</p>
            </div>
            <Switch checked={settings.allowLan} onCheckedChange={(v) => updateSettings({ allowLan: v })} />
          </div>
        </CardContent>
      </Card>

      <Card className="animate-slide-up rounded-xl border border-white/[0.06] bg-card/40 backdrop-blur-xl shadow-[0_0_20px_rgba(254,151,185,0.08)] transition-all duration-200 hover:border-white/10 hover:bg-card/80" style={{ animationDelay: "240ms" }}>
        <CardHeader><CardTitle className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">{t("settings.ports")}</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">{t("settings.httpPort")}</p>
            <Input type="number" className="w-24 text-right bg-muted/30 border-white/[0.06]" value={settings.httpPort} onChange={(e) => updateSettings({ httpPort: parseInt(e.target.value) || 0 })} />
          </div>
          <Separator className="bg-white/[0.04]" />
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">{t("settings.socksPort")}</p>
            <Input type="number" className="w-24 text-right bg-muted/30 border-white/[0.06]" value={settings.socksPort} onChange={(e) => updateSettings({ socksPort: parseInt(e.target.value) || 0 })} />
          </div>
          <Separator className="bg-white/[0.04]" />
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">{t("settings.mixedPort")}</p>
            <Input type="number" className="w-24 text-right bg-muted/30 border-white/[0.06]" value={settings.mixedPort} onChange={(e) => updateSettings({ mixedPort: parseInt(e.target.value) || 0 })} />
          </div>
        </CardContent>
      </Card>

      <Card className="animate-slide-up rounded-xl border border-white/[0.06] bg-card/40 backdrop-blur-xl shadow-[0_0_20px_rgba(254,151,185,0.08)] transition-all duration-200 hover:border-white/10 hover:bg-card/80" style={{ animationDelay: "320ms" }}>
        <CardHeader><CardTitle className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">{t("settings.singboxCore")}</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">{t("settings.corePath")}</p>
            <Input className="w-64 text-right font-mono text-xs bg-muted/30 border-white/[0.06]" value={settings.singboxPath} onChange={(e) => updateSettings({ singboxPath: e.target.value })} />
          </div>
          <Separator className="bg-white/[0.04]" />
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">{t("settings.logLevel")}</p>
            <Select value={settings.logLevel} onValueChange={(v) => updateSettings({ logLevel: v as LogLevel })}>
              <SelectTrigger className="w-32 bg-muted/30 border-white/[0.06]"><SelectValue /></SelectTrigger>
              <SelectContent className="border-white/[0.06] bg-card/90 backdrop-blur-2xl">
                <SelectItem value="debug">{t("settings.logLevels.debug")}</SelectItem>
                <SelectItem value="info">{t("settings.logLevels.info")}</SelectItem>
                <SelectItem value="warn">{t("settings.logLevels.warn")}</SelectItem>
                <SelectItem value="error">{t("settings.logLevels.error")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
