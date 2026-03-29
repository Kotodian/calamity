// Connection
export type ConnectionStatus = "connected" | "disconnected" | "connecting";
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
}

// Rules
export type OutboundType = "proxy" | "direct" | "reject" | "tailnet";

export interface RouteRule {
  id: string;
  name: string;
  enabled: boolean;
  matchType: "domain-suffix" | "domain-keyword" | "domain-full" | "geosite" | "geoip" | "ip-cidr";
  matchValue: string;
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

// DNS
export type DnsMode = "fake-ip" | "redir-host" | "direct";

export interface DnsConfig {
  mode: DnsMode;
  servers: DnsServer[];
  fakeIpRange: string;
}

export interface DnsServer {
  id: string;
  name: string;
  address: string;
  enabled: boolean;
}

export interface DnsRule {
  id: string;
  domain: string;
  server: string;
  enabled: boolean;
}

export interface DnsCacheEntry {
  domain: string;
  ip: string;
  ttl: number;
  type: string;
}

// Settings
export type Theme = "light" | "dark" | "system";

export interface AppSettings {
  theme: Theme;
  singboxPath: string;
  autoStart: boolean;
  systemProxy: boolean;
  allowLan: boolean;
  httpPort: number;
  socksPort: number;
  mixedPort: number;
  logLevel: LogLevel;
}

// Tray
export interface SiteRule {
  domain: string;
  outbound: OutboundType;
  outboundNode?: string;
}
