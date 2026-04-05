use clap::{Parser, Subcommand};
use calamity_core::ipc::client::IpcClient;
use calamity_core::ipc::protocol::{Command, Response};
use calamity_core::ipc::server::default_socket_path;

#[derive(Parser)]
#[command(name = "calamity", version, about = "Calamity proxy CLI client")]
struct Cli {
    /// Custom socket path
    #[arg(long, global = true)]
    socket: Option<String>,

    /// Output as JSON
    #[arg(long, global = true)]
    json: bool,

    #[command(subcommand)]
    command: CliCommand,
}

#[derive(Subcommand)]
enum CliCommand {
    /// Start the proxy
    Start,
    /// Stop the proxy
    Stop,
    /// Restart the proxy
    Restart,
    /// Show proxy status
    Status,

    /// Switch proxy mode
    Mode {
        /// Mode: direct, rule, or global
        mode: String,
    },

    /// Node management
    Node {
        #[command(subcommand)]
        action: NodeAction,
    },

    /// Rule management
    Rule {
        #[command(subcommand)]
        action: RuleAction,
    },

    /// Subscription management
    Sub {
        #[command(subcommand)]
        action: SubAction,
    },

    /// Configuration management
    Config {
        #[command(subcommand)]
        action: ConfigAction,
    },

    /// BGP rule sync
    Bgp {
        #[command(subcommand)]
        action: BgpAction,
    },

    /// Tailscale integration
    Tailscale {
        #[command(subcommand)]
        action: TailscaleAction,
    },
}

#[derive(Subcommand)]
enum NodeAction {
    /// List all groups and nodes
    List,
    /// Select a node in a group
    Select {
        /// Group name
        group: String,
        /// Node name
        node: String,
    },
    /// Test latency
    Test {
        /// Group name
        group: String,
        /// Node name (omit for batch test)
        node: Option<String>,
    },
}

#[derive(Subcommand)]
enum RuleAction {
    /// List all rules
    List,
    /// Add a rule
    Add {
        /// Match type (e.g. domain-suffix, geosite, geoip)
        #[arg(name = "type")]
        match_type: String,
        /// Match value
        value: String,
        /// Outbound (proxy, direct, reject)
        outbound: String,
    },
    /// Remove a rule by ID
    Remove {
        /// Rule ID
        id: String,
    },
}

#[derive(Subcommand)]
enum SubAction {
    /// List subscriptions
    List,
    /// Update subscriptions
    Update {
        /// Subscription ID (omit to update all)
        id: Option<String>,
    },
}

#[derive(Subcommand)]
enum ConfigAction {
    /// Show current settings
    Get,
    /// Update a setting
    Set {
        /// Setting key (e.g. httpPort, socksPort, logLevel)
        key: String,
        /// Setting value
        value: String,
    },
}

#[derive(Subcommand)]
enum BgpAction {
    /// Show BGP status and peers
    Status,
    /// Pull rules from a peer
    Pull {
        /// Peer address or ID
        peer: String,
    },
    /// Apply last pulled rules
    Apply,
    /// Discover peers on Tailnet
    Discover,
}

#[derive(Subcommand)]
enum TailscaleAction {
    /// Show Tailscale status
    Status,
    /// OAuth login and register node
    Auth,
    /// Logout from Tailscale
    Logout,
    /// Switch exit node
    ExitNode {
        /// Exit node name (omit to disable)
        node: Option<String>,
    },
}

