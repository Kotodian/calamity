import { describe, it, expect } from "vitest";
import { nodesService } from "../nodes";

describe("nodesService protocol-specific fields", () => {
  it("adds VMess node with uuid and security", async () => {
    const node = await nodesService.addNode("proxy", {
      name: "VMess Test",
      server: "vmess.test.com",
      port: 443,
      protocol: "VMess",
      country: "Japan",
      countryCode: "JP",
      protocolConfig: {
        type: "vmess",
        uuid: "a3482e88-686a-4a58-8126-99c9df64b060",
        alterId: 0,
        security: "auto",
        transport: "ws",
      },
    });
    expect(node.protocolConfig?.type).toBe("vmess");
    if (node.protocolConfig?.type === "vmess") {
      expect(node.protocolConfig.uuid).toBe("a3482e88-686a-4a58-8126-99c9df64b060");
    }
  });

  it("adds Trojan node with password", async () => {
    const node = await nodesService.addNode("proxy", {
      name: "Trojan Test",
      server: "trojan.test.com",
      port: 443,
      protocol: "Trojan",
      country: "US",
      countryCode: "US",
      protocolConfig: { type: "trojan", password: "my-secret-password", transport: "tcp" },
    });
    expect(node.protocolConfig?.type).toBe("trojan");
    if (node.protocolConfig?.type === "trojan") {
      expect(node.protocolConfig.password).toBe("my-secret-password");
    }
  });

  it("adds Hysteria2 node with bandwidth", async () => {
    const node = await nodesService.addNode("proxy", {
      name: "Hy2 Test",
      server: "hy2.test.com",
      port: 443,
      protocol: "Hysteria2",
      country: "HK",
      countryCode: "HK",
      protocolConfig: { type: "hysteria2", password: "hy2-pass", upMbps: 100, downMbps: 200 },
    });
    expect(node.protocolConfig?.type).toBe("hysteria2");
    if (node.protocolConfig?.type === "hysteria2") {
      expect(node.protocolConfig.upMbps).toBe(100);
    }
  });

  it("adds AnyTLS node with password and sni", async () => {
    const node = await nodesService.addNode("proxy", {
      name: "AnyTLS Test",
      server: "anytls.test.com",
      port: 443,
      protocol: "AnyTLS",
      country: "SG",
      countryCode: "SG",
      protocolConfig: { type: "anytls", password: "anytls-pass", sni: "anytls.test.com", idleTimeout: 900 },
    });
    expect(node.protocolConfig?.type).toBe("anytls");
    if (node.protocolConfig?.type === "anytls") {
      expect(node.protocolConfig.password).toBe("anytls-pass");
      expect(node.protocolConfig.sni).toBe("anytls.test.com");
      expect(node.protocolConfig.idleTimeout).toBe(900);
    }
  });

  it("adds Shadowsocks node with method", async () => {
    const node = await nodesService.addNode("proxy", {
      name: "SS Test",
      server: "ss.test.com",
      port: 8388,
      protocol: "Shadowsocks",
      country: "JP",
      countryCode: "JP",
      protocolConfig: { type: "shadowsocks", password: "ss-pass", method: "2022-blake3-aes-256-gcm" },
    });
    expect(node.protocolConfig?.type).toBe("shadowsocks");
    if (node.protocolConfig?.type === "shadowsocks") {
      expect(node.protocolConfig.method).toBe("2022-blake3-aes-256-gcm");
    }
  });

  it("adds VLESS node with flow", async () => {
    const node = await nodesService.addNode("proxy", {
      name: "VLESS Test",
      server: "vless.test.com",
      port: 443,
      protocol: "VLESS",
      country: "KR",
      countryCode: "KR",
      protocolConfig: { type: "vless", uuid: "b-uuid", flow: "xtls-rprx-vision", transport: "tcp" },
    });
    expect(node.protocolConfig?.type).toBe("vless");
    if (node.protocolConfig?.type === "vless") {
      expect(node.protocolConfig.flow).toBe("xtls-rprx-vision");
    }
  });

  it("adds TUIC node with congestion control", async () => {
    const node = await nodesService.addNode("proxy", {
      name: "TUIC Test",
      server: "tuic.test.com",
      port: 443,
      protocol: "TUIC",
      country: "DE",
      countryCode: "DE",
      protocolConfig: { type: "tuic", uuid: "c-uuid", password: "tuic-pass", congestionControl: "bbr" },
    });
    expect(node.protocolConfig?.type).toBe("tuic");
    if (node.protocolConfig?.type === "tuic") {
      expect(node.protocolConfig.congestionControl).toBe("bbr");
    }
  });
});
