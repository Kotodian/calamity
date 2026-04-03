use serde::Serialize;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppInfo {
    pub name: String,
    pub bundle_id: String,
    pub executable_path: String,
    pub app_path: String,
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

        apps.push(AppInfo {
            name,
            bundle_id,
            executable_path,
            app_path: path.to_string_lossy().to_string(),
        });
    }

    apps.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    apps
}

#[tauri::command]
pub async fn list_apps() -> Result<Vec<AppInfo>, String> {
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
    Ok(apps)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn scan_app_dir_finds_apps_in_applications() {
        // /Applications should exist on macOS and contain at least Safari
        let apps = scan_app_dir(Path::new("/Applications"));
        assert!(!apps.is_empty(), "should find apps in /Applications");

        // Every result should have non-empty name and executable_path
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
            return; // Skip if Safari not installed
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
}
