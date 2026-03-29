use std::process::Command;

#[tauri::command]
pub async fn get_browser_url() -> Result<Option<String>, String> {
    let scripts = [
        ("Google Chrome", r#"tell application "Google Chrome" to get URL of active tab of first window"#),
        ("Safari", r#"tell application "Safari" to get URL of current tab of first window"#),
        ("Arc", r#"tell application "Arc" to get URL of active tab of first window"#),
        ("Microsoft Edge", r#"tell application "Microsoft Edge" to get URL of active tab of first window"#),
        ("Brave Browser", r#"tell application "Brave Browser" to get URL of active tab of first window"#),
    ];

    // Detect frontmost app
    let frontmost = Command::new("osascript")
        .args(["-e", r#"tell application "System Events" to get name of first application process whose frontmost is true"#])
        .output()
        .ok()
        .and_then(|o| {
            if o.status.success() {
                Some(String::from_utf8_lossy(&o.stdout).trim().to_string())
            } else {
                None
            }
        });

    // Try frontmost browser first
    if let Some(ref front_app) = frontmost {
        for (app_name, script) in &scripts {
            if front_app.contains(app_name) || app_name.contains(front_app.as_str()) {
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
