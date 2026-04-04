// Connection
export type ConnectionStatus = "connected" | "disconnected" | "connecting" | "disconnecting";
export type ProxyMode = "rule" | "global" | "direct";

export interface ConnectionState {
  status: ConnectionStatus;
  mode: ProxyMode;
  activeNode: string | null;
  uploadSpeed: number;
  downloadSpeed: number;
  totalUpload: number;
  totalDownload: number;
  latency: number;
}

export interface ConnectionSnapshot {
  status: Exclude<ConnectionStatus, "connecting">;
  mode: ProxyMode;
  activeNode: string | null;
  crashReason?: string;
}

export interface SpeedRecord {
  time: string;
  upload: number;
  download: number;
}

// Nodes
export interface NodeGroup {
  id: string;
  name: string;
  nodes: ProxyNode[];
}

export interface ProxyNode {
  id: string;
  name: string;
  server: string;
  port: number;
  protocol: string;
  latency: number | null;
  country: string;
  countryCode: string;
  active: boolean;
  protocolConfig?: ProtocolConfig;
}

// Protocol-specific configs
export type ProtocolConfig =
  | VMessConfig
  | VLESSConfig
  | TrojanConfig
  | ShadowsocksConfig
  | Hysteria2Config
  | TUICConfig
  | AnyTLSConfig
  | ChainConfig;

export interface ChainConfig {
  type: "chain";
  chain: string[]; // ordered node IDs: [first-hop, second-hop, ...]
}

// Shared TLS config
export interface TlsConfig {
  enabled: boolean;
  sni: string;
  alpn: string[];
  insecure: boolean;
  // Reality
  reality: boolean;
  realityPublicKey: string;
  realityShortId: string;
}

// Shared transport config
export interface TransportConfig {
  type: TransportType;
  // WebSocket
  wsPath?: string;
  wsHeaders?: Record<string, string>;
  // gRPC
  grpcServiceName?: string;
  // HTTP/2
  h2Host?: string[];
}

export interface VMessConfig {
  type: "vmess";
  uuid: string;
  alterId: number;
  security: "auto" | "aes-128-gcm" | "chacha20-poly1305" | "none";
  transport: TransportConfig;
  tls: TlsConfig;
}

export interface VLESSConfig {
  type: "vless";
  uuid: string;
  flow: "" | "xtls-rprx-vision";
  transport: TransportConfig;
  tls: TlsConfig;
}

export interface TrojanConfig {
  type: "trojan";
  password: string;
  transport: TransportConfig;
  tls: TlsConfig;
}

export interface ShadowsocksConfig {
  type: "shadowsocks";
  password: string;
  method: SSMethod;
  plugin?: "obfs-local" | "v2ray-plugin" | "";
  pluginOpts?: string;
}

export interface Hysteria2Config {
  type: "hysteria2";
  password: string;
  upMbps: number;
  downMbps: number;
  obfsType?: "salamander" | "";
  obfsPassword?: string;
  tls: TlsConfig;
}

export interface TUICConfig {
  type: "tuic";
  uuid: string;
  password: string;
  congestionControl: "bbr" | "cubic" | "new_reno";
  udpRelayMode: "native" | "quic";
  tls: TlsConfig;
}

export interface AnyTLSConfig {
  type: "anytls";
  password: string;
  sni: string;
  idleTimeout: number;
  minPaddingLen: number;
  maxPaddingLen: number;
}

export type TransportType = "tcp" | "ws" | "grpc" | "h2" | "quic";

export type SSMethod =
  | "aes-128-gcm"
  | "aes-256-gcm"
  | "chacha20-ietf-poly1305"
  | "2022-blake3-aes-128-gcm"
  | "2022-blake3-aes-256-gcm";

// Rules
export type OutboundType = "proxy" | "direct" | "reject" | "tailnet";

export interface RouteRule {
  id: string;
  name: string;
  enabled: boolean;
  matchType: "domain-suffix" | "domain-keyword" | "domain-full" | "domain-regex" | "geosite" | "geoip" | "ip-cidr" | "process-name" | "process-path" | "process-path-regex" | "port" | "port-range" | "network" | "rule-set";
  // For geosite/geoip rule sets
  ruleSetUrl?: string;
  ruleSetLocalPath?: string;
  downloadDetour?: string;
  matchValue: string;
  invert?: boolean;
  outbound: OutboundType;
  outboundNode?: string;
  outboundDevice?: string;
  order: number;
}

// Logs
export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogEntry {
  id: string;
  timestamp: string;
  level: LogLevel;
  source: string;
  message: string;
  metadata?: Record<string, string>;
}

// Tailnet
export type DeviceStatus = "online" | "offline";

export interface TailnetDevice {
  id: string;
  name: string;
  hostname: string;
  ip: string;
  os: string;
  status: DeviceStatus;
  lastSeen: string;
  isExitNode: boolean;
  isCurrentExitNode: boolean;
  isSelf: boolean;
}

export interface TailscaleSettings {
  enabled: boolean;
  authKey: string;
  oauthClientId: string;
  oauthClientSecret: string;
  oauthAccessToken: string;
  oauthTokenExpires: string;
  tailnet: string;
  hostname: string;
  exitNode: string;
  acceptRoutes: boolean;
  advertiseRoutes: string[];
  tags: string[];
}

// DNS
export type DnsMode = "fake-ip" | "redir-host" | "direct";

export interface DnsConfig {
  mode: DnsMode;
  final: string;
  servers: DnsServer[];
  fakeIpRange: string;
}

export interface DnsServer {
  id: string;
  name: string;
  address: string;
  enabled: boolean;
  detour?: string;
  domainResolver?: string;
}

export interface DnsRule {
  id: string;
  matchType: "domain" | "domain-suffix" | "domain-keyword" | "domain-regex" | "rule_set";
  matchValue: string;
  server: string;
  enabled: boolean;
}

// Settings
export type Theme = "light" | "dark" | "system";
export type Language = "system" | "en" | "zh-CN";

export interface TunConfig {
  stack: "system" | "gvisor" | "mixed";
  mtu: number;
  autoRoute: boolean;
  strictRoute: boolean;
  dnsHijack: string[];
}

export interface AppSettings {
  theme: Theme;
  language: Language;
  singboxPath: string;
  autoStart: boolean;
  systemProxy: boolean;
  enhancedMode: boolean;
  tunConfig: TunConfig;
  allowLan: boolean;
  gatewayMode: boolean;
  httpPort: number;
  socksPort: number;
  mixedPort: number;
  logLevel: LogLevel;
}

export type TunMode = "normal" | "tun";

export interface TunRuntimeStatus {
  running: boolean;
  mode: TunMode;
  targetEnhancedMode: boolean;
  requiresAdmin: boolean;
  lastError: string | null;
  effectiveDnsMode: DnsMode | null;
}

// Tray
export interface SiteRule {
  domain: string;
  outbound: OutboundType;
  outboundNode?: string;
}
