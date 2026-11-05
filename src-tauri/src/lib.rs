mod calendar_reminders;

use calendar_reminders::{start_reminder_worker, sync_calendar_reminders, CalendarReminderState};
use tauri::{
  menu::{Menu, MenuItem},
  tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
  Manager, WindowEvent,
};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_http::init())
    .plugin(tauri_plugin_fs::init())
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_notification::init())
    .invoke_handler(tauri::generate_handler![sync_calendar_reminders])
    .setup(|app| {
      let reminder_path = app.path().app_config_dir()?.join("calendar-reminders.json");
      let reminder_state = CalendarReminderState::load(reminder_path);
      app.manage(reminder_state.clone());
      start_reminder_worker(app.handle().clone(), reminder_state);

      let show_item = MenuItem::with_id(app, "show", "WON 노트 열기", true, None::<&str>)?;
      let quit_item = MenuItem::with_id(app, "quit", "앱 종료 (알림 중지)", true, None::<&str>)?;
      let tray_menu = Menu::with_items(app, &[&show_item, &quit_item])?;
      let tray_icon = app
        .default_window_icon()
        .cloned()
        .ok_or("기본 앱 아이콘을 찾을 수 없습니다.")?;
      TrayIconBuilder::new()
        .icon(tray_icon)
        .tooltip("WON 노트 - 일정 알림 실행 중")
        .menu(&tray_menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id().as_ref() {
          "show" => show_main_window(app),
          "quit" => app.exit(0),
          _ => {}
        })
        .on_tray_icon_event(|tray, event| {
          if matches!(
            event,
            TrayIconEvent::Click {
              button: MouseButton::Left,
              button_state: MouseButtonState::Up,
              ..
            }
          ) {
            show_main_window(tray.app_handle());
          }
        })
        .build(app)?;

      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .on_window_event(|window, event| {
      if let WindowEvent::CloseRequested { api, .. } = event {
        api.prevent_close();
        let _ = window.hide();
      }
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}

fn show_main_window(app: &tauri::AppHandle) {
  if let Some(window) = app.get_webview_window("main") {
    let _ = window.show();
    let _ = window.unminimize();
    let _ = window.set_focus();
  }
}
