import { useEffect } from "react";
import { Zap, Check, Wifi } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useNodesStore } from "@/stores/nodes";
import { cn } from "@/lib/utils";

function latencyColor(ms: number | null): string {
  if (ms === null) return "text-muted-foreground";
  if (ms < 80) return "text-green-500";
  if (ms < 150) return "text-yellow-500";
  return "text-red-500";
}

const flagEmoji: Record<string, string> = {
  JP: "\u{1F1EF}\u{1F1F5}",
  US: "\u{1F1FA}\u{1F1F8}",
  SG: "\u{1F1F8}\u{1F1EC}",
  HK: "\u{1F1ED}\u{1F1F0}",
  KR: "\u{1F1F0}\u{1F1F7}",
};

export function NodesPage() {
  const { groups, selectedGroup, testing, fetchGroups, selectGroup, testAllLatency, setActiveNode } =
    useNodesStore();

  useEffect(() => {
    fetchGroups();
  }, [fetchGroups]);

  const currentGroup = groups.find((g) => g.id === selectedGroup);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Nodes</h1>
        <Button variant="outline" size="sm" onClick={testAllLatency} disabled={testing}>
          <Zap className="mr-2 h-3.5 w-3.5" />
          {testing ? "Testing..." : "Test All"}
        </Button>
      </div>

      <Tabs value={selectedGroup} onValueChange={selectGroup}>
        <TabsList>
          {groups.map((g) => (
            <TabsTrigger key={g.id} value={g.id}>{g.name}</TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <div className="grid gap-3">
        {currentGroup?.nodes.map((node) => (
          <Card
            key={node.id}
            className={cn("cursor-pointer transition-all hover:shadow-md", node.active && "ring-2 ring-primary")}
            onClick={() => setActiveNode(node.id)}
          >
            <CardContent className="flex items-center gap-4 p-4">
              <span className="text-2xl">{flagEmoji[node.countryCode] ?? "\u{1F310}"}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium truncate">{node.name}</span>
                  {node.active && (
                    <Badge variant="default" className="h-5 text-[10px]">
                      <Check className="mr-1 h-3 w-3" /> Active
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">{node.protocol} • {node.server}</p>
              </div>
              <div className={cn("flex items-center gap-1 text-sm font-mono", latencyColor(node.latency))}>
                <Wifi className="h-3.5 w-3.5" />
                {node.latency !== null ? `${node.latency}ms` : "—"}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
