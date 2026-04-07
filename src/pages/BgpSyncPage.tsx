import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useBgpSyncStore } from "../stores/bgp-sync";
import type { SyncStatus } from "../services/bgp-sync";
import { Switch } from "../components/ui/switch";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "../components/ui/dialog";
import { Plus, Trash2, Search, Loader2, Square, RefreshCw } from "lucide-react";

function SyncStatusBadge({ status }: { status: SyncStatus }) {
  const { t } = useTranslation();

  if (status === "synced") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-green-400">
        <span className="h-2 w-2 rounded-full bg-green-400" />
        {t("bgpSync.statusSynced")}
      </span>
    );
  }
  if (status === "connecting") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-yellow-400">
        <span className="h-2 w-2 rounded-full bg-yellow-400" />
        {t("bgpSync.statusConnecting")}
      </span>
    );
  }
  if (typeof status === "object" && "reconnecting" in status) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-orange-400">
        <span className="h-2 w-2 rounded-full bg-orange-400" />
        {t("bgpSync.statusReconnecting", { attempt: status.reconnecting.attempt })}
      </span>
    );
  }
  return null;
}

function SourceBadge({ source }: { source: "mdns" | "tailscale" }) {
  const label = source === "mdns" ? "LAN" : "Tailscale";
  const className =
    source === "mdns"
      ? "bg-blue-500/20 text-blue-400"
      : "bg-purple-500/20 text-purple-400";
  return (
    <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium ${className}`}>
      {label}
    </span>
  );
}

export function BgpSyncPage() {
  const { t } = useTranslation();
  const {
    settings,
    discoveredPeers,
    discovering,
    syncStatus,
    activePeer,
    fetchSettings,
    setEnabled,
    addPeer,
    removePeer,
    discoverPeers,
    startSync,
    stopSync,
    fetchSyncStatus,
  } = useBgpSyncStore();

  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [peerName, setPeerName] = useState("");
  const [peerAddress, setPeerAddress] = useState("");
  const [discoverDialogOpen, setDiscoverDialogOpen] = useState(false);
  const [enableLoading, setEnableLoading] = useState(false);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  // Poll sync status while activePeer is set
  useEffect(() => {
    if (!activePeer) return;
    const interval = setInterval(() => {
      fetchSyncStatus();
    }, 5000);
    return () => clearInterval(interval);
  }, [activePeer, fetchSyncStatus]);

  async function handleToggle(enabled: boolean) {
    setEnableLoading(true);
    try {
      await setEnabled(enabled);
    } catch (e) {
      toast.error(String(e));
    } finally {
      setEnableLoading(false);
    }
  }

  async function handleAddPeer() {
    if (!peerName.trim() || !peerAddress.trim()) return;
    await addPeer(peerName.trim(), peerAddress.trim());
    setPeerName("");
    setPeerAddress("");
    setAddDialogOpen(false);
  }

  async function handleStopSync() {
    try {
      await stopSync();
    } catch (e) {
      toast.error(String(e));
    }
  }

  async function handleDiscover() {
    setDiscoverDialogOpen(true);
    try {
      await discoverPeers();
    } catch (e) {
      toast.error(String(e));
    }
  }

  async function handleAddDiscovered(name: string, address: string) {
    await addPeer(name, address);
    setDiscoverDialogOpen(false);
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">{t("bgpSync.title")}</h2>
          <p className="text-sm text-muted-foreground">{t("bgpSync.enabledDesc")}</p>
        </div>
        <Switch
          checked={settings.enabled}
          onCheckedChange={handleToggle}
          disabled={enableLoading}
        />
      </div>

      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">{t("bgpSync.peers")}</h3>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleDiscover} disabled={!settings.enabled}>
            <Search className="mr-1 h-4 w-4" />
            {t("bgpSync.discover")}
          </Button>
          <Button variant="outline" size="sm" onClick={() => setAddDialogOpen(true)} disabled={!settings.enabled}>
            <Plus className="mr-1 h-4 w-4" />
            {t("bgpSync.addPeer")}
          </Button>
        </div>
      </div>

      {settings.peers.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("bgpSync.noPeers")}</p>
      ) : (
        <div className="flex flex-col gap-2">
          {settings.peers.map((peer) => {
            const isActive = activePeer === peer.id;
            const isSyncing = isActive && syncStatus !== "disconnected";

            return (
              <div
                key={peer.id}
                className="flex items-center justify-between rounded-lg border border-white/[0.06] bg-muted/30 px-4 py-3"
              >
                <div className="flex flex-col gap-1">
                  <p className="text-sm font-medium">{peer.name}</p>
                  <p className="text-xs text-muted-foreground">{peer.address}</p>
                  {isActive && <SyncStatusBadge status={syncStatus} />}
                </div>
                <div className="flex gap-2">
                  {isSyncing ? (
                    <Button variant="outline" size="sm" onClick={handleStopSync}>
                      <Square className="mr-1 h-4 w-4" />
                      {t("bgpSync.stopSync")}
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={async () => {
                        try {
                          await startSync(peer.id);
                        } catch (e: any) {
                          toast.error(e?.message || String(e));
                        }
                      }}
                      disabled={!!activePeer}
                    >
                      <RefreshCw className="mr-1 h-4 w-4" />
                      {t("bgpSync.sync")}
                    </Button>
                  )}
                  <Button variant="ghost" size="sm" onClick={() => removePeer(peer.id)} disabled={isSyncing}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add Peer Dialog */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="border-white/[0.06] bg-card/90 backdrop-blur-2xl">
          <DialogHeader>
            <DialogTitle>{t("bgpSync.addPeer")}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <div>
              <label className="text-sm">{t("bgpSync.peerName")}</label>
              <Input
                value={peerName}
                onChange={(e) => setPeerName(e.target.value)}
                placeholder="Mac Mini"
                className="mt-1 bg-muted/30 border-white/[0.06]"
              />
            </div>
            <div>
              <label className="text-sm">{t("bgpSync.peerAddress")}</label>
              <Input
                value={peerAddress}
                onChange={(e) => setPeerAddress(e.target.value)}
                placeholder="100.64.0.2"
                className="mt-1 bg-muted/30 border-white/[0.06]"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddDialogOpen(false)}>
              {t("common.actions.cancel")}
            </Button>
            <Button onClick={handleAddPeer}>{t("common.actions.confirm")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Discover Dialog */}
      <Dialog open={discoverDialogOpen} onOpenChange={setDiscoverDialogOpen}>
        <DialogContent className="border-white/[0.06] bg-card/90 backdrop-blur-2xl">
          <DialogHeader>
            <DialogTitle>{t("bgpSync.discover")}</DialogTitle>
          </DialogHeader>
          {discovering ? (
            <div className="flex items-center gap-2 py-4">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm">{t("bgpSync.discovering")}</span>
            </div>
          ) : discoveredPeers.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("bgpSync.noDevicesFound")}</p>
          ) : (
            <div className="flex flex-col gap-2">
              {discoveredPeers.map((peer) => (
                <div
                  key={peer.address}
                  className="flex items-center justify-between rounded-lg border border-white/[0.06] bg-muted/30 px-4 py-3"
                >
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium">{peer.name}</p>
                      <SourceBadge source={peer.source} />
                    </div>
                    <p className="text-xs text-muted-foreground">{peer.address}</p>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => handleAddDiscovered(peer.name, peer.address)}>
                    <Plus className="mr-1 h-4 w-4" />
                    {t("bgpSync.addPeer")}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
