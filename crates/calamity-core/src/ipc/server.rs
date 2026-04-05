use std::future::Future;
use std::path::{Path, PathBuf};
use std::pin::Pin;
use std::sync::Arc;
use tokio::net::UnixListener;
use tokio::sync::watch;

use super::framing::{read_frame, write_frame};
use super::protocol::{Request, Response};

/// Handler: takes a Request, returns a pinned future of Response.
pub type Handler =
    Arc<dyn Fn(Request) -> Pin<Box<dyn Future<Output = Response> + Send>> + Send + Sync>;

pub struct IpcServer {
    socket_path: PathBuf,
    shutdown_tx: watch::Sender<bool>,
}

impl IpcServer {
    /// Start the IPC server listening on the given Unix socket path.
    pub async fn start<P: AsRef<Path>>(
        socket_path: P,
        handler: Handler,
    ) -> Result<Self, String> {
        let socket_path = socket_path.as_ref().to_path_buf();

        // Remove stale socket file
        let _ = std::fs::remove_file(&socket_path);

        // Ensure parent directory exists
        if let Some(parent) = socket_path.parent() {
            std::fs::create_dir_all(parent)
                .map_err(|e| format!("create socket dir: {e}"))?;
        }

        let listener = UnixListener::bind(&socket_path)
            .map_err(|e| format!("bind {}: {e}", socket_path.display()))?;

        eprintln!("[ipc] listening on {}", socket_path.display());

        let (shutdown_tx, shutdown_rx) = watch::channel(false);

        let path_for_cleanup = socket_path.clone();
        let mut rx = shutdown_rx;

        tokio::spawn(async move {
            loop {
                tokio::select! {
                    accept_result = listener.accept() => {
                        match accept_result {
                            Ok((stream, _addr)) => {
                                let handler = handler.clone();
                                tokio::spawn(async move {
                                    if let Err(e) = handle_connection(stream, &handler).await {
                                        eprintln!("[ipc] connection error: {e}");
                                    }
                                });
                            }
                            Err(e) => {
                                eprintln!("[ipc] accept error: {e}");
                            }
                        }
                    }
                    _ = rx.changed() => {
                        if *rx.borrow() {
                            eprintln!("[ipc] server shutting down");
                            break;
                        }
                    }
                }
            }
            let _ = std::fs::remove_file(&path_for_cleanup);
        });

        Ok(Self {
            socket_path,
            shutdown_tx,
        })
    }

    pub fn socket_path(&self) -> &Path {
        &self.socket_path
    }

    pub fn stop(&self) {
        let _ = self.shutdown_tx.send(true);
    }
}

impl Drop for IpcServer {
    fn drop(&mut self) {
        self.stop();
    }
}

async fn handle_connection(
    stream: tokio::net::UnixStream,
    handler: &Handler,
) -> Result<(), String> {
    let (mut reader, mut writer) = stream.into_split();

    loop {
        let frame = read_frame(&mut reader).await?;
        let Some(payload) = frame else {
            break;
        };

        let request: Request = serde_json::from_slice(&payload)
            .map_err(|e| format!("invalid request JSON: {e}"))?;

        let response = handler(request).await;

        let resp_bytes = serde_json::to_vec(&response)
            .map_err(|e| format!("serialize response: {e}"))?;

        write_frame(&mut writer, &resp_bytes).await?;
    }

    Ok(())
}

/// Helper to create a Handler from an async closure.
pub fn handler_fn<F, Fut>(f: F) -> Handler
where
    F: Fn(Request) -> Fut + Send + Sync + 'static,
    Fut: Future<Output = Response> + Send + 'static,
{
    Arc::new(move |req| Box::pin(f(req)))
}

/// Get the default socket path for the current platform.
pub fn default_socket_path() -> PathBuf {
    #[cfg(target_os = "macos")]
    {
        let base = dirs::data_dir().expect("no data dir");
        base.join("com.calamity.app").join("calamity.sock")
    }
    #[cfg(target_os = "linux")]
    {
        // Always use /run/calamity/ so CLI and daemon agree on the path
        PathBuf::from("/run/calamity/calamity.sock")
    }
    #[cfg(not(any(target_os = "macos", target_os = "linux")))]
    {
        PathBuf::from("/tmp/calamity.sock")
    }
}
