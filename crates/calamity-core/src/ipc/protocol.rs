use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::singbox::rules_storage::RouteRuleConfig;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Request {
    pub id: u32,
    pub command: Command,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", content = "data")]
pub enum Response {
    Ok(Value),
    Error(String),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", content = "data")]
pub enum Command {
    // Connection control
    Start,
    Stop,
    Restart,
    Status,

    // Mode
    SetProxyMode { mode: String },

    // Nodes
    GetNodes,
    AddNode { uri: String, group: String },
    RemoveNode { name: String },
    SelectNode { group: String, node: String },
    LatencyTest { group: String, node: Option<String> },

    // Rules
    GetRules,
    AddRule { rule: RouteRuleConfig },
    RemoveRule { id: String },
    SetRuleEnabled { id: String, enabled: bool },
    SetFinalOutbound { outbound: String, node: Option<String> },

    // Subscriptions
    GetSubscriptions,
    AddSubscription { name: String, url: String },
    RemoveSubscription { id: String },
    UpdateSubscription { id: Option<String> },

    // DNS
    GetDnsServers,
    SetDnsMode { mode: String },
    SetFakeIpRange { range: String },
    AddDnsServer { name: String, address: String, detour: Option<String>, domain_resolver: Option<String> },
    RemoveDnsServer { id: String },
    AddDnsRule { match_type: String, match_value: String, server: String },
    RemoveDnsRule { id: String },
    SetDnsFinal { server: String },

    // Settings
    GetSettings,
    UpdateSettings { settings: Value },

    // BGP
    BgpGetSettings,
    BgpAddPeer { name: String, address: String },
    BgpRemovePeer { id: String },
    BgpPullRules { peer_addr: String },
    BgpApplyRules { rules: Value },
    BgpDiscoverPeers,

    // Tailscale
    TailscaleStatus,
    TailscaleAuth,
    TailscaleLogout,
    TailscaleSetExitNode { node: Option<String> },
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn request_serializes_to_tagged_json() {
        let req = Request {
            id: 1,
            command: Command::Start,
        };
        let json = serde_json::to_string(&req).unwrap();
        assert!(json.contains("\"id\":1"));
        assert!(json.contains("\"type\":\"Start\""));
    }

    #[test]
    fn request_with_data_serializes_correctly() {
        let req = Request {
            id: 42,
            command: Command::SetProxyMode { mode: "rule".to_string() },
        };
        let json = serde_json::to_string(&req).unwrap();
        let parsed: Request = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed.id, 42);
        match parsed.command {
            Command::SetProxyMode { mode } => assert_eq!(mode, "rule"),
            _ => panic!("wrong command variant"),
        }
    }

    #[test]
    fn response_ok_roundtrip() {
        let resp = Response::Ok(serde_json::json!({"running": true}));
        let json = serde_json::to_string(&resp).unwrap();
        let parsed: Response = serde_json::from_str(&json).unwrap();
        match parsed {
            Response::Ok(v) => assert_eq!(v["running"], true),
            _ => panic!("expected Ok"),
        }
    }

    #[test]
    fn response_error_roundtrip() {
        let resp = Response::Error("not connected".to_string());
        let json = serde_json::to_string(&resp).unwrap();
        let parsed: Response = serde_json::from_str(&json).unwrap();
        match parsed {
            Response::Error(msg) => assert_eq!(msg, "not connected"),
            _ => panic!("expected Error"),
        }
    }

    #[test]
    fn all_commands_serialize() {
        // Verify every variant can serialize without panic
        let commands = vec![
            Command::Start,
            Command::Stop,
            Command::Restart,
            Command::Status,
            Command::SetProxyMode { mode: "direct".into() },
            Command::GetNodes,
            Command::AddNode { uri: "vless://test@1.2.3.4:443".into(), group: "proxy".into() },
            Command::RemoveNode { name: "jp-1".into() },
            Command::SelectNode { group: "proxy".into(), node: "jp-1".into() },
            Command::LatencyTest { group: "proxy".into(), node: None },
            Command::GetRules,
            Command::RemoveRule { id: "r1".into() },
            Command::SetRuleEnabled { id: "r1".into(), enabled: true },
            Command::SetFinalOutbound { outbound: "proxy".into(), node: Some("jp-1".into()) },
            Command::GetSubscriptions,
            Command::AddSubscription { name: "my-sub".into(), url: "https://example.com/sub".into() },
            Command::RemoveSubscription { id: "s1".into() },
            Command::UpdateSubscription { id: None },
            Command::GetDnsServers,
            Command::AddDnsServer { name: "cf".into(), address: "https://1.1.1.1/dns-query".into(), detour: None, domain_resolver: None },
            Command::RemoveDnsServer { id: "cf".into() },
            Command::AddDnsRule { match_type: "rule_set".into(), match_value: "geosite-cn".into(), server: "dns-direct".into() },
            Command::RemoveDnsRule { id: "dr-1".into() },
            Command::SetDnsFinal { server: "dns-direct".into() },
            Command::GetSettings,
            Command::UpdateSettings { settings: serde_json::json!({}) },
            Command::BgpGetSettings,
            Command::BgpAddPeer { name: "peer1".into(), address: "100.64.0.1".into() },
            Command::BgpRemovePeer { id: "p1".into() },
            Command::BgpPullRules { peer_addr: "100.64.0.1".into() },
            Command::BgpApplyRules { rules: serde_json::json!({}) },
            Command::BgpDiscoverPeers,
            Command::TailscaleStatus,
            Command::TailscaleAuth,
            Command::TailscaleLogout,
            Command::TailscaleSetExitNode { node: Some("us-west".into()) },
        ];
        for cmd in commands {
            let req = Request { id: 0, command: cmd };
            let json = serde_json::to_string(&req).unwrap();
            let _: Request = serde_json::from_str(&json).unwrap();
        }
    }
}
