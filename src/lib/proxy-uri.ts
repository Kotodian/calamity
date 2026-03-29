import type { NewNodeInput } from "../services/nodes";

export function parseProxyUri(uri: string): (NewNodeInput & { name: string }) | null {
  uri = uri.trim();
  try {
    if (uri.startsWith("vmess://")) return parseVMess(uri);
    if (uri.startsWith("vless://")) return parseVLESS(uri);
    if (uri.startsWith("trojan://")) return parseTrojan(uri);
    if (uri.startsWith("ss://")) return parseSS(uri);
    if (uri.startsWith("hy2://") || uri.startsWith("hysteria2://")) return parseHy2(uri);
    if (uri.startsWith("tuic://")) return parseTUIC(uri);
  } catch {
    return null;
  }
  return null;
}

export function parseMultipleUris(text: string): (NewNodeInput & { name: string })[] {
  return text
    .split(/[\n\r]+/)
    .map((line) => parseProxyUri(line.trim()))
    .filter((r): r is NonNullable<typeof r> => r !== null);
}

function parseVMess(uri: string): NewNodeInput & { name: string } {
  const b64 = uri.slice(8);
  const json = JSON.parse(atob(b64));
  return {
    name: json.ps || "VMess Node",
    server: json.add,
    port: parseInt(json.port) || 443,
    protocol: "VMess",
    country: "",
    countryCode: "",
    protocolConfig: {
      type: "vmess",
      uuid: json.id,
      alterId: parseInt(json.aid) || 0,
      security: "auto",
      transport: { type: (json.net || "tcp") as "tcp" },
      tls: {
        enabled: json.tls === "tls",
        sni: json.sni || json.host || "",
        alpn: [],
        insecure: false,
        reality: false,
        realityPublicKey: "",
        realityShortId: "",
      },
    },
  };
}

function parseStandardUri(uri: string) {
  // scheme://userinfo@host:port?query#fragment
  const hashIdx = uri.indexOf("#");
  const fragment = hashIdx >= 0 ? decodeURIComponent(uri.slice(hashIdx + 1)) : "";
  const withoutFragment = hashIdx >= 0 ? uri.slice(0, hashIdx) : uri;

  const schemeEnd = withoutFragment.indexOf("://");
  const rest = withoutFragment.slice(schemeEnd + 3);

  const atIdx = rest.indexOf("@");
  const userinfo = atIdx >= 0 ? rest.slice(0, atIdx) : "";
  const hostPart = atIdx >= 0 ? rest.slice(atIdx + 1) : rest;

  const qIdx = hostPart.indexOf("?");
  const hostPort = qIdx >= 0 ? hostPart.slice(0, qIdx) : hostPart;
  const queryStr = qIdx >= 0 ? hostPart.slice(qIdx + 1) : "";

  const lastColon = hostPort.lastIndexOf(":");
  const host = lastColon >= 0 ? hostPort.slice(0, lastColon) : hostPort;
  const port = lastColon >= 0 ? parseInt(hostPort.slice(lastColon + 1)) || 443 : 443;

  const params = new URLSearchParams(queryStr);

  return { userinfo, host, port, params, fragment };
}

function parseVLESS(uri: string): NewNodeInput & { name: string } {
  const { userinfo: uuid, host, port, params, fragment } = parseStandardUri(uri);
  return {
    name: fragment || "VLESS Node",
    server: host,
    port,
    protocol: "VLESS",
    country: "",
    countryCode: "",
    protocolConfig: {
      type: "vless",
      uuid,
      flow: (params.get("flow") || "") as "",
      transport: { type: (params.get("type") || "tcp") as "tcp" },
      tls: {
        enabled: params.get("security") !== "none",
        sni: params.get("sni") || host,
        alpn: params.get("alpn")?.split(",") || [],
        insecure: params.get("allowInsecure") === "1",
        reality: params.get("security") === "reality",
        realityPublicKey: params.get("pbk") || "",
        realityShortId: params.get("sid") || "",
      },
    },
  };
}

function parseTrojan(uri: string): NewNodeInput & { name: string } {
  const { userinfo: password, host, port, params, fragment } = parseStandardUri(uri);
  return {
    name: fragment || "Trojan Node",
    server: host,
    port,
    protocol: "Trojan",
    country: "",
    countryCode: "",
    protocolConfig: {
      type: "trojan",
      password: decodeURIComponent(password),
      transport: { type: (params.get("type") || "tcp") as "tcp" },
      tls: {
        enabled: true,
        sni: params.get("sni") || host,
        alpn: params.get("alpn")?.split(",") || [],
        insecure: params.get("allowInsecure") === "1",
        reality: false,
        realityPublicKey: "",
        realityShortId: "",
      },
    },
  };
}

function parseSS(uri: string): NewNodeInput & { name: string } {
  const { userinfo, host, port, fragment } = parseStandardUri(uri);
  let method = "aes-256-gcm";
  let password = "";
  try {
    const decoded = atob(userinfo);
    const colonIdx = decoded.indexOf(":");
    method = decoded.slice(0, colonIdx);
    password = decoded.slice(colonIdx + 1);
  } catch {
    // SIP002 format: method:password (already decoded)
    const colonIdx = userinfo.indexOf(":");
    if (colonIdx >= 0) {
      method = userinfo.slice(0, colonIdx);
      password = userinfo.slice(colonIdx + 1);
    }
  }
  return {
    name: fragment || "SS Node",
    server: host,
    port,
    protocol: "Shadowsocks",
    country: "",
    countryCode: "",
    protocolConfig: {
      type: "shadowsocks",
      password,
      method: method as "aes-256-gcm",
    },
  };
}

function parseHy2(uri: string): NewNodeInput & { name: string } {
  const { userinfo: password, host, port, params, fragment } = parseStandardUri(uri);
  return {
    name: fragment || "Hysteria2 Node",
    server: host,
    port,
    protocol: "Hysteria2",
    country: "",
    countryCode: "",
    protocolConfig: {
      type: "hysteria2",
      password: decodeURIComponent(password),
      upMbps: parseInt(params.get("up") || "100"),
      downMbps: parseInt(params.get("down") || "200"),
      obfsType: (params.get("obfs") || "") as "",
      obfsPassword: params.get("obfs-password") || "",
      tls: {
        enabled: true,
        sni: params.get("sni") || host,
        alpn: [],
        insecure: params.get("insecure") === "1",
        reality: false,
        realityPublicKey: "",
        realityShortId: "",
      },
    },
  };
}

function parseTUIC(uri: string): NewNodeInput & { name: string } {
  const { userinfo, host, port, params, fragment } = parseStandardUri(uri);
  const [uuid, password] = userinfo.split(":");
  return {
    name: fragment || "TUIC Node",
    server: host,
    port,
    protocol: "TUIC",
    country: "",
    countryCode: "",
    protocolConfig: {
      type: "tuic",
      uuid,
      password: password || "",
      congestionControl: (params.get("congestion_control") || "bbr") as "bbr",
      udpRelayMode: (params.get("udp_relay_mode") || "native") as "native",
      tls: {
        enabled: true,
        sni: params.get("sni") || host,
        alpn: params.get("alpn")?.split(",") || [],
        insecure: params.get("allowInsecure") === "1",
        reality: false,
        realityPublicKey: "",
        realityShortId: "",
      },
    },
  };
}
