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
    SelectNode { group: String, node: String },
    LatencyTest { group: String, node: Option<String> },

    // Rules
    GetRules,
    AddRule { rule: RouteRuleConfig },
    RemoveRule { id: String },

    // Subscriptions
    GetSubscriptions,
    UpdateSubscription { id: Option<String> },

    // DNS
    GetDnsServers,

    // Settings
    GetSettings,
    UpdateSettings { settings: Value },

    // BGP
    BgpGetSettings,
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
            Command::SelectNode { group: "proxy".into(), node: "jp-1".into() },
            Command::LatencyTest { group: "proxy".into(), node: None },
            Command::GetRules,
            Command::RemoveRule { id: "r1".into() },
            Command::GetSubscriptions,
            Command::UpdateSubscription { id: None },
            Command::GetDnsServers,
            Command::GetSettings,
            Command::UpdateSettings { settings: serde_json::json!({}) },
            Command::BgpGetSettings,
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
