use std::fs;
use std::path::PathBuf;

use crate::singbox::storage::app_data_dir;

const MAX_LOG_SIZE: u64 = 10 * 1024 * 1024; // 10 MB
const MAX_LOG_FILES: usize = 3;

/// Return the log directory: `<app_data_dir>/logs/`
pub fn log_dir() -> PathBuf {
    app_data_dir().join("logs")
}

/// Initialise the global logger.
///
/// Logs are written to `<app_data_dir>/logs/calamity.log` with rotation
/// (max 10 MB per file, 3 rotated files kept).  Also prints to stderr so
/// journald / Console.app can pick them up.
pub fn init(level: log::LevelFilter) -> Result<(), String> {
    let dir = log_dir();
    fs::create_dir_all(&dir).map_err(|e| format!("create log dir: {e}"))?;

    let log_path = dir.join("calamity.log");

    // Rotate before opening
    rotate(&log_path);

    let log_file = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&log_path)
        .map_err(|e| format!("open log file: {e}"))?;

    fern::Dispatch::new()
        .format(|out, message, record| {
            out.finish(format_args!(
                "{} [{}] [{}] {}",
                chrono::Local::now().format("%Y-%m-%d %H:%M:%S%.3f"),
                record.level(),
                record.target(),
                message
            ))
        })
        .level(level)
        // Suppress noisy deps
        .level_for("mdns_sd", log::LevelFilter::Warn)
        .level_for("reqwest", log::LevelFilter::Warn)
        .level_for("hyper", log::LevelFilter::Warn)
        .level_for("rustls", log::LevelFilter::Warn)
        .level_for("tungstenite", log::LevelFilter::Warn)
        .chain(std::io::stderr())
        .chain(log_file)
        .apply()
        .map_err(|e| format!("init logger: {e}"))
}

/// Rotate `calamity.log` → `calamity.1.log` → … → `calamity.{N}.log`, then
/// delete anything beyond `MAX_LOG_FILES`.
fn rotate(path: &PathBuf) {
    let size = fs::metadata(path).map(|m| m.len()).unwrap_or(0);
    if size < MAX_LOG_SIZE {
        return;
    }

    let dir = path.parent().unwrap();
    let stem = "calamity";
    let ext = "log";

    // Remove oldest
    let oldest = dir.join(format!("{stem}.{MAX_LOG_FILES}.{ext}"));
    let _ = fs::remove_file(&oldest);

    // Shift N-1 → N, … , 1 → 2
    for i in (1..MAX_LOG_FILES).rev() {
        let from = dir.join(format!("{stem}.{i}.{ext}"));
        let to = dir.join(format!("{stem}.{}.{ext}", i + 1));
        let _ = fs::rename(&from, &to);
    }

    // Current → 1
    let first = dir.join(format!("{stem}.1.{ext}"));
    let _ = fs::rename(path, &first);
}
