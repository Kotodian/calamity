mod commands;
mod singbox;

use std::sync::Arc;
use tauri::{
    image::Image,
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager,
};

use singbox::process::SingboxProcess;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            // Determine sing-box binary path
            let singbox_path = if cfg!(debug_assertions) {
                "sing-box".to_string()
            } else {
                // Tauri sidecar binaries are placed in Contents/MacOS/
                let exe_dir = std::env::current_exe()
                    .ok()
                    .and_then(|p| p.parent().map(|d| d.to_path_buf()));
                if let Some(dir) = exe_dir {
                    let sidecar = dir.join("sing-box");
                    if sidecar.exists() {
                        sidecar.to_string_lossy().to_string()
                    } else {
                        "sing-box".to_string()
                    }
                } else {
                    "sing-box".to_string()
                }
            };

            let process = Arc::new(SingboxProcess::new(singbox_path));
            app.manage(process.clone());

            // Don't auto-start sing-box; user clicks connect to start

            // Auto-update subscriptions
            let app_handle_subs = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                // Wait for initial startup
                tokio::time::sleep(std::time::Duration::from_secs(10)).await;

                loop {
                    let subs = crate::singbox::subscriptions_storage::load_subscriptions();
                    let now = chrono::Utc::now();

                    for sub in &subs.subscriptions {
                        if !sub.enabled || sub.auto_update_interval == 0 {
                            continue;
                        }
                        let should_update = match &sub.last_updated {
                            Some(last) => {
                                if let Ok(last_dt) = chrono::DateTime::parse_from_rfc3339(last) {
                                    let elapsed =
                                        (now - last_dt.with_timezone(&chrono::Utc)).num_seconds();
                                    elapsed >= sub.auto_update_interval as i64
                                } else {
                                    true
                                }
                            }
                            None => true,
                        };

                        if should_update {
                            eprintln!("[subscriptions] auto-updating: {}", sub.name);
                            let _ = crate::commands::subscriptions::update_subscription(
                                app_handle_subs.clone(),
                                sub.id.clone(),
                            )
                            .await;
                        }
                    }

                    // Check every 60 seconds
                    tokio::time::sleep(std::time::Duration::from_secs(60)).await;
                }
            });

            let app_handle_watchdog = app.handle().clone();
            let process_watchdog = process.clone();
            tauri::async_runtime::spawn(async move {
                let mut previous_running = Some(process_watchdog.is_running().await);

                loop {
                    tokio::time::sleep(std::time::Duration::from_secs(1)).await;

                    let current_running = process_watchdog.is_running().await;
                    if crate::commands::connection::should_emit_connection_state_changed(
                        previous_running,
                        current_running,
                    ) {
                        crate::commands::connection::emit_connection_state_changed(
                            &app_handle_watchdog,
                        )
                        .await;
                    }
                    previous_running = Some(current_running);
                }
            });

            // Tray icon setup
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
                                let logical_h = 600.0_f64;

                                let scale = window.scale_factor().unwrap_or(2.0);
                                let logical_x = position.x / scale - logical_w / 2.0;
                                let logical_y = position.y / scale;

                                let _ =
                                    window.set_size(tauri::LogicalSize::new(logical_w, logical_h));
                                let _ = window.set_position(tauri::LogicalPosition::new(
                                    logical_x, logical_y,
                                ));
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
        .invoke_handler(tauri::generate_handler![
            commands::logs::start_log_stream,
            commands::connection::singbox_start,
            commands::connection::singbox_stop,
            commands::connection::singbox_restart,
            commands::connection::singbox_status,
            commands::settings::get_settings,
            commands::settings::get_tun_status,
            commands::settings::install_tun_sudoers,
            commands::settings::check_tun_sudoers,
            commands::settings::update_settings,
            commands::dns::get_dns_settings,
            commands::dns::update_dns_config,
            commands::dns::add_dns_server,
            commands::dns::update_dns_server,
            commands::dns::delete_dns_server,
            commands::dns::add_dns_rule,
            commands::dns::delete_dns_rule,
            commands::nodes::get_nodes,
            commands::nodes::add_node,
            commands::nodes::update_node,
            commands::nodes::remove_node,
            commands::nodes::add_group,
            commands::nodes::remove_group,
            commands::nodes::rename_group,
            commands::nodes::disconnect_node,
            commands::nodes::set_active_node,
            commands::nodes::test_node_latency,
            commands::nodes::test_group_latency,
            commands::connections::subscribe_connections,
            commands::connections::close_connection,
            commands::connections::close_all_connections,
            commands::subscriptions::get_subscriptions,
            commands::subscriptions::add_subscription,
            commands::subscriptions::update_subscription,
            commands::subscriptions::update_all_subscriptions,
            commands::subscriptions::delete_subscription,
            commands::subscriptions::edit_subscription,
            commands::subscriptions::toggle_subscription,
            commands::tailscale::tailscale_status,
            commands::tailscale::tailscale_login,
            commands::tailscale::tailscale_logout,
            commands::tailscale::tailscale_set_exit_node,
            commands::tailscale::tailscale_get_serve_status,
            commands::tailscale::tailscale_add_funnel,
            commands::tailscale::tailscale_remove_funnel,
            commands::browser::get_browser_url,
            commands::rules::get_rules,
            commands::rules::add_rule,
            commands::rules::update_rule,
            commands::rules::delete_rule,
            commands::rules::reorder_rules,
            commands::rules::update_ruleset_interval,
            commands::rules::update_final_outbound,
            commands::traffic::subscribe_traffic,
            commands::traffic::get_dashboard_info,
            commands::config_io::export_config,
            commands::config_io::import_config,
            commands::connection::app_quit,
        ])
        .build(tauri::generate_context!())
        .expect("error while running tauri application")
        .run(|app, event| {
            if let tauri::RunEvent::Exit = event {
                // Clear system proxy on exit
                crate::commands::settings::clear_system_proxy_on_exit();
                // Use synchronous cleanup to avoid async deadlock during shutdown
                let process = app.state::<Arc<SingboxProcess>>();
                process.stop_sync();
            }
        });
}
