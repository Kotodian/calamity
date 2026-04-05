use std::path::Path;
use tokio::net::UnixStream;

use super::framing::{read_frame, write_frame};
use super::protocol::{Command, Request, Response};

pub struct IpcClient {
    stream: UnixStream,
    next_id: u32,
}

impl IpcClient {
    /// Connect to the IPC server at the given socket path.
    pub async fn connect<P: AsRef<Path>>(socket_path: P) -> Result<Self, String> {
        let stream = UnixStream::connect(socket_path.as_ref())
            .await
            .map_err(|e| format!("connect to {}: {e}", socket_path.as_ref().display()))?;
        Ok(Self {
            stream,
            next_id: 1,
        })
    }

    /// Send a command and wait for the response.
    pub async fn call(&mut self, command: Command) -> Result<Response, String> {
        let request = Request {
            id: self.next_id,
            command,
        };
        self.next_id += 1;

        let req_bytes = serde_json::to_vec(&request)
            .map_err(|e| format!("serialize request: {e}"))?;

        let (mut reader, mut writer) = self.stream.split();

        write_frame(&mut writer, &req_bytes).await?;

        let frame = read_frame(&mut reader)
            .await?
            .ok_or_else(|| "server closed connection".to_string())?;

        let response: Response = serde_json::from_slice(&frame)
            .map_err(|e| format!("invalid response JSON: {e}"))?;

        Ok(response)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ipc::server::IpcServer;
    use std::sync::atomic::{AtomicU32, Ordering};

    #[tokio::test]
    async fn client_server_roundtrip() {
        let socket_path = std::env::temp_dir().join(format!(
            "calamity-test-{}.sock",
            std::process::id()
        ));
        let _ = std::fs::remove_file(&socket_path);

        let call_count = std::sync::Arc::new(AtomicU32::new(0));
        let count_clone = call_count.clone();

        let server = IpcServer::start(&socket_path, Box::new(move |req| {
            let count = count_clone.clone();
            Box::pin(async move {
                count.fetch_add(1, Ordering::Relaxed);
                match req.command {
                    Command::Status => Response::Ok(serde_json::json!({
                        "running": true,
                        "mode": "rule"
                    })),
                    Command::Stop => Response::Ok(serde_json::json!("stopped")),
                    _ => Response::Error("not implemented".to_string()),
                }
            })
        }))
        .await
        .unwrap();

        // Give server a moment to start
        tokio::time::sleep(std::time::Duration::from_millis(50)).await;

        let mut client = IpcClient::connect(&socket_path).await.unwrap();

        // Test Status command
        let resp = client.call(Command::Status).await.unwrap();
        match resp {
            Response::Ok(v) => {
                assert_eq!(v["running"], true);
                assert_eq!(v["mode"], "rule");
            }
            _ => panic!("expected Ok response"),
        }

        // Test Stop command
        let resp = client.call(Command::Stop).await.unwrap();
        match resp {
            Response::Ok(v) => assert_eq!(v, "stopped"),
            _ => panic!("expected Ok response"),
        }

        // Test unknown command
        let resp = client.call(Command::GetNodes).await.unwrap();
        match resp {
            Response::Error(msg) => assert_eq!(msg, "not implemented"),
            _ => panic!("expected Error response"),
        }

        assert_eq!(call_count.load(Ordering::Relaxed), 3);

        server.stop();
        let _ = std::fs::remove_file(&socket_path);
    }

    #[tokio::test]
    async fn client_connect_fails_for_missing_socket() {
        let result = IpcClient::connect("/tmp/nonexistent-calamity-test.sock").await;
        assert!(result.is_err());
    }
}
