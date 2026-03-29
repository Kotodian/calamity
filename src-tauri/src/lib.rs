use tauri::{
    image::Image,
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager,
};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            let icon = Image::from_bytes(include_bytes!("../icons/icon.png"))
                .expect("failed to load tray icon");

            let _tray = TrayIconBuilder::new()
                .icon(icon)
                .icon_as_template(true)
                .tooltip("Calamity")
                .on_tray_icon_event(|tray, event| match event {
                    TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        position,
                        ..
                    } => {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("tray") {
                            let visible = window.is_visible().unwrap_or(false);
                            if visible {
                                let _ = window.hide();
                            } else {
                                let logical_w = 288.0_f64;
                                let logical_h = 420.0_f64;

                                let scale = window.scale_factor().unwrap_or(2.0);
                                let logical_x = position.x / scale - logical_w / 2.0;
                                let logical_y = position.y / scale;

                                let _ = window.set_size(tauri::LogicalSize::new(logical_w, logical_h));
                                let _ = window.set_position(tauri::LogicalPosition::new(logical_x, logical_y));
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                    }
                    _ => {}
                })
                .build(app)?;

            // Main window: intercept close to hide instead of destroy
            if let Some(main_window) = app.get_webview_window("main") {
                let main_clone = main_window.clone();
                main_window.on_window_event(move |event| {
                    if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                        api.prevent_close();
                        let _ = main_clone.hide();
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
