import { describe, expect, it } from "vitest";
import { buildOutboundNodes } from "../flow-utils";
import type { NodeGroup } from "@/services/types";

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
        {
          id: "us-west",
          name: "US West",
          server: "us.example.com",
          port: 443,
          protocol: "Trojan",
          latency: null,
          country: "United States",
          countryCode: "US",
          active: false,
        },
      ],
    },
  ];
}

describe("buildOutboundNodes", () => {
  it("includes existing proxy nodes even when no rule currently references them", () => {
    const nodes = buildOutboundNodes([], buildGroups());

    expect(nodes.map((node) => node.id)).toEqual([
      "out-direct",
      "out-reject",
      "out-tailnet",
      "out-proxy-Tokyo 01",
      "out-proxy-US West",
    ]);
  });
});
