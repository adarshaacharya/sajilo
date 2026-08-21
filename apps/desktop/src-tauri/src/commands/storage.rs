//! IPC for the local user-data database.

use serde_json::Value;
use tauri::{AppHandle, Wry};

use crate::db;

type Result<T> = std::result::Result<T, String>;

#[tauri::command]
pub fn get_setting(app: AppHandle<Wry>, key: String) -> Result<Option<Value>> {
    db::get_json(&app, &key)
}

#[tauri::command]
pub fn set_setting(app: AppHandle<Wry>, key: String, value: Value) -> Result<()> {
    db::set_json(&app, &key, &value)
}

#[tauri::command]
pub fn delete_setting(app: AppHandle<Wry>, key: String) -> Result<()> {
    db::delete_json(&app, &key)
}
