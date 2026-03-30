use std::process::Command;

#[tauri::command]
pub async fn get_browser_url() -> Result<Option<String>, String> {
    let scripts = [
        (
            "Google Chrome",
            r#"tell application "Google Chrome" to get URL of active tab of first window"#,
        ),
        (
            "Safari",
            r#"tell application "Safari" to get URL of current tab of first window"#,
        ),
        (
            "Arc",
            r#"tell application "Arc" to get URL of active tab of first window"#,
        ),
        (
            "Microsoft Edge",
            r#"tell application "Microsoft Edge" to get URL of active tab of first window"#,
        ),
        (
            "Brave Browser",
            r#"tell application "Brave Browser" to get URL of active tab of first window"#,
        ),
    ];

    // Use lsappinfo to get apps in front-to-back order, find the first browser
    let app_order = Command::new("lsappinfo")
        .arg("visibleProcessList")
        .output()
        .ok()
        .and_then(|o| {
            if o.status.success() {
                Some(String::from_utf8_lossy(&o.stdout).trim().to_string())
            } else {
                None
            }
        })
        .unwrap_or_default();

    // Extract app names from lsappinfo output in order, skip calamity
    let browser_names: Vec<&str> = scripts.iter().map(|(name, _)| *name).collect();
    let mut ordered_browsers: Vec<&str> = Vec::new();
    for part in app_order.split(':') {
        let part = part.trim().trim_matches('"');
        for &browser in &browser_names {
            // lsappinfo uses underscores: "Google_Chrome", "Brave_Browser"
            let normalized = browser.replace(' ', "_");
            if part.contains(&normalized) || part.contains(browser) {
                if !ordered_browsers.contains(&browser) {
                    ordered_browsers.push(browser);
                }
            }
        }
    }

    // Try browsers in front-to-back order
    for &browser in &ordered_browsers {
        for (app_name, script) in &scripts {
            if *app_name == browser {
                if let Some(url) = try_script(script) {
                    return Ok(Some(url));
                }
            }
        }
    }

    // Fallback: try all browsers
    for (_app_name, script) in &scripts {
        if let Some(url) = try_script(script) {
            return Ok(Some(url));
        }
    }

    Ok(None)
}

fn try_script(script: &str) -> Option<String> {
    let output = Command::new("osascript")
        .args(["-e", script])
        .output()
        .ok()?;
    if output.status.success() {
        let url = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if !url.is_empty() && url.starts_with("http") {
            return Some(url);
        }
    }
    None
}
