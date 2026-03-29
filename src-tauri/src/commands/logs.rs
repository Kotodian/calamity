use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};

use crate::singbox::clash_api::LogMessage;
use crate::singbox::process::SingboxProcess;

#[derive(Clone, Serialize)]
pub struct LogEvent {
    pub level: String,
    pub message: String,
    pub timestamp: String,
    pub source: String,
}

fn parse_log_source(payload: &str) -> (String, String) {
    // sing-box payload examples:
    //   "[1501454221 0ms] inbound/mixed[mixed-in]: inbound connection from 127.0.0.1:52341"
    //   "inbound/mixed[mixed-in]: tcp server started at 127.0.0.1:7893"
    //   "sing-box started (0.00s)"

    // Strip "[session_id duration] " prefix
    let rest = if payload.starts_with('[') {
        payload.find("] ").map(|i| &payload[i + 2..]).unwrap_or(payload)
    } else {
        payload
    };

    // Source is like "inbound/mixed[mixed-in]" or "outbound/direct[direct-out]"
    // Extract the tag inside brackets as source, e.g. "mixed-in", "direct-out"
    // The pattern: "category/type[tag]: message"
    if let Some(colon) = rest.find("]: ") {
        let raw_source = &rest[..colon + 1]; // "inbound/mixed[mixed-in]"
        let message = &rest[colon + 3..];

        // Extract tag from brackets: "mixed-in" from "inbound/mixed[mixed-in]"
        let source = if let Some(open) = raw_source.find('[') {
            &raw_source[open + 1..raw_source.len() - 1]
        } else {
            raw_source
        };

        (source.to_string(), message.to_string())
    } else if let Some(colon) = rest.find(": ") {
        (rest[..colon].to_string(), rest[colon + 2..].to_string())
    } else {
        ("system".to_string(), rest.to_string())
    }
}

fn now_timestamp() -> String {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    format!("{}", now)
}

#[tauri::command]
pub async fn start_log_stream(app: AppHandle, level: String) -> Result<(), String> {
    let process = app.state::<std::sync::Arc<SingboxProcess>>().inner().clone();

    eprintln!("[logs] start_log_stream called, level={}", level);

    // Emit version info as first log entry
    match process.api().version().await {
        Ok(ver) => {
            eprintln!("[logs] sing-box version: {}", ver.version);
            let _ = app.emit("singbox-log", &LogEvent {
                level: "info".to_string(),
                message: format!("connected to {}", ver.version),
                timestamp: now_timestamp(),
                source: "calamity".to_string(),
            });
        }
        Err(e) => eprintln!("[logs] failed to get version: {}", e),
    }

    let response = match process.api().logs_stream(&level).await {
        Ok(r) => {
            eprintln!("[logs] connected to log stream successfully");
            r
        }
        Err(e) => {
            eprintln!("[logs] failed to connect log stream: {}", e);
            return Err(e);
        }
    };

    tokio::spawn(async move {
        let mut response = response;
        let mut buffer = String::new();

        loop {
            match response.chunk().await {
                Ok(Some(chunk)) => {
                    let text = String::from_utf8_lossy(&chunk);
                    buffer.push_str(&text);

                    // Process complete lines
                    while let Some(newline_pos) = buffer.find('\n') {
                        let line = buffer[..newline_pos].trim().to_string();
                        buffer = buffer[newline_pos + 1..].to_string();

                        if line.is_empty() {
                            continue;
                        }

                        if let Ok(msg) = serde_json::from_str::<LogMessage>(&line) {
                            let (source, message) = parse_log_source(&msg.payload);
                            let event = LogEvent {
                                level: msg.level,
                                message,
                                timestamp: now_timestamp(),
                                source,
                            };
                            let _ = app.emit("singbox-log", &event);
                        }
                    }
                }
                Ok(None) => break,   // Stream ended
                Err(_) => break,     // Connection error
            }
        }
    });

    Ok(())
}
