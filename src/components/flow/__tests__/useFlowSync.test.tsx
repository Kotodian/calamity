import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useFlowSync } from "../useFlowSync";
import { useRulesStore } from "@/stores/rules";
import { useDnsStore } from "@/stores/dns";
import { useNodesStore } from "@/stores/nodes";
import type { DnsConfig, DnsRule, NodeGroup, RouteRule } from "@/services/types";

function buildRouteRule(overrides: Partial<RouteRule> = {}): RouteRule {
  return {
    id: "rule-1",
    name: "China Direct",
    enabled: true,
    matchType: "geosite",
    matchValue: "cn",
    outbound: "direct",
    order: 0,
    ...overrides,
  };
}

function buildDnsConfig(overrides: Partial<DnsConfig> = {}): DnsConfig {
  return {
    mode: "direct",
    final: "AliDNS",
    fakeIpRange: "198.18.0.0/15",
    servers: [
      {
        name: "AliDNS",
        address: "https://dns.alidns.com/dns-query",
        enabled: true,
      },
    ],
    ...overrides,
  };
}

function buildDnsRule(overrides: Partial<DnsRule> = {}): DnsRule {
  return {
    matchType: "rule_set",
    matchValue: "geosite-cn",
    server: "AliDNS",
    enabled: true,
    ...overrides,
  };
}

function buildGroups(): NodeGroup[] {
  return [
    {
      id: "proxy",
      name: "Proxy",
      nodes: [
        {
          id: "tokyo-01",
          name: "Tokyo 01",
          server: "jp.example.com",
          port: 443,
          protocol: "VMess",
          latency: null,
          country: "Japan",
          countryCode: "JP",
          active: false,
        },
      ],
    },
  ];
}

describe("useFlowSync", () => {
  beforeEach(() => {
    useRulesStore.setState({
      rules: [buildRouteRule()],
      finalOutbound: { outbound: "proxy" },
      fetchRules: vi.fn(async () => {}),
      fetchFinalOutbound: vi.fn(async () => {}),
      updateFinalOutbound: vi.fn(async () => {}),
      addRule: vi.fn(async () => {}),
      updateRule: vi.fn(async () => {}),
      deleteRule: vi.fn(async () => {}),
      reorderRules: vi.fn(async () => {}),
    });

    useDnsStore.setState({
      config: buildDnsConfig(),
      rules: [buildDnsRule()],
      fetchAll: vi.fn(async () => {}),
      updateConfig: vi.fn(async () => {}),
      addServer: vi.fn(async () => {}),
      updateServer: vi.fn(async () => {}),
      deleteServer: vi.fn(async () => {}),
      addRule: vi.fn(async () => {}),
      deleteRule: vi.fn(async () => {}),
    });

    useNodesStore.setState({
      groups: buildGroups(),
      selectedGroup: "proxy",
      testing: false,
      latencyMap: {},
      testingNodes: new Set(),
      fetchGroups: vi.fn(async () => {}),
      selectGroup: vi.fn(),
      testLatency: vi.fn(async () => {}),
      testAllLatency: vi.fn(async () => {}),
      setActiveNode: vi.fn(async () => {}),
      disconnectNode: vi.fn(async () => {}),
      addNode: vi.fn(async () => {}),
      updateNode: vi.fn(async () => {}),
      removeNode: vi.fn(async () => {}),
      addGroup: vi.fn(async () => {}),
      removeGroup: vi.fn(async () => {}),
      renameGroup: vi.fn(async () => {}),
    });
  });

  it("normalizes geosite DNS connections to rule_set rules", async () => {
    const addDnsRule = vi.fn(async () => {});
    useDnsStore.setState({ rules: [], addRule: addDnsRule });

    const { result } = renderHook(() => useFlowSync());

    await waitFor(() =>
      expect(useRulesStore.getState().fetchRules).toHaveBeenCalledTimes(1)
    );

    await act(async () => {
      result.current.onConnect({
        source: "match-rule-1",
        target: "dns-AliDNS",
        sourceHandle: "dns-out",
      });
    });

    expect(addDnsRule).toHaveBeenCalledWith({
      matchType: "rule_set",
      matchValue: "geosite-cn",
      server: "AliDNS",
      enabled: true,
    });
  });

  it("deletes DNS resolve edges by DNS rule matchValue", async () => {
    const deleteDnsRule = vi.fn(async () => {});
    useDnsStore.setState({ deleteRule: deleteDnsRule });

    const { result } = renderHook(() => useFlowSync());

    await waitFor(() =>
      expect(useDnsStore.getState().fetchAll).toHaveBeenCalledTimes(1)
    );

    await act(async () => {
      result.current.onEdgesDelete([
        {
          id: "e-dns-rule-1-AliDNS",
          source: "match-rule-1",
          target: "dns-AliDNS",
          sourceHandle: "dns-out",
          targetHandle: "dns-in",
          data: { kind: "dns-resolve" },
          type: "flow",
        },
      ]);
    });

    expect(deleteDnsRule).toHaveBeenCalledWith("geosite-cn");
  });
});