fn cli_to_command(cmd: CliCommand) -> Command {
    match cmd {
        CliCommand::Start => Command::Start,
        CliCommand::Stop => Command::Stop,
        CliCommand::Restart => Command::Restart,
        CliCommand::Status => Command::Status,
        CliCommand::Mode { mode } => Command::SetProxyMode { mode },
        CliCommand::Node { action } => match action {
            NodeAction::List => Command::GetNodes,
            NodeAction::Select { group, node } => Command::SelectNode { group, node },
            NodeAction::Test { group, node } => Command::LatencyTest { group, node },
        },
        CliCommand::Rule { action } => match action {
            RuleAction::List => Command::GetRules,
            RuleAction::Add {
                match_type,
                value,
                outbound,
            } => {
                let rule = calamity_core::singbox::rules_storage::RouteRuleConfig {
                    id: uuid::Uuid::new_v4().to_string(),
                    name: format!("{} {}", match_type, value),
                    enabled: true,
                    match_type,
                    match_value: value,
                    outbound,
                    outbound_node: None,
                    rule_set_url: None,
                    rule_set_local_path: None,
                    download_detour: None,
                    invert: false,
                    order: 0,
                };
                Command::AddRule { rule }
            }
            RuleAction::Remove { id } => Command::RemoveRule { id },
        },
        CliCommand::Sub { action } => match action {
            SubAction::List => Command::GetSubscriptions,
            SubAction::Update { id } => Command::UpdateSubscription { id },
        },
        CliCommand::Config { action } => match action {
            ConfigAction::Get => Command::GetSettings,
            ConfigAction::Set { key, value } => {
                // Try to parse value as number or bool, fall back to string
                let json_value = if let Ok(n) = value.parse::<u64>() {
                    serde_json::json!({ key: n })
                } else if let Ok(b) = value.parse::<bool>() {
                    serde_json::json!({ key: b })
                } else {
                    serde_json::json!({ key: value })
                };
                Command::UpdateSettings { settings: json_value }
            }
        },
        CliCommand::Bgp { action } => match action {
            BgpAction::Status => Command::BgpGetSettings,
            BgpAction::Pull { peer } => Command::BgpPullRules { peer_addr: peer },
            BgpAction::Apply => Command::BgpApplyRules {
                rules: serde_json::json!(null),
            },
            BgpAction::Discover => Command::BgpDiscoverPeers,
        },
        CliCommand::Tailscale { action } => match action {
            TailscaleAction::Status => Command::TailscaleStatus,
            TailscaleAction::Auth => Command::TailscaleAuth,
            TailscaleAction::Logout => Command::TailscaleLogout,
            TailscaleAction::ExitNode { node } => Command::TailscaleSetExitNode { node },
        },
    }
}

fn format_response(resp: &Response, json_mode: bool) {
    match resp {
        Response::Ok(value) => {
            if json_mode {
                println!("{}", serde_json::to_string_pretty(value).unwrap_or_default());
            } else {
                print_value(value, 0);
            }
        }
        Response::Error(msg) => {
            if json_mode {
                println!("{}", serde_json::json!({"error": msg}));
            } else {
                eprintln!("Error: {}", msg);
            }
            std::process::exit(1);
        }
    }
}

fn print_value(value: &serde_json::Value, indent: usize) {
    let pad = " ".repeat(indent);
    match value {
        serde_json::Value::Null => println!("{}(null)", pad),
        serde_json::Value::Bool(b) => println!("{}{}", pad, b),
        serde_json::Value::Number(n) => println!("{}{}", pad, n),
        serde_json::Value::String(s) => println!("{}{}", pad, s),
        serde_json::Value::Array(arr) => {
            for item in arr {
                print_value(item, indent);
            }
        }
        serde_json::Value::Object(map) => {
            for (key, val) in map {
                match val {
                    serde_json::Value::Object(_) | serde_json::Value::Array(_) => {
                        println!("{}{}:", pad, key);
                        print_value(val, indent + 2);
                    }
                    _ => {
                        print!("{}{}: ", pad, key);
                        print_value(val, 0);
                    }
                }
            }
        }
    }
}

#[tokio::main]
async fn main() {
    let cli = Cli::parse();

    let socket_path = cli
        .socket
        .map(std::path::PathBuf::from)
        .unwrap_or_else(default_socket_path);

    let mut client = match IpcClient::connect(&socket_path).await {
        Ok(c) => c,
        Err(e) => {
            if cli.json {
                println!("{}", serde_json::json!({"error": format!("Cannot connect: {e}. Is Calamity running?")}));
            } else {
                eprintln!("Cannot connect to Calamity at {}.", socket_path.display());
                eprintln!("Is the app or daemon running?");
            }
            std::process::exit(1);
        }
    };

    let command = cli_to_command(cli.command);

    match client.call(command).await {
        Ok(resp) => format_response(&resp, cli.json),
        Err(e) => {
            if cli.json {
                println!("{}", serde_json::json!({"error": e}));
            } else {
                eprintln!("Error: {}", e);
            }
            std::process::exit(1);
        }
    }
}
