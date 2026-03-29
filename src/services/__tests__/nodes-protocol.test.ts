import { describe, it, expect } from "vitest";
import { nodesService } from "../nodes";
import type { TlsConfig, TransportConfig } from "../types";

const defaultTls: TlsConfig = { enabled: true, sni: "", alpn: [], insecure: false, reality: false, realityPublicKey: "", realityShortId: "" };
const defaultTransport: TransportConfig = { type: "tcp" };

describe("nodesService protocol-specific fields", () => {
  it("adds VMess node", async () => {
    const node = await nodesService.addNode("proxy", {
      name: "VMess Test", server: "vmess.test.com", port: 443, protocol: "VMess", country: "Japan", countryCode: "JP",
      protocolConfig: { type: "vmess", uuid: "a-uuid", alterId: 0, security: "auto", transport: defaultTransport, tls: defaultTls },
    });
    expect(node.protocolConfig?.type).toBe("vmess");
  });

  it("adds Trojan node", async () => {
    const node = await nodesService.addNode("proxy", {
      name: "Trojan Test", server: "trojan.test.com", port: 443, protocol: "Trojan", country: "US", countryCode: "US",
      protocolConfig: { type: "trojan", password: "pass", transport: defaultTransport, tls: defaultTls },
    });
    expect(node.protocolConfig?.type).toBe("trojan");
  });

  it("adds Hysteria2 node", async () => {
    const node = await nodesService.addNode("proxy", {
      name: "Hy2 Test", server: "hy2.test.com", port: 443, protocol: "Hysteria2", country: "HK", countryCode: "HK",
      protocolConfig: { type: "hysteria2", password: "pass", upMbps: 100, downMbps: 200, tls: defaultTls },
    });
    expect(node.protocolConfig?.type).toBe("hysteria2");
  });

  it("adds AnyTLS node with padding", async () => {
    const node = await nodesService.addNode("proxy", {
      name: "AnyTLS Test", server: "anytls.test.com", port: 443, protocol: "AnyTLS", country: "SG", countryCode: "SG",
      protocolConfig: { type: "anytls", password: "pass", sni: "anytls.test.com", idleTimeout: 900, minPaddingLen: 100, maxPaddingLen: 200 },
    });
    expect(node.protocolConfig?.type).toBe("anytls");
    if (node.protocolConfig?.type === "anytls") {
      expect(node.protocolConfig.minPaddingLen).toBe(100);
    }
  });

  it("adds Shadowsocks node", async () => {
    const node = await nodesService.addNode("proxy", {
      name: "SS Test", server: "ss.test.com", port: 8388, protocol: "Shadowsocks", country: "JP", countryCode: "JP",
      protocolConfig: { type: "shadowsocks", password: "pass", method: "2022-blake3-aes-256-gcm" },
    });
    expect(node.protocolConfig?.type).toBe("shadowsocks");
  });

  it("adds VLESS node with Reality", async () => {
    const node = await nodesService.addNode("proxy", {
      name: "VLESS Test", server: "vless.test.com", port: 443, protocol: "VLESS", country: "KR", countryCode: "KR",
      protocolConfig: { type: "vless", uuid: "b-uuid", flow: "xtls-rprx-vision", transport: defaultTransport, tls: { ...defaultTls, reality: true, realityPublicKey: "abc123", realityShortId: "def" } },
    });
    expect(node.protocolConfig?.type).toBe("vless");
    if (node.protocolConfig?.type === "vless") {
      expect(node.protocolConfig.tls.reality).toBe(true);
      expect(node.protocolConfig.tls.realityPublicKey).toBe("abc123");
    }
  });

  it("adds TUIC node", async () => {
    const node = await nodesService.addNode("proxy", {
      name: "TUIC Test", server: "tuic.test.com", port: 443, protocol: "TUIC", country: "DE", countryCode: "DE",
      protocolConfig: { type: "tuic", uuid: "c-uuid", password: "pass", congestionControl: "bbr", udpRelayMode: "native", tls: defaultTls },
    });
    expect(node.protocolConfig?.type).toBe("tuic");
  });
});
