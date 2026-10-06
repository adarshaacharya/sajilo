//! Bounds shared by every pack's `validate`.

use serde::{Deserialize, Serialize};

/// Text a pack shows: present, short enough, and free of control
/// characters that could break a notification or a card's layout.
pub fn text(field: &str, value: &str, max_chars: usize) -> Result<(), String> {
    if value.trim().is_empty() {
        return Err(format!("{field} is empty"));
    }
    optional_text(field, value, max_chars)
}

/// The same, allowing empty.
pub fn optional_text(field: &str, value: &str, max_chars: usize) -> Result<(), String> {
    let count = value.chars().count();
    if count > max_chars {
        return Err(format!(
            "{field} is {count} characters, more than {max_chars}"
        ));
    }
    if value.chars().any(char::is_control) {
        return Err(format!("{field} has a control character"));
    }
    Ok(())
}

/// A URL the app may fetch or open: `https`, a real host name, no
/// credentials, nothing pointing back at the machine or the local network.
pub fn https_url(field: &str, value: &str) -> Result<(), String> {
    const MAX_URL: usize = 512;
    if value.len() > MAX_URL {
        return Err(format!("{field} is longer than {MAX_URL} bytes"));
    }
    let Some(rest) = value.strip_prefix("https://") else {
        return Err(format!("{field} is not an https URL"));
    };
    let authority = rest.split(['/', '?', '#']).next().unwrap_or_default();
    if authority.contains('@') {
        return Err(format!("{field} carries credentials"));
    }
    let host = authority
        .split(':')
        .next()
        .unwrap_or_default()
        .to_ascii_lowercase();
    let is_name = host.contains('.')
        && host
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '.')
        && host.chars().any(|c| c.is_ascii_alphabetic());
    let is_ip_like = host
        .rsplit('.')
        .next()
        .is_some_and(|tld| tld.chars().all(|c| c.is_ascii_digit()));
    if !is_name || is_ip_like || host.starts_with('[') {
        return Err(format!("{field} does not name a public host"));
    }
    // `host` is already lowercase.
    const PRIVATE_SUFFIXES: [&str; 3] = [".localhost", ".local", ".internal"];
    if host == "localhost" || PRIVATE_SUFFIXES.iter().any(|suffix| host.ends_with(suffix)) {
        return Err(format!("{field} points at this machine or network"));
    }
    if value.chars().any(|c| c.is_control() || c.is_whitespace()) {
        return Err(format!("{field} has whitespace or a control character"));
    }
    Ok(())
}

/// A line in both languages, the shape every user-facing pack text takes.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(
    feature = "typescript",
    derive(ts_rs::TS),
    ts(export, export_to = "api/")
)]
pub struct Bilingual {
    pub en: String,
    pub ne: String,
}

impl Bilingual {
    pub fn check(&self, field: &str, max_chars: usize) -> Result<(), String> {
        text(&format!("{field}.en"), &self.en, max_chars)?;
        text(&format!("{field}.ne"), &self.ne, max_chars)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_public_https_urls() {
        assert!(https_url("u", "https://ekantipur.com/rss").is_ok());
        assert!(https_url("u", "https://www.nrb.org.np:443/api?x=1").is_ok());
    }

    #[test]
    fn refuses_anything_else() {
        for url in [
            "http://ekantipur.com",
            "https://localhost/x",
            "https://127.0.0.1/x",
            "https://10.0.0.1",
            "https://[::1]/",
            "https://user:pw@example.com/",
            "https://intranet/",
            "https://printer.local/",
            "file:///etc/passwd",
            "https://exa mple.com",
        ] {
            assert!(https_url("u", url).is_err(), "{url}");
        }
    }

    #[test]
    fn text_bounds() {
        assert!(text("t", "ok", 5).is_ok());
        assert!(text("t", "  ", 5).is_err());
        assert!(text("t", "toolong", 5).is_err());
        assert!(text("t", "a\nb", 5).is_err());
    }
}
