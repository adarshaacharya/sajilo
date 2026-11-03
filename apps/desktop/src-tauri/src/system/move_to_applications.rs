//! A Mac copy running from somewhere it can't update itself.
//!
//! Opened straight from the disk image, Sajilo runs from a read-only volume.
//! Opened from Downloads without being moved first, macOS runs it from a
//! randomised read-only copy ("App Translocation"). Either way the updater
//! cannot replace the app, so every update fails, quietly, forever.
//!
//! So once per install, such a copy offers to move itself into Applications
//! and reopen from there. Declining is respected; the updater's own "couldn't
//! update itself" notice is the fallback for anyone still stuck days later.

use std::io;
use std::path::{Path, PathBuf};
use std::process::Command;

use tauri::{AppHandle, Wry};
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};

use crate::{db, prefs::MOVE_TO_APPLICATIONS_ASKED};

const APPLICATIONS: &str = "/Applications";

/// Asks, at most once per install, to move a copy that can't update itself.
pub fn offer_once(app: &AppHandle<Wry>) {
    let Some(bundle) = std::env::current_exe()
        .ok()
        .and_then(|exe| app_bundle(&exe))
    else {
        return;
    };
    if !cannot_update_from(&bundle) {
        return;
    }
    if db::get_json(app, MOVE_TO_APPLICATIONS_ASKED)
        .ok()
        .flatten()
        .is_some()
    {
        return;
    }
    let _ = db::set_json(
        app,
        MOVE_TO_APPLICATIONS_ASKED,
        &serde_json::Value::Bool(true),
    );

    let ne = matches!(
        crate::prefs::language(app),
        sajilo_core::focus::Language::Ne
    );
    let (title, body, move_label, later_label) = if ne {
        (
            "सजिलोलाई Applications मा सार्ने?",
            "सजिलो अहिले यस्तो ठाउँबाट चलिरहेको छ जहाँबाट यो आफैं अपडेट हुन सक्दैन। \
             Applications मा सारेपछि अपडेटहरू आफैं इन्स्टल हुन्छन्।",
            "सार्नुहोस्",
            "अहिले होइन",
        )
    } else {
        (
            "Move Sajilo to Applications?",
            "Sajilo is running from a place it can't update itself from. \
             Move it to Applications and updates will install on their own.",
            "Move",
            "Not now",
        )
    };

    let handle = app.clone();
    app.dialog()
        .message(body)
        .title(title)
        .kind(MessageDialogKind::Info)
        .buttons(MessageDialogButtons::OkCancelCustom(
            move_label.to_owned(),
            later_label.to_owned(),
        ))
        .show(move |chosen| {
            if !chosen {
                return;
            }
            if let Ok(target) = install_copy(&bundle) {
                reopen_from(&handle, &target);
                return;
            }
            let failed = if ne {
                "सजिलो सार्न सकिएन। Finder मा यसलाई Applications फोल्डरमा तान्नुहोस्।"
            } else {
                "Sajilo couldn't move itself. Drag it into the Applications folder in Finder."
            };
            handle
                .dialog()
                .message(failed)
                .kind(MessageDialogKind::Warning)
                .show(|_| {});
        });
}

/// The `.app` folder an executable sits in.
fn app_bundle(exe: &Path) -> Option<PathBuf> {
    exe.ancestors()
        .find(|dir| dir.extension().is_some_and(|ext| ext == "app"))
        .map(Path::to_path_buf)
}

/// A mounted disk image or a translocated copy: read-only, so no update can
/// land. Anywhere else the user can write, the updater copes.
fn cannot_update_from(bundle: &Path) -> bool {
    bundle.starts_with("/Volumes") || bundle.to_string_lossy().contains("/AppTranslocation/")
}

/// Copies the app into Applications, replacing an older copy there. Staged
/// beside the target and renamed into place, so a failure halfway never
/// leaves a broken Sajilo in Applications.
fn install_copy(bundle: &Path) -> io::Result<PathBuf> {
    let name = bundle
        .file_name()
        .ok_or_else(|| io::Error::other("no bundle name"))?;
    let target = Path::new(APPLICATIONS).join(name);
    let staging = Path::new(APPLICATIONS).join(format!(".{}.moving", name.to_string_lossy()));
    if staging.exists() {
        std::fs::remove_dir_all(&staging)?;
    }
    run(Command::new("/usr/bin/ditto").arg(bundle).arg(&staging))?;
    // The download's quarantine flag is what makes macOS translocate it; the
    // copy was already opened and approved, so it goes.
    let _ = run(Command::new("/usr/bin/xattr")
        .args(["-dr", "com.apple.quarantine"])
        .arg(&staging));
    if target.exists() {
        std::fs::remove_dir_all(&target)?;
    }
    std::fs::rename(&staging, &target)?;
    Ok(target)
}

fn run(command: &mut Command) -> io::Result<()> {
    let status = command.status()?;
    if status.success() {
        Ok(())
    } else {
        Err(io::Error::other(format!("{status}")))
    }
}

/// Quits, and opens the moved copy once this one is gone: started while this
/// one still runs, the single-instance guard would close the new one instead.
fn reopen_from(app: &AppHandle<Wry>, target: &Path) {
    let spawned = Command::new("/bin/sh")
        .arg("-c")
        .arg(r#"while kill -0 "$1" 2>/dev/null; do sleep 0.2; done; /usr/bin/open "$2""#)
        .arg("sh")
        .arg(std::process::id().to_string())
        .arg(target)
        .spawn();
    if spawned.is_ok() {
        app.exit(0);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn finds_the_bundle_around_the_executable() {
        assert_eq!(
            app_bundle(Path::new("/Applications/Sajilo.app/Contents/MacOS/sajilo")),
            Some(PathBuf::from("/Applications/Sajilo.app"))
        );
        assert_eq!(app_bundle(Path::new("/usr/local/bin/sajilo")), None);
    }

    #[test]
    fn only_a_read_only_copy_needs_moving() {
        assert!(cannot_update_from(Path::new("/Volumes/Sajilo/Sajilo.app")));
        assert!(cannot_update_from(Path::new(
            "/private/var/folders/x/T/AppTranslocation/ABC/d/Sajilo.app"
        )));
        assert!(!cannot_update_from(Path::new("/Applications/Sajilo.app")));
        assert!(!cannot_update_from(Path::new(
            "/Users/a/Applications/Sajilo.app"
        )));
        assert!(!cannot_update_from(Path::new(
            "/Users/a/Desktop/Sajilo.app"
        )));
    }
}
