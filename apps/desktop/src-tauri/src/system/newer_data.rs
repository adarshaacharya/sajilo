//! What an older Sajilo does when it finds data a newer one saved.
//!
//! Opening it would mean guessing at tables this build has never seen, so it
//! does not: it says what happened, offers the download, and quits. The data
//! stays exactly as the newer app left it.

use tauri::{AppHandle, Wry};
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};
use tauri_plugin_opener::OpenerExt;

const DOWNLOAD_URL: &str = "https://sajilo.fyi/install";

pub fn explain_and_quit(app: &AppHandle<Wry>) {
    let handle = app.clone();
    app.dialog()
        .message(
            "Your Sajilo data was saved by a newer version of Sajilo than this one. \
             Download the latest Sajilo to open it. Your data is safe and has not been changed.",
        )
        .title("Sajilo needs an update")
        .kind(MessageDialogKind::Warning)
        .buttons(MessageDialogButtons::OkCancelCustom(
            "Download".to_owned(),
            "Quit".to_owned(),
        ))
        .show(move |download| {
            if download {
                let _ = handle.opener().open_url(DOWNLOAD_URL, None::<&str>);
            }
            handle.exit(0);
        });
}
