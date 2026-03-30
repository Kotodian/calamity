use std::sync::Arc;
use tokio::process::{Child, Command};
use tokio::sync::Mutex;

use crate::commands::settings::TunRuntimeStatus;

use super::clash_api::ClashApi;
use super::config;
use super::storage::AppSettings;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum RunMode {
    Normal,
    Tun,
}

impl RunMode {
    fn as_str(self) -> &'static str {
        match self {
            Self::Normal => "normal",
            Self::Tun => "tun",
        }
    }
}

#[derive(Clone, Debug, Default)]
struct RuntimeState {
    mode: Option<RunMode>,
    config_path: Option<String>,
    last_error: Option<String>,
}

pub struct SingboxProcess {
    child: Arc<Mutex<Option<Child>>>,
    runtime: Arc<Mutex<RuntimeState>>,
    api: ClashApi,
    singbox_path: String,
}

impl SingboxProcess {
    pub fn new(singbox_path: String) -> Self {
        Self {
            child: Arc::new(Mutex::new(None)),
            runtime: Arc::new(Mutex::new(RuntimeState::default())),
            api: ClashApi::new(),
            singbox_path,
        }
    }

    pub fn api(&self) -> &ClashApi {
        &self.api
    }

    pub async fn start(&self, settings: &AppSettings) -> Result<(), String> {
        let desired_mode = run_mode_for_settings(settings);
        let current_mode = self.runtime.lock().await.mode;

        // If Clash API is already responding in the expected mode, reuse it.
        if self.api.health_check().await.unwrap_or(false) && current_mode == Some(desired_mode) {
            eprintln!("[singbox] existing instance detected, reusing");
            return Ok(());
        }

        let config_path = config::write_config(settings)?;
        self.stop().await?;
        self.start_with_config(settings, &config_path).await
    }

    async fn start_with_config(
        &self,
        settings: &AppSettings,
        config_path: &str,
    ) -> Result<(), String> {
        let run_mode = run_mode_for_settings(settings);

        eprintln!(
            "[singbox] spawning: {} run -c {}",
            &self.singbox_path, config_path
        );

        let spawned_child = match run_mode {
            RunMode::Normal => Some(self.spawn_managed(config_path)?),
            RunMode::Tun => {
                self.spawn_privileged_tun(config_path).await?;
                None
            }
        };

        if let Some(child) = spawned_child {
            *self.child.lock().await = Some(child);
        }

        for _ in 0..50 {
            tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;
            if self.api.health_check().await.unwrap_or(false) {
                self.set_runtime(Some(run_mode), Some(config_path.to_string()), None)
                    .await;
                eprintln!(
                    "[singbox] started successfully in {} mode",
                    run_mode.as_str()
                );
                return Ok(());
            }
        }

        let message = format!(
            "sing-box started in {} mode but Clash API not responding after 5s",
            run_mode.as_str()
        );
        self.set_runtime(
            Some(run_mode),
            Some(config_path.to_string()),
            Some(message.clone()),
        )
        .await;
        Err(message)
    }

    pub async fn stop(&self) -> Result<(), String> {
        let mut guard = self.child.lock().await;
        if let Some(ref mut child) = *guard {
            child.kill().await.map_err(|e| e.to_string())?;
            child.wait().await.map_err(|e| e.to_string())?;
        }
        *guard = None;

        let runtime = self.runtime.lock().await.clone();
        if runtime.mode == Some(RunMode::Tun) || self.api.health_check().await.unwrap_or(false) {
            let pattern = runtime
                .config_path
                .unwrap_or_else(|| "sing-box run".to_string());
            let _ = std::process::Command::new("pkill")
                .arg("-f")
                .arg(pattern)
                .output();
        }

        self.set_runtime(None, None, None).await;
        Ok(())
    }

    /// Stop any running sing-box (managed or orphan), then start fresh
    pub async fn restart(&self, settings: &AppSettings) -> Result<(), String> {
        self.stop().await?;
        let config_path = config::write_config(settings)?;
        self.start_with_config(settings, &config_path).await
    }

