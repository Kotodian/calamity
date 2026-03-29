use tauri::{
    tray::TrayIconBuilder, Manager,
};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            // Build system tray
            let _tray = TrayIconBuilder::new()
                .tooltip("Calamity")
                .on_tray_icon_event(|tray_handle, event| {
                    if let tauri::tray::TrayIconEvent::Click {
                        button: tauri::tray::MouseButton::Left,
                        button_state: tauri::tray::MouseButtonState::Up,
                        position,
                        ..
                    } = event
                    {
                        let app = tray_handle.app_handle();
                        if let Some(window) = app.get_webview_window("tray") {
                            if window.is_visible().unwrap_or(false) {
                                let _ = window.hide();
                            } else {
                                let scale = window.scale_factor().unwrap_or(1.0);
                                let width = 288.0;
                                let height = 420.0;

                                let pos = tauri::PhysicalPosition::new(
                                    (position.x - width / 2.0) * scale,
                                    (position.y - height) * scale,
                                );
                                let size = tauri::PhysicalSize::new(
                                    (width * scale) as u32,
                                    (height * scale) as u32,
                                );

                                let _ = window.set_position(pos);
                                let _ = window.set_size(size);
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                    }
                })
                .build(app)?;

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
