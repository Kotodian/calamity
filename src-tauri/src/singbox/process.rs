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
                if let Err(error) = self.spawn_privileged_tun(config_path).await {
                    self.set_runtime(
                        Some(run_mode),
                        Some(config_path.to_string()),
                        Some(error.clone()),
                    )
                    .await;
                    return Err(error);
                }
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
        let message = if run_mode == RunMode::Tun {
            format_tun_start_timeout_message(config_path, &message)
        } else {
            message
        };
        self.set_runtime(
            Some(run_mode),
            Some(config_path.to_string()),
            Some(message.clone()),
        )
        .await;
        Err(message)
    }

    pub async fn stop(&self) -> Result<(), String> {
        let pre_stop_api_healthy = self.api.health_check().await.unwrap_or(false);
        let runtime = self.runtime.lock().await.clone();
        let mut guard = self.child.lock().await;
        let had_managed_child = guard.is_some();
        if let Some(ref mut child) = *guard {
            child.kill().await.map_err(|e| e.to_string())?;
            child.wait().await.map_err(|e| e.to_string())?;
        }
        *guard = None;
        drop(guard);

        if runtime.mode == Some(RunMode::Tun) {
            if let Some(config_path) = runtime.config_path.as_deref() {
                self.stop_privileged_tun(config_path).await?;
            }
        }

        if runtime.mode == Some(RunMode::Tun) || self.api.health_check().await.unwrap_or(false) {
            let pattern = runtime
                .config_path
                .clone()
                .unwrap_or_else(|| "sing-box run".to_string());
            // TUN processes run as root, need sudo to kill
            let _ = std::process::Command::new("sudo")
                .args(["-n", "pkill", "-9", "-f", &pattern])
                .output();
            let _ = std::process::Command::new("pkill")
                .args(["-9", "-f", &pattern])
                .output();
        }

        let should_confirm_shutdown =
            had_managed_child || runtime.mode.is_some() || pre_stop_api_healthy;
        if should_confirm_shutdown
            && !wait_for_condition(
                || async { !self.api.health_check().await.unwrap_or(false) },
                20,
                tokio::time::Duration::from_millis(100),
            )
            .await
        {
            let message = "sing-box stop timed out: Clash API still responding after 2s".to_string();
            self.set_runtime(runtime.mode, runtime.config_path.clone(), Some(message.clone()))
                .await;
            return Err(message);
        }

        self.set_runtime(None, None, None).await;
        Ok(())
    }

    /// Synchronous cleanup for use in exit handlers where async may deadlock.
    pub fn stop_sync(&self) {
        eprintln!("[singbox] stop_sync: starting cleanup");

        // Try to kill TUN process via PID file
        let pid_path = super::storage::app_data_dir().join("singbox-tun.pid");
        if let Ok(pid_str) = std::fs::read_to_string(&pid_path) {
            if let Ok(pid) = pid_str.trim().parse::<u32>() {
                eprintln!("[singbox] stop_sync: killing TUN pid {}", pid);
                let _ = terminate_pid_with_sudo_sync(pid);
            }
            let _ = std::fs::remove_file(&pid_path);
        }

        // Kill any remaining sing-box processes (needs sudo for root processes)
        let _ = std::process::Command::new("sudo")
            .args(["-n", "pkill", "-9", "-f", "sing-box run"])
            .output();
        // Also try unprivileged pkill for non-TUN managed child
        let _ = std::process::Command::new("pkill")
            .args(["-9", "-f", "sing-box run"])
            .output();

        eprintln!("[singbox] stop_sync: cleanup done");
    }

    /// Stop any running sing-box (managed or orphan), then start fresh
    pub async fn restart(&self, settings: &AppSettings) -> Result<(), String> {
        self.stop().await?;
        let config_path = config::write_config(settings)?;
        self.start_with_config(settings, &config_path).await
    }

    /// Hot-reload config by writing new config and sending SIGHUP to sing-box process.
    /// Works for both managed (normal) and privileged (TUN) processes.
    pub async fn reload(&self, settings: &AppSettings) -> Result<(), String> {
        // If sing-box isn't running, nothing to reload
        if !self.is_running().await {
            return Ok(());
        }

        config::write_config(settings)?;

        // Try managed child first
        let guard = self.child.lock().await;
        if let Some(ref child) = *guard {
            if let Some(pid) = child.id() {
                drop(guard);
                return self.send_sighup(pid as i32, false);
            }
        }
        drop(guard);

        // Try TUN process via PID file
        let runtime = self.runtime.lock().await.clone();
        if runtime.mode == Some(RunMode::Tun) {
            if let Some(config_path) = runtime.config_path.as_deref() {
                let pid_path = build_tun_pid_path(config_path);
                if let Ok(pid_str) = std::fs::read_to_string(&pid_path) {
                    if let Ok(pid) = pid_str.trim().parse::<i32>() {
                        return self.send_sighup(pid, true);
                    }
                }
            }
        }

        eprintln!("[singbox] no process found to reload");
        Ok(())
    }

    #[cfg(unix)]
    fn send_sighup(&self, pid: i32, use_sudo: bool) -> Result<(), String> {
        let ret = if use_sudo {
            std::process::Command::new("sudo")
                .args(["-n", "kill", "-HUP", &pid.to_string()])
                .output()
                .map(|o| if o.status.success() { 0 } else { -1 })
                .unwrap_or(-1)
        } else {
            unsafe { libc::kill(pid, libc::SIGHUP) }
        };

        if ret != 0 {
            return Err(format!("SIGHUP failed for pid {}", pid));
        }

        eprintln!("[singbox] sent SIGHUP to pid {}{}", pid, if use_sudo { " (sudo)" } else { "" });
        Ok(())
    }

    #[cfg(not(unix))]
    fn send_sighup(&self, _pid: i32, _use_sudo: bool) -> Result<(), String> {
        Err("SIGHUP not supported on this platform".to_string())
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
        // Try sudo first (works if sudoers entry is installed)
        let log_path = build_tun_log_path(config_path);
        let pid_path = build_tun_pid_path(config_path);
        let log_file = std::fs::File::create(&log_path).ok();
        let sudo_result = Command::new("sudo")
            .args(["-n", &self.singbox_path, "run", "-c", config_path])
            .stdout(log_file.map_or(std::process::Stdio::null(), |f| f.into()))
            .stderr(std::process::Stdio::null())
            .spawn();

        if let Ok(mut child) = sudo_result {
            // Wait briefly to check if sudo auth succeeded
            tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;
            match child.try_wait().map_err(|e| e.to_string())? {
                None => {
                    // Still running — sudo succeeded
                    if let Some(pid) = child.id() {
                        let _ = std::fs::write(&pid_path, pid.to_string());
                    }
                    tokio::spawn(async move { let _ = child.wait().await; });
                    return Ok(());
                }
                Some(_) => {
                    // Exited immediately — sudo auth failed, fall through
                }
            }
        }

        // Fallback to osascript: install sudoers + start sing-box in one admin prompt
        let sudoers_cmd = build_sudoers_install_command(&self.singbox_path);
        let run_cmd = build_tun_run_command(&self.singbox_path, config_path);
        let combined = format!("{} ; {}", sudoers_cmd, run_cmd);
        let script = build_privileged_shell_osascript(&combined);

        let output = Command::new("osascript")
            .arg("-e")
            .arg(script)
            .output()
            .await
            .map_err(|e| format!("failed to request administrator privileges: {}", e))?;

        if !output.status.success() {
            return Err(format_privileged_tun_error(
                &String::from_utf8_lossy(&output.stdout),
                &String::from_utf8_lossy(&output.stderr),
            ));
        }

        Ok(())
    }

    async fn stop_privileged_tun(&self, config_path: &str) -> Result<(), String> {
        // Try sudo kill using PID file
        let pid_path = build_tun_pid_path(config_path);
        if let Ok(pid_str) = std::fs::read_to_string(&pid_path) {
            if let Ok(pid) = pid_str.trim().parse::<u32>() {
                if terminate_pid_with_sudo(pid).await {
                    let _ = std::fs::remove_file(&pid_path);
                    return Ok(());
                }
            }
        }

        // Fallback to osascript
        let script = build_privileged_cleanup_osascript(config_path);

        let output = Command::new("osascript")
            .arg("-e")
            .arg(script)
            .output()
            .await
            .map_err(|e| format!("failed to request administrator privileges: {}", e))?;

        if !output.status.success() {
            return Err(format_privileged_tun_error(
                &String::from_utf8_lossy(&output.stdout),
                &String::from_utf8_lossy(&output.stderr),
            ));
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

async fn wait_for_condition<F, Fut>(
    mut predicate: F,
    attempts: usize,
    interval: tokio::time::Duration,
) -> bool
where
    F: FnMut() -> Fut,
    Fut: std::future::Future<Output = bool>,
{
    for attempt in 0..attempts {
        if predicate().await {
            return true;
        }

        if attempt + 1 < attempts {
            tokio::time::sleep(interval).await;
        }
    }

    false
}

fn build_privileged_cleanup_osascript(config_path: &str) -> String {
    let shell_command = build_tun_cleanup_command(config_path);
    build_privileged_shell_osascript(&shell_command)
}

fn build_privileged_shell_osascript(shell_command: &str) -> String {
    format!(
        "do shell script \"{}\" with administrator privileges",
        escape_applescript_string(shell_command)
    )
}

fn build_tun_run_command(singbox_path: &str, config_path: &str) -> String {
    let log_path = build_tun_log_path(config_path);
    let pid_path = build_tun_pid_path(config_path);
    let log_dir = std::path::Path::new(&log_path)
        .parent()
        .and_then(|path| path.to_str())
        .unwrap_or("/tmp");

    format!(
        "mkdir -p {} && {} run -c {} > {} 2>&1 & echo $! > {}",
        shell_quote(log_dir),
        shell_quote(singbox_path),
        shell_quote(config_path),
        shell_quote(&log_path),
        shell_quote(&pid_path),
    )
}

fn build_sudoers_install_command(singbox_path: &str) -> String {
    let user = std::env::var("USER")
        .or_else(|_| std::env::var("LOGNAME"))
        .unwrap_or_else(|_| "root".to_string());

    let resolved = std::fs::canonicalize(singbox_path)
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_else(|_| singbox_path.to_string());

    let mut paths = vec![resolved.clone()];
    if singbox_path != resolved {
        paths.push(singbox_path.to_string());
    }
    paths.push("/bin/kill".to_string());
    paths.push("/usr/bin/kill".to_string());

    let sudoers_content = format!(
        "{} ALL=(root) NOPASSWD: {}",
        user,
        paths.join(", ")
    );
    let sudoers_file = "/etc/sudoers.d/calamity-tun";

    format!(
        "echo {} > {} && chmod 0440 {}",
        shell_quote(&sudoers_content),
        shell_quote(sudoers_file),
        shell_quote(sudoers_file),
    )
}

fn build_tun_cleanup_command(config_path: &str) -> String {
    let pid_path = build_tun_pid_path(config_path);
    format!(
        "if [ -f {pid_path} ]; then pid=$(cat {pid_path}); kill -TERM \"$pid\" 2>/dev/null || true; for _ in 1 2 3 4 5 6 7 8 9 10; do kill -0 \"$pid\" 2>/dev/null || break; sleep 0.2; done; if kill -0 \"$pid\" 2>/dev/null; then kill -KILL \"$pid\" 2>/dev/null || true; for _ in 1 2 3 4 5 6 7 8 9 10; do kill -0 \"$pid\" 2>/dev/null || break; sleep 0.2; done; fi; rm -f {pid_path}; fi",
        pid_path = shell_quote(&pid_path),
    )
}

async fn terminate_pid_with_sudo(pid: u32) -> bool {
    let pid_str = pid.to_string();

    let term_status = Command::new("sudo")
        .args(["-n", "kill", "-TERM", &pid_str])
        .output()
        .await
        .ok()
        .map(|output| output.status.success())
        .unwrap_or(false);

    if !term_status && !is_pid_alive_with_sudo(&pid_str).await {
        return true;
    }

    if wait_for_pid_exit_with_sudo(&pid_str).await {
        return true;
    }

    let kill_status = Command::new("sudo")
        .args(["-n", "kill", "-KILL", &pid_str])
        .output()
        .await
        .ok()
        .map(|output| output.status.success())
        .unwrap_or(false);

    if !kill_status && !is_pid_alive_with_sudo(&pid_str).await {
        return true;
    }

    wait_for_pid_exit_with_sudo(&pid_str).await
}

async fn wait_for_pid_exit_with_sudo(pid: &str) -> bool {
    for _ in 0..10 {
        if !is_pid_alive_with_sudo(pid).await {
            return true;
        }
        tokio::time::sleep(tokio::time::Duration::from_millis(200)).await;
    }
    !is_pid_alive_with_sudo(pid).await
}

async fn is_pid_alive_with_sudo(pid: &str) -> bool {
    Command::new("sudo")
        .args(["-n", "kill", "-0", pid])
        .output()
        .await
        .ok()
        .map(|output| output.status.success())
        .unwrap_or(false)
}

fn terminate_pid_with_sudo_sync(pid: u32) -> bool {
    let pid_str = pid.to_string();

    let term_status = std::process::Command::new("sudo")
        .args(["-n", "kill", "-TERM", &pid_str])
        .output()
        .ok()
        .map(|output| output.status.success())
        .unwrap_or(false);

    if !term_status && !is_pid_alive_with_sudo_sync(&pid_str) {
        return true;
    }

    if wait_for_pid_exit_with_sudo_sync(&pid_str) {
        return true;
    }

    let kill_status = std::process::Command::new("sudo")
        .args(["-n", "kill", "-KILL", &pid_str])
        .output()
        .ok()
        .map(|output| output.status.success())
        .unwrap_or(false);

    if !kill_status && !is_pid_alive_with_sudo_sync(&pid_str) {
        return true;
    }

    wait_for_pid_exit_with_sudo_sync(&pid_str)
}

fn wait_for_pid_exit_with_sudo_sync(pid: &str) -> bool {
    for _ in 0..10 {
        if !is_pid_alive_with_sudo_sync(pid) {
            return true;
        }
        std::thread::sleep(std::time::Duration::from_millis(200));
    }
    !is_pid_alive_with_sudo_sync(pid)
}

fn is_pid_alive_with_sudo_sync(pid: &str) -> bool {
    std::process::Command::new("sudo")
        .args(["-n", "kill", "-0", pid])
        .output()
        .ok()
        .map(|output| output.status.success())
        .unwrap_or(false)
}

fn shell_quote(value: &str) -> String {
    format!("'{}'", value.replace('\'', r"'\''"))
}

fn escape_applescript_string(value: &str) -> String {
    value.replace('\\', "\\\\").replace('"', "\\\"")
}

fn build_tun_log_path(config_path: &str) -> String {
    let config_path = std::path::Path::new(config_path);
    let directory = config_path
        .parent()
        .unwrap_or_else(|| std::path::Path::new("/tmp"));
    directory.join("singbox-tun.log").to_string_lossy().to_string()
}

fn build_tun_pid_path(config_path: &str) -> String {
    let config_path = std::path::Path::new(config_path);
    let directory = config_path
        .parent()
        .unwrap_or_else(|| std::path::Path::new("/tmp"));
    directory.join("singbox-tun.pid").to_string_lossy().to_string()
}

fn format_privileged_tun_error(stdout: &str, stderr: &str) -> String {
    let details = [stderr.trim(), stdout.trim()]
        .into_iter()
        .filter(|value| !value.is_empty())
        .collect::<Vec<_>>()
        .join("\n");

    if details.contains("User canceled") || details.contains("(-128)") {
        return "administrator privileges were denied for TUN mode".to_string();
    }

    if details.is_empty() {
        "sing-box failed to start in TUN mode".to_string()
    } else {
        details
    }
}

fn format_tun_start_timeout_message(config_path: &str, fallback: &str) -> String {
    let log_path = build_tun_log_path(config_path);
    let log_tail = std::fs::read_to_string(&log_path)
        .ok()
        .and_then(|content| {
            let tail = content
                .lines()
                .rev()
                .take(20)
                .collect::<Vec<_>>()
                .into_iter()
                .rev()
                .collect::<Vec<_>>()
                .join("\n")
                .trim()
                .to_string();
            (!tail.is_empty()).then_some(tail)
        });

    match log_tail {
        Some(log_tail) => format!("{fallback}\n{log_tail}"),
        None => fallback.to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::{
        build_privileged_shell_osascript, build_tun_cleanup_command, build_tun_log_path,
        build_tun_pid_path, build_tun_run_command, format_privileged_tun_error,
        run_mode_for_settings, RunMode,
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
            "mkdir -p '/tmp' && '/Applications/Calamity App/sing-box' run -c '/tmp/calamity config.json' > '/tmp/singbox-tun.log' 2>&1 & echo $! > '/tmp/singbox-tun.pid'"
        );
    }

    #[test]
    fn privileged_shell_osascript_wraps_command() {
        let cmd = build_tun_run_command("/usr/local/bin/sing-box", "/tmp/config.json");
        let script = build_privileged_shell_osascript(&cmd);

        assert_eq!(
            script,
            "do shell script \"mkdir -p '/tmp' && '/usr/local/bin/sing-box' run -c '/tmp/config.json' > '/tmp/singbox-tun.log' 2>&1 & echo $! > '/tmp/singbox-tun.pid'\" with administrator privileges"
        );
    }

    #[test]
    fn tun_log_path_uses_config_directory() {
        assert_eq!(
            build_tun_log_path("/Users/test/Library/Application Support/com.calamity.app/singbox-config.json"),
            "/Users/test/Library/Application Support/com.calamity.app/singbox-tun.log"
        );
    }

    #[test]
    fn tun_pid_path_uses_config_directory() {
        assert_eq!(
            build_tun_pid_path(
                "/Users/test/Library/Application Support/com.calamity.app/singbox-config.json"
            ),
            "/Users/test/Library/Application Support/com.calamity.app/singbox-tun.pid"
        );
    }

    #[test]
    fn tun_cleanup_command_uses_pid_file_and_waits_for_exit() {
        let command = build_tun_cleanup_command("/tmp/config.json");

        assert_eq!(
            command,
            "if [ -f '/tmp/singbox-tun.pid' ]; then pid=$(cat '/tmp/singbox-tun.pid'); kill -TERM \"$pid\" 2>/dev/null || true; for _ in 1 2 3 4 5 6 7 8 9 10; do kill -0 \"$pid\" 2>/dev/null || break; sleep 0.2; done; if kill -0 \"$pid\" 2>/dev/null; then kill -KILL \"$pid\" 2>/dev/null || true; for _ in 1 2 3 4 5 6 7 8 9 10; do kill -0 \"$pid\" 2>/dev/null || break; sleep 0.2; done; fi; rm -f '/tmp/singbox-tun.pid'; fi"
        );
    }

    #[test]
    fn privileged_tun_failure_preserves_singbox_error_output() {
        let error = format_privileged_tun_error(
            "",
            "0:150: execution error: FATAL[0000] create service: initialize inbound[3]: legacy inbound fields are deprecated (-2700)",
        );

        assert!(error.contains("legacy inbound fields are deprecated"));
    }

    #[test]
    fn privileged_tun_failure_maps_user_cancellation_to_admin_denied() {
        let error = format_privileged_tun_error("", "128: execution error: User canceled. (-128)");

        assert_eq!(error, "administrator privileges were denied for TUN mode");
    }

    #[test]
    fn wait_for_condition_succeeds_when_predicate_eventually_matches() {
        let attempts = std::sync::Arc::new(std::sync::atomic::AtomicUsize::new(0));
        let attempts_for_check = attempts.clone();

        let matched = tauri::async_runtime::block_on(super::wait_for_condition(
            move || {
                let attempts_for_check = attempts_for_check.clone();
                async move { attempts_for_check.fetch_add(1, std::sync::atomic::Ordering::SeqCst) >= 2 }
            },
            5,
            std::time::Duration::from_millis(0),
        ));

        assert!(matched);
        assert_eq!(attempts.load(std::sync::atomic::Ordering::SeqCst), 3);
    }

    #[test]
    fn wait_for_condition_returns_false_after_timeout() {
        let matched = tauri::async_runtime::block_on(super::wait_for_condition(
            || async { false },
            3,
            std::time::Duration::from_millis(0),
        ));

        assert!(!matched);
    }
}
