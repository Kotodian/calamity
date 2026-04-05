import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useBgpSyncStore } from "../stores/bgp-sync";
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
import { Plus, Trash2, Download, Search, Loader2 } from "lucide-react";

export function BgpSyncPage() {
  const { t } = useTranslation();
  const {
    settings,
    discoveredPeers,
    pullDiff,
    pulling,
    discovering,
    fetchSettings,
    setEnabled,
    addPeer,
    removePeer,
    pullRules,
    applyRules,
    discoverPeers,
    clearDiff,
  } = useBgpSyncStore();

  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [peerName, setPeerName] = useState("");
  const [peerAddress, setPeerAddress] = useState("");
  const [diffDialogOpen, setDiffDialogOpen] = useState(false);
  const [discoverDialogOpen, setDiscoverDialogOpen] = useState(false);
  const [enableLoading, setEnableLoading] = useState(false);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  useEffect(() => {
    if (pullDiff) setDiffDialogOpen(true);
  }, [pullDiff]);

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

  async function handlePull(peerId: string) {
    try {
      await pullRules(peerId);
    } catch (e) {
      toast.error(String(e));
    }
  }

  async function handleApply() {
    try {
      await applyRules();
      setDiffDialogOpen(false);
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

  const totalChanges = pullDiff
    ? pullDiff.added.length +
      pullDiff.removed.length +
      pullDiff.modified.length +
      (pullDiff.finalOutboundChanged ? 1 : 0)
    : 0;

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
          {settings.peers.map((peer) => (
            <div
              key={peer.id}
              className="flex items-center justify-between rounded-lg border border-white/[0.06] bg-muted/30 px-4 py-3"
            >
              <div>
                <p className="text-sm font-medium">{peer.name}</p>
                <p className="text-xs text-muted-foreground">{peer.address}</p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => handlePull(peer.id)} disabled={pulling}>
                  {pulling ? (
                    <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                  ) : (
                    <Download className="mr-1 h-4 w-4" />
                  )}
                  {pulling ? t("bgpSync.pulling") : t("bgpSync.pull")}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => removePeer(peer.id)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
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

      {/* Diff Preview Dialog */}
      <Dialog
        open={diffDialogOpen}
        onOpenChange={(open) => {
          if (!open) { setDiffDialogOpen(false); clearDiff(); }
        }}
      >
        <DialogContent className="border-white/[0.06] bg-card/90 backdrop-blur-2xl max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("bgpSync.diffTitle")}</DialogTitle>
          </DialogHeader>
          {pullDiff && totalChanges === 0 ? (
            <p className="text-sm text-muted-foreground">{t("bgpSync.diffEmpty")}</p>
          ) : pullDiff ? (
            <div className="flex flex-col gap-3 max-h-80 overflow-y-auto">
              {pullDiff.added.length > 0 && (
                <div>
                  <p className="text-sm font-medium text-green-400">
                    + {t("bgpSync.diffAdded")} ({pullDiff.added.length})
                  </p>
                  {pullDiff.added.map((r) => (
                    <p key={r.id} className="text-xs text-muted-foreground ml-4">{r.name}</p>
                  ))}
                </div>
              )}
              {pullDiff.removed.length > 0 && (
                <div>
                  <p className="text-sm font-medium text-red-400">
                    - {t("bgpSync.diffRemoved")} ({pullDiff.removed.length})
                  </p>
                  {pullDiff.removed.map((r) => (
                    <p key={r.id} className="text-xs text-muted-foreground ml-4">{r.name}</p>
                  ))}
                </div>
              )}
              {pullDiff.modified.length > 0 && (
                <div>
                  <p className="text-sm font-medium text-yellow-400">
                    ~ {t("bgpSync.diffModified")} ({pullDiff.modified.length})
                  </p>
                  {pullDiff.modified.map((entry) => (
                    <p key={entry.remote.id} className="text-xs text-muted-foreground ml-4">
                      {entry.remote.name}
                    </p>
                  ))}
                </div>
              )}
              {pullDiff.finalOutboundChanged && (
                <p className="text-sm text-yellow-400">
                  {t("bgpSync.diffFinalOutbound", { outbound: pullDiff.newFinalOutbound })}
                </p>
              )}
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDiffDialogOpen(false); clearDiff(); }}>
              {t("common.actions.cancel")}
            </Button>
            {totalChanges > 0 && (
              <Button onClick={handleApply}>{t("bgpSync.apply")}</Button>
            )}
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
                  <div>
                    <p className="text-sm font-medium">{peer.hostname}</p>
                    <p className="text-xs text-muted-foreground">{peer.address}</p>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => handleAddDiscovered(peer.hostname, peer.address)}>
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
