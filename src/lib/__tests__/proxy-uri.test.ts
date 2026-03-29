import { describe, it, expect } from "vitest";
import { parseProxyUri, parseMultipleUris } from "../proxy-uri";

describe("parseProxyUri", () => {
  it("parses vmess:// base64 URI", () => {
    const json = btoa(JSON.stringify({
      v: "2", ps: "Tokyo-01", add: "jp1.example.com", port: "443",
      id: "a3482e88-686a-4a58-8126-99c9df64b060", aid: "0",
      net: "ws", type: "none", host: "", path: "/ws", tls: "tls",
    }));
    const result = parseProxyUri(`vmess://${json}`);
    expect(result).not.toBeNull();
    expect(result!.name).toBe("Tokyo-01");
    expect(result!.server).toBe("jp1.example.com");
    expect(result!.port).toBe(443);
    expect(result!.protocol).toBe("VMess");
  });

  it("parses vless:// URI", () => {
    const result = parseProxyUri("vless://uuid-here@vless.example.com:443?encryption=none&type=tcp&security=tls&sni=vless.example.com&flow=xtls-rprx-vision#My-VLESS");
    expect(result).not.toBeNull();
    expect(result!.name).toBe("My-VLESS");
    expect(result!.server).toBe("vless.example.com");
    expect(result!.port).toBe(443);
    expect(result!.protocol).toBe("VLESS");
  });

  it("parses trojan:// URI", () => {
    const result = parseProxyUri("trojan://password123@trojan.example.com:443?sni=trojan.example.com#Trojan-Node");
    expect(result).not.toBeNull();
    expect(result!.name).toBe("Trojan-Node");
    expect(result!.server).toBe("trojan.example.com");
    expect(result!.port).toBe(443);
    expect(result!.protocol).toBe("Trojan");
  });

  it("parses ss:// URI", () => {
    const method_pass = btoa("aes-256-gcm:mypassword");
    const result = parseProxyUri(`ss://${method_pass}@ss.example.com:8388#SS-Node`);
    expect(result).not.toBeNull();
    expect(result!.name).toBe("SS-Node");
    expect(result!.server).toBe("ss.example.com");
    expect(result!.port).toBe(8388);
    expect(result!.protocol).toBe("Shadowsocks");
  });

  it("parses hy2:// URI", () => {
    const result = parseProxyUri("hy2://authpass@hy2.example.com:443?sni=hy2.example.com#Hysteria2-Node");
    expect(result).not.toBeNull();
    expect(result!.name).toBe("Hysteria2-Node");
    expect(result!.server).toBe("hy2.example.com");
    expect(result!.protocol).toBe("Hysteria2");
  });

  it("parses multiple URIs from text block", () => {
    const text = [
      "trojan://pass@a.com:443#Node-A",
      "trojan://pass@b.com:443#Node-B",
      "some random text",
      "vless://uuid@c.com:443?type=tcp#Node-C",
    ].join("\n");
    const results = parseMultipleUris(text);
    expect(results.length).toBe(3);
  });

  it("returns null for invalid URI", () => {
    expect(parseProxyUri("https://google.com")).toBeNull();
    expect(parseProxyUri("random text")).toBeNull();
  });
});
