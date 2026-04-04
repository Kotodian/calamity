use serde::Serialize;
use std::path::Path;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppInfo {
    pub name: String,
    pub bundle_id: String,
    pub executable_path: String,
    pub app_path: String,
    /// Base64-encoded 32x32 PNG icon, or empty string if unavailable
    pub icon: String,
}

/// Extract app icon as base64 PNG using macOS `sips` tool
fn extract_icon_base64(app_path: &Path, plist: &plist::Dictionary) -> String {
    let icon_file = plist
        .get("CFBundleIconFile")
        .and_then(|v| v.as_string())
        .unwrap_or("AppIcon");

    // CFBundleIconFile may or may not include .icns extension
    let icon_name = if icon_file.ends_with(".icns") {
        icon_file.to_string()
    } else {
        format!("{}.icns", icon_file)
    };

    let icns_path = app_path.join("Contents/Resources").join(&icon_name);
    if !icns_path.exists() {
        return String::new();
    }

    // Use sips to convert to 32x32 PNG
    use std::sync::atomic::{AtomicU64, Ordering};
    static COUNTER: AtomicU64 = AtomicU64::new(0);
    let tmp = format!(
        "/tmp/calamity-icon-{}-{}.png",
        std::process::id(),
        COUNTER.fetch_add(1, Ordering::Relaxed)
    );
    let result = std::process::Command::new("sips")
        .args([
            "-s", "format", "png",
            "-z", "32", "32",
            &icns_path.to_string_lossy(),
            "--out", &tmp,
        ])
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .status();

    if result.is_ok_and(|s| s.success()) {
        if let Ok(bytes) = std::fs::read(&tmp) {
            let _ = std::fs::remove_file(&tmp);
            return base64::Engine::encode(&base64::engine::general_purpose::STANDARD, &bytes);
        }
    }
    let _ = std::fs::remove_file(&tmp);
    String::new()
}

fn scan_app_dir(dir: &Path) -> Vec<AppInfo> {
    let entries = match std::fs::read_dir(dir) {
        Ok(e) => e,
        Err(_) => return vec![],
    };

    let mut apps = Vec::new();
    for entry in entries.flatten() {
        let path = entry.path();
        if !path.extension().is_some_and(|ext| ext == "app") {
            continue;
        }

        let plist_path = path.join("Contents/Info.plist");
        let plist: plist::Dictionary = match plist::from_file(&plist_path) {
            Ok(p) => p,
            Err(_) => continue,
        };

        let fallback_name = path
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("Unknown")
            .to_string();

        let name = plist
            .get("CFBundleName")
            .or_else(|| plist.get("CFBundleDisplayName"))
            .and_then(|v| v.as_string())
            .map(|s| s.to_string())
            .unwrap_or(fallback_name);

        let bundle_id = plist
            .get("CFBundleIdentifier")
            .and_then(|v| v.as_string())
            .unwrap_or("")
            .to_string();

        let executable = match plist.get("CFBundleExecutable").and_then(|v| v.as_string()) {
            Some(e) => e.to_string(),
            None => continue,
        };

        let executable_path = path
            .join("Contents/MacOS")
            .join(&executable)
            .to_string_lossy()
            .to_string();

        let icon = extract_icon_base64(&path, &plist);

        apps.push(AppInfo {
            name,
            bundle_id,
            executable_path,
            app_path: path.to_string_lossy().to_string(),
            icon,
        });
    }

    apps.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    apps
}

#[tauri::command]
pub async fn list_apps() -> Result<Vec<AppInfo>, String> {
    // Run in blocking thread since sips + file I/O can be slow
    tokio::task::spawn_blocking(|| {
        let mut apps = scan_app_dir(Path::new("/Applications"));

        if let Some(home) = dirs::home_dir() {
            apps.extend(scan_app_dir(&home.join("Applications")));
        }

        apps.extend(scan_app_dir(Path::new("/System/Applications")));

        // Deduplicate by bundle_id
        let mut seen = std::collections::HashSet::new();
        apps.retain(|app| {
            if app.bundle_id.is_empty() {
                return true;
            }
            seen.insert(app.bundle_id.clone())
        });

        apps.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
        apps
    })
    .await
    .map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn scan_app_dir_finds_apps_in_applications() {
        let apps = scan_app_dir(Path::new("/Applications"));
        assert!(!apps.is_empty(), "should find apps in /Applications");

        for app in &apps {
            assert!(!app.name.is_empty(), "app name should not be empty");
            assert!(
                !app.executable_path.is_empty(),
                "executable_path should not be empty for {}",
                app.name
            );
            assert!(
                app.executable_path.contains("/Contents/MacOS/"),
                "executable_path should contain /Contents/MacOS/ for {}",
                app.name
            );
        }
    }

    #[test]
    fn scan_app_dir_returns_empty_for_nonexistent_dir() {
        let apps = scan_app_dir(Path::new("/nonexistent/path"));
        assert!(apps.is_empty());
    }

    #[test]
    fn scan_app_dir_parses_safari_correctly() {
        let safari_path = Path::new("/Applications/Safari.app");
        if !safari_path.exists() {
            return;
        }

        let apps = scan_app_dir(Path::new("/Applications"));
        let safari = apps.iter().find(|a| a.name == "Safari");
        assert!(safari.is_some(), "should find Safari");

        let safari = safari.unwrap();
        assert_eq!(safari.bundle_id, "com.apple.Safari");
        assert_eq!(
            safari.executable_path,
            "/Applications/Safari.app/Contents/MacOS/Safari"
        );
        assert_eq!(safari.app_path, "/Applications/Safari.app");
    }

    #[test]
    fn safari_has_icon() {
        let safari_path = Path::new("/Applications/Safari.app");
        if !safari_path.exists() {
            return;
        }

        let apps = scan_app_dir(Path::new("/Applications"));
        let safari = apps.iter().find(|a| a.name == "Safari").unwrap();
        assert!(!safari.icon.is_empty(), "Safari should have an icon");
        // Verify it's valid base64 that decodes to PNG
        let bytes = base64::Engine::decode(&base64::engine::general_purpose::STANDARD, &safari.icon)
            .expect("icon should be valid base64");
        assert!(bytes.starts_with(&[0x89, 0x50, 0x4E, 0x47]), "should be PNG");
    }
}
