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
      <h1 className="text-2xl font-semibold">Settings</h1>

      <Card>
        <CardHeader><CardTitle className="text-sm">Appearance</CardTitle></CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Theme</p>
              <p className="text-xs text-muted-foreground">Switch between light and dark mode</p>
            </div>
            <Select value={settings.theme} onValueChange={(v) => setTheme(v as Theme)}>
              <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="light">Light</SelectItem>
                <SelectItem value="dark">Dark</SelectItem>
                <SelectItem value="system">System</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-sm">General</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Auto Start</p>
              <p className="text-xs text-muted-foreground">Launch Calamity at login</p>
            </div>
            <Switch checked={settings.autoStart} onCheckedChange={(v) => updateSettings({ autoStart: v })} />
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">System Proxy</p>
              <p className="text-xs text-muted-foreground">Set as system HTTP/SOCKS proxy</p>
            </div>
            <Switch checked={settings.systemProxy} onCheckedChange={(v) => updateSettings({ systemProxy: v })} />
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Allow LAN</p>
              <p className="text-xs text-muted-foreground">Allow connections from other devices on LAN</p>
            </div>
            <Switch checked={settings.allowLan} onCheckedChange={(v) => updateSettings({ allowLan: v })} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-sm">Ports</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">HTTP Port</p>
            <Input type="number" className="w-24 text-right" value={settings.httpPort} onChange={(e) => updateSettings({ httpPort: parseInt(e.target.value) || 0 })} />
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">SOCKS Port</p>
            <Input type="number" className="w-24 text-right" value={settings.socksPort} onChange={(e) => updateSettings({ socksPort: parseInt(e.target.value) || 0 })} />
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">Mixed Port</p>
            <Input type="number" className="w-24 text-right" value={settings.mixedPort} onChange={(e) => updateSettings({ mixedPort: parseInt(e.target.value) || 0 })} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-sm">SingBox Core</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">Core Path</p>
            <Input className="w-64 text-right font-mono text-xs" value={settings.singboxPath} onChange={(e) => updateSettings({ singboxPath: e.target.value })} />
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">Log Level</p>
            <Select value={settings.logLevel} onValueChange={(v) => updateSettings({ logLevel: v as LogLevel })}>
              <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
              <SelectContent>
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
