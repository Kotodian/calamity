use serde::Serialize;
use std::sync::atomic::{AtomicU64, Ordering};
use tauri::{AppHandle, Emitter, Manager};
use tokio_util::sync::CancellationToken;

use crate::singbox::clash_api::LogMessage;
use crate::singbox::process::SingboxProcess;

/// Global generation counter — each `start_log_stream` bumps it.
/// Older tasks compare against it and self-terminate.
static STREAM_GENERATION: AtomicU64 = AtomicU64::new(0);

#[derive(Clone, Serialize)]
pub struct LogEvent {
    pub level: String,
    pub message: String,
    pub timestamp: String,
    pub source: String,
}

fn parse_log_source(payload: &str) -> (String, String) {
    // Strip "[session_id duration] " prefix
    let rest = if payload.starts_with('[') {
        payload
            .find("] ")
            .map(|i| &payload[i + 2..])
            .unwrap_or(payload)
    } else {
        payload
    };

    if let Some(colon) = rest.find("]: ") {
        let raw_source = &rest[..colon + 1];
        let message = &rest[colon + 3..];

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
    // Bump generation so any previous stream task will self-terminate
    let gen = STREAM_GENERATION.fetch_add(1, Ordering::SeqCst) + 1;

    let process = app
        .state::<std::sync::Arc<SingboxProcess>>()
        .inner()
        .clone();

    // If there's a previous cancellation token, cancel it
    let cancel = app
        .try_state::<LogStreamCancel>()
        .map(|s| s.0.clone());
    if let Some(prev) = cancel {
        prev.cancel();
    }
    let token = CancellationToken::new();
    app.manage(LogStreamCancel(token.clone()));

    eprintln!("[logs] start_log_stream called, level={}, gen={}", level, gen);

    // Emit version info as first log entry
    match process.api().version().await {
        Ok(ver) => {
            let _ = app.emit(
                "singbox-log",
                &LogEvent {
                    level: "info".to_string(),
                    message: format!("connected to {}", ver.version),
                    timestamp: now_timestamp(),
                    source: "calamity".to_string(),
                },
            );
        }
        Err(e) => eprintln!("[logs] failed to get version: {}", e),
    }

    let response = match process.api().logs_stream(&level).await {
        Ok(r) => r,
        Err(e) => {
            eprintln!("[logs] failed to connect log stream: {}", e);
            return Err(e);
        }
    };

    tokio::spawn(async move {
        let mut response = response;
        let mut buffer = String::new();

        loop {
            // Check if this task has been superseded
            if token.is_cancelled() || STREAM_GENERATION.load(Ordering::SeqCst) != gen {
                eprintln!("[logs] stream gen={} cancelled", gen);
                break;
            }

            tokio::select! {
                _ = token.cancelled() => {
                    eprintln!("[logs] stream gen={} cancelled via token", gen);
                    break;
                }
                chunk = response.chunk() => {
                    match chunk {
                        Ok(Some(data)) => {
                            let text = String::from_utf8_lossy(&data);
                            buffer.push_str(&text);

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
                        Ok(None) => break,
                        Err(_) => break,
                    }
                }
            }
        }
    });

    Ok(())
}

/// Wrapper so we can store the token in Tauri app state.
struct LogStreamCancel(CancellationToken);
