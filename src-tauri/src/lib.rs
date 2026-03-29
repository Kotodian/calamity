use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            // Attach click handler to the declarative tray icon from tauri.conf.json
            if let Some(tray) = app.tray_by_id("main-tray") {
                let app_handle = app.handle().clone();
                tray.on_tray_icon_event(move |_tray, event| {
                    if let tauri::tray::TrayIconEvent::Click {
                        button: tauri::tray::MouseButton::Left,
                        button_state: tauri::tray::MouseButtonState::Up,
                        position,
                        ..
                    } = event
                    {
                        if let Some(window) = app_handle.get_webview_window("tray") {
                            if window.is_visible().unwrap_or(false) {
                                let _ = window.hide();
                            } else {
                                let width = 288_f64;
                                let height = 420_f64;
                                let x = position.x - width / 2.0;
                                let y = position.y - height;

                                let _ = window.set_position(tauri::LogicalPosition::new(x, y));
                                let _ = window.set_size(tauri::LogicalSize::new(width, height));
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                    }
                });
            }

            // Hide tray window when it loses focus
            if let Some(tray_window) = app.get_webview_window("tray") {
                let tray_window_clone = tray_window.clone();
                tray_window.on_window_event(move |event| {
                    if let tauri::WindowEvent::Focused(false) = event {
                        let _ = tray_window_clone.hide();
                    }
                });
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
