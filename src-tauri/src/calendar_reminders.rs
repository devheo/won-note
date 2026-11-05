use serde::{Deserialize, Serialize};
use std::{
  collections::{HashMap, HashSet},
  fs,
  path::PathBuf,
  sync::{Arc, Mutex},
  thread,
  time::Duration,
};
use tauri::{AppHandle, Manager, State};
use tauri_plugin_notification::NotificationExt;

const CHECK_INTERVAL: Duration = Duration::from_secs(5);
const MAX_REMINDERS: usize = 20_000;
const MAX_CATCH_UP_MS: i64 = 15 * 60 * 1000;

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReminderNotification {
  pub id: String,
  pub title: String,
  pub body: String,
  pub fire_at: i64,
}

#[derive(Clone)]
pub struct CalendarReminderState {
  registry: Arc<Mutex<ReminderRegistry>>,
  file_path: PathBuf,
}

#[derive(Default, Deserialize, Serialize)]
struct ReminderRegistry {
  reminders: HashMap<String, ReminderNotification>,
  fired_ids: HashSet<String>,
}

#[derive(Deserialize)]
#[serde(untagged)]
enum PersistedReminderState {
  Current(ReminderRegistry),
  Legacy(Vec<ReminderNotification>),
}

impl CalendarReminderState {
  pub fn load(file_path: PathBuf) -> Self {
    let registry = fs::read_to_string(&file_path)
      .ok()
      .and_then(|contents| serde_json::from_str::<PersistedReminderState>(&contents).ok())
      .map(|stored| match stored {
        PersistedReminderState::Current(registry) => registry,
        PersistedReminderState::Legacy(reminders) => ReminderRegistry {
          reminders: reminders
            .into_iter()
            .filter(valid_reminder)
            .map(|reminder| (reminder.id.clone(), reminder))
            .collect(),
          fired_ids: HashSet::new(),
        },
      })
      .unwrap_or_default();

    Self {
      registry: Arc::new(Mutex::new(registry)),
      file_path,
    }
  }

  fn replace(&self, reminders: Vec<ReminderNotification>) -> Result<(), String> {
    if reminders.len() > MAX_REMINDERS {
      return Err("예약할 일정 알림이 너무 많습니다.".into());
    }

    let mut registry = self.registry.lock().map_err(|_| "알림 상태를 잠글 수 없습니다.")?;
    registry.reminders = reminders
      .into_iter()
      .filter(valid_reminder)
      .filter(|reminder| !registry.fired_ids.contains(&reminder.id))
      .map(|reminder| (reminder.id.clone(), reminder))
      .collect();
    drop(registry);
    self.persist()
  }

  fn persist(&self) -> Result<(), String> {
    let registry = self.registry.lock().map_err(|_| "알림 상태를 잠글 수 없습니다.")?;
    let contents = serde_json::to_vec(&*registry).map_err(|error| error.to_string())?;
    if let Some(parent) = self.file_path.parent() {
      fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    fs::write(&self.file_path, contents).map_err(|error| error.to_string())
  }
}

fn valid_reminder(reminder: &ReminderNotification) -> bool {
  !reminder.id.trim().is_empty()
    && !reminder.title.trim().is_empty()
    && reminder.fire_at > 0
    && reminder.title.len() <= 500
    && reminder.body.len() <= 2_000
}

#[tauri::command]
pub fn sync_calendar_reminders(
  reminders: Vec<ReminderNotification>,
  state: State<'_, CalendarReminderState>,
) -> Result<(), String> {
  state.replace(reminders)
}

pub fn start_reminder_worker(app: AppHandle, state: CalendarReminderState) {
  thread::spawn(move || loop {
    thread::sleep(CHECK_INTERVAL);
    let now = chrono::Utc::now().timestamp_millis();

    let due = {
      let Ok(mut registry) = state.registry.lock() else {
        continue;
      };
      let due_ids = registry.reminders
        .iter()
        .filter(|(_, reminder)| reminder.fire_at <= now && reminder.fire_at >= now - MAX_CATCH_UP_MS)
        .map(|(id, _)| id.clone())
        .collect::<Vec<_>>();
      due_ids
        .into_iter()
        .filter_map(|id| {
          registry.fired_ids.insert(id.clone());
          registry.reminders.remove(&id)
        })
        .collect::<Vec<_>>()
    };

    if due.is_empty() {
      continue;
    }

    if let Err(error) = state.persist() {
      log::error!("Could not persist delivered calendar reminders: {error}");
    }

    for reminder in due {
      if let Err(error) = app
        .notification()
        .builder()
        .title(reminder.title)
        .body(reminder.body)
        .show()
      {
        log::error!("Could not show calendar reminder notification: {error}");
      }
    }
  });
}
