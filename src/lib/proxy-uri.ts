import type { NewNodeInput } from "../services/nodes";

const COUNTRY_PATTERNS: [RegExp, string, string][] = [
  [/\b(HK|Hong\s*Kong|香港|🇭🇰)\b/i, "Hong Kong", "HK"],
  [/\b(JP|Japan|日本|东京|Tokyo|Osaka|大阪|🇯🇵)\b/i, "Japan", "JP"],
  [/\b(US|USA|United\s*States|美国|Los\s*Angeles|San\s*Jose|Seattle|🇺🇸)\b/i, "United States", "US"],
  [/\b(SG|Singapore|新加坡|🇸🇬)\b/i, "Singapore", "SG"],
  [/\b(KR|Korea|韩国|首尔|Seoul|🇰🇷)\b/i, "South Korea", "KR"],
  [/\b(TW|Taiwan|台湾|🇹🇼)\b/i, "Taiwan", "TW"],
  [/\b(DE|Germany|德国|🇩🇪)\b/i, "Germany", "DE"],
  [/\b(GB|UK|United\s*Kingdom|英国|London|🇬🇧)\b/i, "United Kingdom", "GB"],
  [/\b(FR|France|法国|🇫🇷)\b/i, "France", "FR"],
  [/\b(AU|Australia|澳大利亚|🇦🇺)\b/i, "Australia", "AU"],
  [/\b(CA|Canada|加拿大|🇨🇦)\b/i, "Canada", "CA"],
  [/\b(IN|India|印度|🇮🇳)\b/i, "India", "IN"],
  [/\b(RU|Russia|俄罗斯|🇷🇺)\b/i, "Russia", "RU"],
  [/\b(NL|Netherlands|荷兰|🇳🇱)\b/i, "Netherlands", "NL"],
  [/\b(TR|Turkey|土耳其|🇹🇷)\b/i, "Turkey", "TR"],
];

export function inferCountry(name: string): { country: string; countryCode: string } {
  for (const [pattern, country, code] of COUNTRY_PATTERNS) {
    if (pattern.test(name)) {
      return { country, countryCode: code };
    }
  }
  return { country: "", countryCode: "" };
}

export function parseProxyUri(uri: string): (NewNodeInput & { name: string }) | null {
  uri = uri.trim();
  let result: (NewNodeInput & { name: string }) | null = null;
  try {
    if (uri.startsWith("vmess://")) result = parseVMess(uri);
    else if (uri.startsWith("vless://")) result = parseVLESS(uri);
    else if (uri.startsWith("trojan://")) result = parseTrojan(uri);
    else if (uri.startsWith("ss://")) result = parseSS(uri);
    else if (uri.startsWith("hy2://") || uri.startsWith("hysteria2://")) result = parseHy2(uri);
    else if (uri.startsWith("tuic://")) result = parseTUIC(uri);
  } catch {
    return null;
  }
  if (result && !result.countryCode) {
    const { country, countryCode } = inferCountry(result.name);
    result.country = country;
    result.countryCode = countryCode;
  }
  return result;
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
  // SS has two formats:
  // Legacy: ss://BASE64(method:password@host:port)#name
  // SIP002: ss://BASE64(method:password)@host:port#name
  const hashIdx = uri.indexOf("#");
  const fragment = hashIdx >= 0 ? decodeURIComponent(uri.slice(hashIdx + 1)) : "";
  const withoutFragment = hashIdx >= 0 ? uri.slice(0, hashIdx) : uri;
  const content = withoutFragment.slice(5); // remove "ss://"

  let method = "aes-256-gcm";
  let password = "";
  let server = "";
  let port = 443;

  if (content.includes("@")) {
    // SIP002: BASE64(method:password)@host:port
    const atIdx = content.indexOf("@");
    const userPart = content.slice(0, atIdx);
    const hostPart = content.slice(atIdx + 1);

    let decoded: string;
    try { decoded = atob(userPart); } catch { decoded = decodeURIComponent(userPart); }
    const colonIdx = decoded.indexOf(":");
    method = decoded.slice(0, colonIdx);
    password = decoded.slice(colonIdx + 1);

    const lastColon = hostPart.lastIndexOf(":");
    server = lastColon >= 0 ? hostPart.slice(0, lastColon) : hostPart;
    port = lastColon >= 0 ? parseInt(hostPart.slice(lastColon + 1)) || 443 : 443;
  } else {
    // Legacy: BASE64(method:password@host:port)
    let decoded: string;
    try { decoded = atob(content); } catch { decoded = content; }
    const atIdx = decoded.indexOf("@");
    const userPart = decoded.slice(0, atIdx);
    const hostPart = decoded.slice(atIdx + 1);

    const colonIdx = userPart.indexOf(":");
    method = userPart.slice(0, colonIdx);
    password = userPart.slice(colonIdx + 1);

    const lastColon = hostPart.lastIndexOf(":");
    server = lastColon >= 0 ? hostPart.slice(0, lastColon) : hostPart;
    port = lastColon >= 0 ? parseInt(hostPart.slice(lastColon + 1)) || 443 : 443;
  }

  return {
    name: fragment || "SS Node",
    server,
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
