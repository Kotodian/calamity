import { fireEvent, render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createAppI18n } from "@/i18n";
import { NodeEditPanel } from "../panels/NodeEditPanel";
import { useDnsStore } from "@/stores/dns";
import type { FlowNode } from "../flow-types";

function buildDnsNode(): FlowNode {
  return {
    id: "dns-AliDNS",
    type: "dns",
    position: { x: 0, y: 0 },
    data: {
      kind: "dns",
      serverName: "AliDNS",
      address: "https://dns.alidns.com/dns-query",
      enabled: true,
      domainResolver: "Bootstrap",
      detour: "Tokyo 01",
    },
  } as FlowNode;
}

describe("NodeEditPanel", () => {
  beforeEach(() => {
    useDnsStore.setState({
      config: null,
      rules: [],
      fetchAll: vi.fn(async () => {}),
      updateConfig: vi.fn(async () => {}),
      addServer: vi.fn(async () => {}),
      updateServer: vi.fn(async () => {}),
      deleteServer: vi.fn(async () => {}),
      addRule: vi.fn(async () => {}),
      deleteRule: vi.fn(async () => {}),
    });
  });

  it("preserves existing DNS routing fields when saving", async () => {
    const updateServer = vi.fn(async () => {});
    useDnsStore.setState({ updateServer });

    const i18n = await createAppI18n({
      language: "en",
      systemLocales: ["en-US"],
    });

    render(
      <I18nextProvider i18n={i18n}>
        <NodeEditPanel node={buildDnsNode()} onClose={vi.fn()} />
      </I18nextProvider>
    );

    const addressInput = screen.getByDisplayValue("https://dns.alidns.com/dns-query");
    fireEvent.change(addressInput, { target: { value: "https://1.1.1.1/dns-query" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(updateServer).toHaveBeenCalledWith({
      name: "AliDNS",
      address: "https://1.1.1.1/dns-query",
      enabled: true,
      detour: "Tokyo 01",
      domainResolver: "Bootstrap",
    });
  });
});
