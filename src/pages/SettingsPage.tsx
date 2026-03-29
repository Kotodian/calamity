import { useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useSettingsStore } from "@/stores/settings";
import type { LogLevel, Theme } from "@/services/types";

export function SettingsPage() {
  const { settings, fetchSettings, updateSettings, setTheme } = useSettingsStore();

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  if (!settings) return null;

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-semibold animate-slide-up">Settings</h1>

      <Card className="animate-slide-up rounded-xl border border-white/[0.06] bg-card/40 backdrop-blur-xl shadow-[0_0_20px_rgba(254,151,185,0.08)] transition-all duration-200 hover:border-white/10 hover:bg-card/80" style={{ animationDelay: "80ms" }}>
        <CardHeader><CardTitle className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Appearance</CardTitle></CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Theme</p>
              <p className="text-xs text-muted-foreground">Switch between light and dark mode</p>
            </div>
            <Select value={settings.theme} onValueChange={(v) => setTheme(v as Theme)}>
              <SelectTrigger className="w-32 bg-muted/30 border-white/[0.06]"><SelectValue /></SelectTrigger>
              <SelectContent className="border-white/[0.06] bg-card/90 backdrop-blur-2xl">
                <SelectItem value="light">Light</SelectItem>
                <SelectItem value="dark">Dark</SelectItem>
                <SelectItem value="system">System</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card className="animate-slide-up rounded-xl border border-white/[0.06] bg-card/40 backdrop-blur-xl shadow-[0_0_20px_rgba(254,151,185,0.08)] transition-all duration-200 hover:border-white/10 hover:bg-card/80" style={{ animationDelay: "160ms" }}>
        <CardHeader><CardTitle className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">General</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Auto Start</p>
              <p className="text-xs text-muted-foreground">Launch Calamity at login</p>
            </div>
            <Switch checked={settings.autoStart} onCheckedChange={(v) => updateSettings({ autoStart: v })} />
          </div>
          <Separator className="bg-white/[0.04]" />
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">System Proxy</p>
              <p className="text-xs text-muted-foreground">Set as system HTTP/SOCKS proxy</p>
            </div>
            <Switch checked={settings.systemProxy} onCheckedChange={(v) => updateSettings({ systemProxy: v })} />
          </div>
          <Separator className="bg-white/[0.04]" />
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Enhanced Mode</p>
              <p className="text-xs text-muted-foreground">TUN mode — capture all system traffic (requires root)</p>
            </div>
            <Switch checked={settings.enhancedMode} onCheckedChange={(v) => updateSettings({ enhancedMode: v })} />
          </div>
          {settings.enhancedMode && (
            <>
              <div className="rounded-lg border border-white/[0.04] bg-muted/10 p-3 space-y-3">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">TUN Configuration</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Stack</p>
                    <Select
                      value={settings.tunConfig.stack}
                      onValueChange={(v) => updateSettings({ tunConfig: { ...settings.tunConfig, stack: v as "system" | "gvisor" | "mixed" } })}
                    >
                      <SelectTrigger className="bg-muted/30 border-white/[0.06] h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="system">System</SelectItem>
                        <SelectItem value="gvisor">gVisor</SelectItem>
                        <SelectItem value="mixed">Mixed</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">MTU</p>
                    <Input
                      type="number"
                      className="bg-muted/30 border-white/[0.06] h-8 text-xs"
                      value={settings.tunConfig.mtu}
                      onChange={(e) => updateSettings({ tunConfig: { ...settings.tunConfig, mtu: parseInt(e.target.value) || 9000 } })}
                    />
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <p className="text-xs">Auto Route</p>
                  <Switch checked={settings.tunConfig.autoRoute} onCheckedChange={(v) => updateSettings({ tunConfig: { ...settings.tunConfig, autoRoute: v } })} />
                </div>
                <div className="flex items-center justify-between">
                  <p className="text-xs">Strict Route</p>
                  <Switch checked={settings.tunConfig.strictRoute} onCheckedChange={(v) => updateSettings({ tunConfig: { ...settings.tunConfig, strictRoute: v } })} />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">DNS Hijack</p>
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
              <p className="text-sm font-medium">Allow LAN</p>
              <p className="text-xs text-muted-foreground">Allow connections from other devices on LAN</p>
            </div>
            <Switch checked={settings.allowLan} onCheckedChange={(v) => updateSettings({ allowLan: v })} />
          </div>
        </CardContent>
      </Card>

      <Card className="animate-slide-up rounded-xl border border-white/[0.06] bg-card/40 backdrop-blur-xl shadow-[0_0_20px_rgba(254,151,185,0.08)] transition-all duration-200 hover:border-white/10 hover:bg-card/80" style={{ animationDelay: "240ms" }}>
        <CardHeader><CardTitle className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Ports</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">HTTP Port</p>
            <Input type="number" className="w-24 text-right bg-muted/30 border-white/[0.06]" value={settings.httpPort} onChange={(e) => updateSettings({ httpPort: parseInt(e.target.value) || 0 })} />
          </div>
          <Separator className="bg-white/[0.04]" />
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">SOCKS Port</p>
            <Input type="number" className="w-24 text-right bg-muted/30 border-white/[0.06]" value={settings.socksPort} onChange={(e) => updateSettings({ socksPort: parseInt(e.target.value) || 0 })} />
          </div>
          <Separator className="bg-white/[0.04]" />
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">Mixed Port</p>
            <Input type="number" className="w-24 text-right bg-muted/30 border-white/[0.06]" value={settings.mixedPort} onChange={(e) => updateSettings({ mixedPort: parseInt(e.target.value) || 0 })} />
          </div>
        </CardContent>
      </Card>

      <Card className="animate-slide-up rounded-xl border border-white/[0.06] bg-card/40 backdrop-blur-xl shadow-[0_0_20px_rgba(254,151,185,0.08)] transition-all duration-200 hover:border-white/10 hover:bg-card/80" style={{ animationDelay: "320ms" }}>
        <CardHeader><CardTitle className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">SingBox Core</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">Core Path</p>
            <Input className="w-64 text-right font-mono text-xs bg-muted/30 border-white/[0.06]" value={settings.singboxPath} onChange={(e) => updateSettings({ singboxPath: e.target.value })} />
          </div>
          <Separator className="bg-white/[0.04]" />
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">Log Level</p>
            <Select value={settings.logLevel} onValueChange={(v) => updateSettings({ logLevel: v as LogLevel })}>
              <SelectTrigger className="w-32 bg-muted/30 border-white/[0.06]"><SelectValue /></SelectTrigger>
              <SelectContent className="border-white/[0.06] bg-card/90 backdrop-blur-2xl">
                <SelectItem value="debug">Debug</SelectItem>
                <SelectItem value="info">Info</SelectItem>
                <SelectItem value="warn">Warning</SelectItem>
                <SelectItem value="error">Error</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