    /// Hot-reload config by writing new config and sending SIGHUP to sing-box process.
    /// Falls back to full restart if SIGHUP fails or no managed child exists.
    pub async fn reload(&self, settings: &AppSettings) -> Result<(), String> {
        if settings.enhanced_mode {
            return self.restart(settings).await;
        }

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
                    eprintln!(
                        "[singbox] SIGHUP failed (ret={}), falling back to restart",
                        ret
                    );
                }
                #[cfg(not(unix))]
                {
                    eprintln!(
                        "[singbox] SIGHUP not supported on this platform, falling back to restart"
                    );
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

    pub async fn tun_status(&self, settings: &AppSettings) -> TunRuntimeStatus {
        let runtime = self.runtime.lock().await.clone();
        let running = self.is_running().await;
        let mode = runtime
            .mode
            .unwrap_or_else(|| run_mode_for_settings(settings))
            .as_str()
            .to_string();

        TunRuntimeStatus {
            running,
            mode,
            target_enhanced_mode: settings.enhanced_mode,
            requires_admin: settings.enhanced_mode,
            last_error: runtime.last_error,
            effective_dns_mode: settings.enhanced_mode.then(|| "fake-ip".to_string()),
        }
    }

    fn spawn_managed(&self, config_path: &str) -> Result<Child, String> {
        let child = Command::new(&self.singbox_path)
            .arg("run")
            .arg("-c")
            .arg(config_path)
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::inherit())
            .kill_on_drop(true)
            .spawn()
            .map_err(|e| format!("failed to spawn sing-box: {}", e))?;

        #[cfg(unix)]
        if let Some(pid) = child.id() {
            unsafe { libc::setpgid(pid as i32, 0) };
        }

        Ok(child)
    }

    async fn spawn_privileged_tun(&self, config_path: &str) -> Result<(), String> {
        let script = build_privileged_osascript(&self.singbox_path, config_path);

        let status = Command::new("osascript")
            .arg("-e")
            .arg(script)
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::inherit())
            .status()
            .await
            .map_err(|e| format!("failed to request administrator privileges: {}", e))?;

        if !status.success() {
            return Err(
                "administrator privileges were denied or sing-box failed to start in TUN mode"
                    .to_string(),
            );
        }

        Ok(())
    }

    async fn set_runtime(
        &self,
        mode: Option<RunMode>,
        config_path: Option<String>,
        last_error: Option<String>,
    ) {
        let mut runtime = self.runtime.lock().await;
        runtime.mode = mode;
        runtime.config_path = config_path;
        runtime.last_error = last_error;
    }
}

fn run_mode_for_settings(settings: &AppSettings) -> RunMode {
    if settings.enhanced_mode {
        RunMode::Tun
    } else {
        RunMode::Normal
    }
}

fn build_privileged_osascript(singbox_path: &str, config_path: &str) -> String {
    let shell_command = build_tun_run_command(singbox_path, config_path);
    format!(
        "do shell script \"{}\" with administrator privileges",
        escape_applescript_string(&shell_command)
    )
}

fn build_tun_run_command(singbox_path: &str, config_path: &str) -> String {
    format!(
        "{} run -c {}",
        shell_quote(singbox_path),
        shell_quote(config_path),
    )
}

fn shell_quote(value: &str) -> String {
    format!("'{}'", value.replace('\'', r"'\''"))
}

fn escape_applescript_string(value: &str) -> String {
    value.replace('\\', "\\\\").replace('"', "\\\"")
}

#[cfg(test)]
mod tests {
    use super::{
        build_privileged_osascript, build_tun_run_command, run_mode_for_settings, RunMode,
    };
    use crate::singbox::storage::AppSettings;

    #[test]
    fn normal_settings_use_managed_process_mode() {
        let settings = AppSettings::default();
        assert_eq!(run_mode_for_settings(&settings), RunMode::Normal);
    }

    #[test]
    fn enhanced_mode_uses_privileged_tun_mode() {
        let mut settings = AppSettings::default();
        settings.enhanced_mode = true;
        assert_eq!(run_mode_for_settings(&settings), RunMode::Tun);
    }

    #[test]
    fn tun_command_quotes_paths_for_shell_execution() {
        let command = build_tun_run_command(
            "/Applications/Calamity App/sing-box",
            "/tmp/calamity config.json",
        );

        assert_eq!(
            command,
            "'/Applications/Calamity App/sing-box' run -c '/tmp/calamity config.json'"
        );
    }

    #[test]
    fn privileged_tun_osascript_wraps_shell_command() {
        let script = build_privileged_osascript("/usr/local/bin/sing-box", "/tmp/config.json");

        assert_eq!(
            script,
            "do shell script \"'/usr/local/bin/sing-box' run -c '/tmp/config.json'\" with administrator privileges"
        );
    }
}
