import { useEffect } from "react";
import { Monitor, Smartphone, Server, LogOut, LogIn, Network, User, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useTailnetStore } from "@/stores/tailnet";
import { cn } from "@/lib/utils";
import type { TailnetDevice } from "@/services/types";

function deviceIcon(os: string) {
  switch (os.toLowerCase()) {
    case "macos": case "windows": case "linux": return Monitor;
    case "ios": case "android": return Smartphone;
    default: return Server;
  }
}

function DeviceCard({ device, index, onSetExitNode }: { device: TailnetDevice; index: number; onSetExitNode: (id: string | null) => void }) {
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
            {device.isSelf && <Badge variant="outline" className="text-[10px] border-primary/30 bg-primary/15 text-primary">This device</Badge>}
            <span className="relative">
              <span className={cn("block h-2 w-2 rounded-full", isOnline ? "bg-green-500" : "bg-muted-foreground/40")} />
              {isOnline && <span className="absolute inset-0 h-2 w-2 rounded-full bg-green-500 animate-ping opacity-75" />}
            </span>
          </div>
          <p className="text-xs text-muted-foreground">{device.ip} • {device.os} • {device.hostname}</p>
        </div>
        {device.isExitNode && !device.isSelf && (
          <Button
            variant={device.isCurrentExitNode ? "default" : "outline"}
            size="sm"
            className={cn(
              "transition-all duration-200",
              device.isCurrentExitNode ? "shadow-[0_0_15px_rgba(254,151,185,0.15)]" : "border-white/[0.06]"
            )}
            onClick={() => onSetExitNode(device.isCurrentExitNode ? null : device.id)}
            disabled={!isOnline}
          >
            <LogOut className="mr-2 h-3.5 w-3.5" />
            {device.isCurrentExitNode ? "Active" : "Exit Node"}
          </Button>
        )}
      </div>
    </div>
  );
}

function LoginPanel({ onLogin, loggingIn }: { onLogin: () => void; loggingIn: boolean }) {
  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="text-center space-y-6 animate-slide-up">
        <div className="mx-auto h-20 w-20 rounded-full border border-white/[0.06] bg-muted/30 flex items-center justify-center">
          <Network className="h-10 w-10 text-muted-foreground" />
        </div>
        <div>
          <h2 className="text-lg font-semibold mb-1">Connect to Tailscale</h2>
          <p className="text-sm text-muted-foreground max-w-xs mx-auto">
            Sign in to your Tailscale account to access your mesh network devices
          </p>
        </div>
        <Button
          onClick={onLogin}
          disabled={loggingIn}
          className="shadow-[0_0_20px_rgba(254,151,185,0.15)] px-6"
        >
          {loggingIn ? (
            <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Connecting...</>
          ) : (
            <><LogIn className="mr-2 h-4 w-4" /> Sign in with Tailscale</>
          )}
        </Button>
        <p className="text-[10px] text-muted-foreground/50">
          This will open the Tailscale login flow in your browser
        </p>
      </div>
    </div>
  );
}

export function TailnetPage() {
  const { account, devices, loggingIn, fetchAccount, login, logout, fetchDevices, setExitNode } = useTailnetStore();

  useEffect(() => {
    fetchAccount();
  }, [fetchAccount]);

  useEffect(() => {
    if (account?.loggedIn) fetchDevices();
  }, [account?.loggedIn, fetchDevices]);

  const onlineCount = devices.filter((d) => d.status === "online").length;
  const currentExit = devices.find((d) => d.isCurrentExitNode);

  // Not logged in
  if (!account?.loggedIn) {
    return (
      <div className="p-6 flex flex-col min-h-full">
        <div className="animate-slide-up">
          <h1 className="text-xl font-semibold">Tailnet</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Mesh VPN powered by Tailscale</p>
        </div>
        <LoginPanel onLogin={login} loggingIn={loggingIn} />
      </div>
    );
  }

  // Logged in
  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between animate-slide-up">
        <div>
          <h1 className="text-xl font-semibold">Tailnet</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {onlineCount}/{devices.length} devices online
            {currentExit && ` • Exit node: ${currentExit.name}`}
          </p>
        </div>
      </div>

      {/* Account Card */}
      <div className="rounded-xl border border-white/[0.06] bg-card/40 backdrop-blur-xl p-4 flex items-center justify-between animate-slide-up" style={{ animationDelay: "80ms" }}>
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-full bg-primary/15 flex items-center justify-center">
            <User className="h-4 w-4 text-primary" />
          </div>
          <div>
            <p className="text-sm font-medium">{account.loginName}</p>
            <p className="text-[10px] text-muted-foreground">{account.tailnetName}</p>
          </div>
        </div>
        <Button variant="outline" size="sm" className="border-white/[0.06] text-xs" onClick={logout}>
          <LogOut className="mr-1.5 h-3 w-3" />
          Sign Out
        </Button>
      </div>

      {/* Exit Node */}
      <div className="rounded-xl border border-primary/20 bg-primary/[0.04] backdrop-blur-xl p-4 animate-slide-up shadow-[0_0_25px_rgba(254,151,185,0.06)]" style={{ animationDelay: "160ms" }}>
        <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-2">Exit Node</p>
        {currentExit ? (
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-sm">{currentExit.name}</p>
              <p className="text-xs text-muted-foreground">{currentExit.ip}</p>
            </div>
            <Button variant="outline" size="sm" className="border-white/[0.06]" onClick={() => setExitNode(null)}>
              Disconnect
            </Button>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No exit node selected</p>
        )}
      </div>

      {/* Devices */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {devices.map((device, i) => (
          <DeviceCard key={device.id} device={device} index={i} onSetExitNode={setExitNode} />
        ))}
      </div>
    </div>
  );
}
