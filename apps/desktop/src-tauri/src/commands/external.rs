//! Opens trusted web and email links with the user's default apps.

/// Opens an HTTP(S) URL with the platform's default browser, or a `mailto:`
/// link with the default mail app. Every other scheme — `file:`, custom
/// protocol handlers — is refused, so a link can only ever reach a browser or
/// a compose window.
///
/// AppImages can put their own `xdg-open` ahead of the host executable in
/// `PATH`. That bundled launcher is linked against the build distribution and
/// can fail on another distribution (notably Arch) even though spawning it
/// succeeded. Use the host launcher explicitly on Linux and wait for its short
/// hand-off process so a failed launch is reported instead of looking like a
/// dead click.
#[tauri::command]
pub async fn open_external_url(url: String) -> Result<(), String> {
    let parsed = url::Url::parse(&url).map_err(|error| format!("invalid URL: {error}"))?;
    if !matches!(parsed.scheme(), "http" | "https" | "mailto") {
        return Err("only web and email links can be opened".to_owned());
    }

    #[cfg(target_os = "linux")]
    {
        return tokio::task::spawn_blocking(move || open_on_linux(&url))
            .await
            .map_err(|error| format!("browser launcher task failed: {error}"))?;
    }

    #[cfg(not(target_os = "linux"))]
    tauri_plugin_opener::open_url(url, None::<&str>).map_err(|error| error.to_string())
}

#[cfg(target_os = "linux")]
fn open_on_linux(url: &str) -> Result<(), String> {
    use std::process::Command;

    let launchers: [(&str, &[&str]); 2] = [("/usr/bin/xdg-open", &[]), ("/usr/bin/gio", &["open"])];
    let mut failures = Vec::new();

    for (program, prefix) in launchers {
        let result = Command::new(program).args(prefix).arg(url).status();
        match result {
            Ok(status) if status.success() => return Ok(()),
            Ok(status) => failures.push(format!("{program} exited with {status}")),
            Err(error) => failures.push(format!("{program}: {error}")),
        }
    }

    Err(format!(
        "could not open the default browser ({})",
        failures.join("; ")
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn rejects_non_web_urls() {
        let result = open_external_url("file:///etc/passwd".to_owned()).await;
        assert_eq!(
            result,
            Err("only web and email links can be opened".to_owned())
        );
    }

    #[tokio::test]
    async fn rejects_script_urls() {
        let result = open_external_url("javascript:alert(1)".to_owned()).await;
        assert_eq!(
            result,
            Err("only web and email links can be opened".to_owned())
        );
    }
}
