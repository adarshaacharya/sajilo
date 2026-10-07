//! How this copy of Sajilo can update itself.

/// How this copy of Sajilo can update itself, so the updater never tries
/// what is bound to fail:
///
/// - `auto`: macOS, Windows, and an AppImage in a folder it can write to.
///   Installs quietly, in the background.
/// - `prompt`: a `.deb` or `.rpm` with `dpkg`/`rpm` present. Installing asks
///   for the admin password, so it only happens when the user clicks.
/// - `manual`: everything else. Notably the AUR package, which is built from
///   the `.deb` but runs where there is no `dpkg`, so every in-app install
///   failed. The user is pointed at their package manager or the download.
#[tauri::command]
pub fn update_install_kind() -> &'static str {
    #[cfg(target_os = "linux")]
    {
        let on_path = |tool: &str| {
            std::env::var_os("PATH").is_some_and(|paths| {
                std::env::split_paths(&paths).any(|dir| dir.join(tool).is_file())
            })
        };
        // The updater swaps an AppImage in place; it has to be able to write
        // beside it. Probed by creating and removing a file there.
        let appimage_writable = std::env::var_os("APPIMAGE")
            .map(std::path::PathBuf::from)
            .and_then(|path| path.parent().map(std::path::Path::to_path_buf))
            .is_some_and(|dir| {
                let probe = dir.join(format!(".sajilo-update-probe-{}", std::process::id()));
                let made = std::fs::File::create(&probe).is_ok();
                let _ = std::fs::remove_file(&probe);
                made
            });
        install_kind(
            tauri::utils::platform::bundle_type(),
            on_path("dpkg"),
            on_path("rpm"),
            appimage_writable,
        )
    }
    #[cfg(not(target_os = "linux"))]
    {
        "auto"
    }
}

/// The Linux decision, kept free of the environment so it can be tested on
/// any platform.
#[cfg_attr(not(target_os = "linux"), allow(dead_code))]
fn install_kind(
    bundle: Option<tauri::utils::config::BundleType>,
    has_dpkg: bool,
    has_rpm: bool,
    appimage_writable: bool,
) -> &'static str {
    use tauri::utils::config::BundleType;
    match bundle {
        Some(BundleType::Deb) if has_dpkg => "prompt",
        Some(BundleType::Rpm) if has_rpm => "prompt",
        Some(BundleType::AppImage) if appimage_writable => "auto",
        _ => "manual",
    }
}

#[cfg(test)]
mod install_kind_tests {
    use super::install_kind;
    use tauri::utils::config::BundleType;

    #[test]
    fn each_linux_install_updates_the_way_it_can() {
        assert_eq!(
            install_kind(Some(BundleType::Deb), true, false, false),
            "prompt"
        );
        assert_eq!(
            install_kind(Some(BundleType::Rpm), false, true, false),
            "prompt"
        );
        assert_eq!(
            install_kind(Some(BundleType::AppImage), false, false, true),
            "auto"
        );
        // The AUR package: built from the .deb, run where there is no dpkg.
        assert_eq!(
            install_kind(Some(BundleType::Deb), false, false, false),
            "manual"
        );
        assert_eq!(
            install_kind(Some(BundleType::AppImage), false, false, false),
            "manual"
        );
        assert_eq!(install_kind(None, true, true, true), "manual");
    }
}
