use std::sync::Arc;
use tokio::process::{Child, Command};
use tokio::sync::Mutex;

use super::clash_api::ClashApi;
use super::config;
use super::storage::AppSettings;

pub struct SingboxProcess {
    child: Arc<Mutex<Option<Child>>>,
    api: ClashApi,
    singbox_path: String,
}

impl SingboxProcess {
    pub fn new(singbox_path: String) -> Self {
        Self {
            child: Arc::new(Mutex::new(None)),
            api: ClashApi::new(),
            singbox_path,
        }
    }

    pub fn api(&self) -> &ClashApi {
        &self.api
    }

    pub async fn start(&self, settings: &AppSettings) -> Result<(), String> {
        // If Clash API is already responding, sing-box is already running (e.g. orphan from previous cargo tauri dev)
        if self.api.health_check().await.unwrap_or(false) {
            eprintln!("[singbox] existing instance detected, reusing");
            return Ok(());
        }

        let config_path = config::write_config(settings)?;
        self.stop().await?;

        eprintln!("[singbox] spawning: {} run -c {}", &self.singbox_path, &config_path);

        let mut child = Command::new(&self.singbox_path)
            .arg("run")
            .arg("-c")
            .arg(&config_path)
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::inherit())
            .kill_on_drop(true)
            .spawn()
            .map_err(|e| format!("failed to spawn sing-box: {}", e))?;

        // Set process group so child dies with parent on Unix
        #[cfg(unix)]
        if let Some(pid) = child.id() {
            unsafe { libc::setpgid(pid as i32, 0); }
        }

        *self.child.lock().await = Some(child);

        for _ in 0..50 {
            tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;
            if self.api.health_check().await.unwrap_or(false) {
                eprintln!("[singbox] started successfully");
                return Ok(());
            }
        }

        Err("sing-box started but Clash API not responding after 5s".to_string())
    }

    pub async fn stop(&self) -> Result<(), String> {
        let mut guard = self.child.lock().await;
        if let Some(ref mut child) = *guard {
            child.kill().await.map_err(|e| e.to_string())?;
            child.wait().await.map_err(|e| e.to_string())?;
        }
        *guard = None;
        Ok(())
    }

    /// Stop any running sing-box (managed or orphan), then start fresh
    pub async fn restart(&self, settings: &AppSettings) -> Result<(), String> {
        self.stop().await?;

        // Kill orphan if port still occupied
        if self.api.health_check().await.unwrap_or(false) {
            eprintln!("[singbox] orphan detected, killing");
            let _ = std::process::Command::new("pkill")
                .arg("-f")
                .arg("sing-box run")
                .output();
            for _ in 0..10 {
                tokio::time::sleep(tokio::time::Duration::from_millis(200)).await;
                if !self.api.health_check().await.unwrap_or(false) {
                    break;
                }
            }
        }

        let config_path = config::write_config(settings)?;
        eprintln!("[singbox] spawning: {} run -c {}", &self.singbox_path, &config_path);

        let mut child = Command::new(&self.singbox_path)
            .arg("run")
            .arg("-c")
            .arg(&config_path)
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::inherit())
            .kill_on_drop(true)
            .spawn()
            .map_err(|e| format!("failed to spawn sing-box: {}", e))?;

        #[cfg(unix)]
        if let Some(pid) = child.id() {
            unsafe { libc::setpgid(pid as i32, 0); }
        }

        *self.child.lock().await = Some(child);

        for _ in 0..50 {
            tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;
            if self.api.health_check().await.unwrap_or(false) {
                eprintln!("[singbox] restarted successfully");
                return Ok(());
            }
        }

        Err("sing-box restart failed: Clash API not responding after 5s".to_string())
    }

    /// Hot-reload config by writing new config and sending SIGHUP to sing-box process.
    /// Falls back to full restart if SIGHUP fails or no managed child exists.
    pub async fn reload(&self, settings: &AppSettings) -> Result<(), String> {
        config::write_config(settings)?;

        let guard = self.child.lock().await;
        if let Some(ref child) = *guard {
            if let Some(pid) = child.id() {
                #[cfg(unix)]
                {
                    let ret = unsafe { libc::kill(pid as i32, libc::SIGHUP) };
                    if ret == 0 {
                        eprintln!("[singbox] sent SIGHUP to pid {}", pid);
                        drop(guard);
                        tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;
                        return Ok(());
                    }
                    eprintln!("[singbox] SIGHUP failed (ret={}), falling back to restart", ret);
                }
                #[cfg(not(unix))]
                {
                    eprintln!("[singbox] SIGHUP not supported on this platform, falling back to restart");
                }
            }
        }
        drop(guard);
        self.restart(settings).await
    }

    pub async fn is_running(&self) -> bool {
        // Check actual API availability, not just child process existence
        self.api.health_check().await.unwrap_or(false)
    }
}
