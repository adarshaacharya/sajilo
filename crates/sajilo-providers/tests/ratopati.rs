//! Reads only from `fixtures/ratopati/`.

use chrono::{TimeZone, Utc};
use sajilo_providers::ratopati;

const FIXTURE: &str = include_str!("../../../fixtures/ratopati/radio.html");

fn parsed() -> sajilo_api::radio::RadioDirectory {
    ratopati::parse_directory(FIXTURE, Utc.timestamp_opt(1_800_000_000, 0).unwrap())
        .expect("fixture parses")
}

#[test]
fn decodes_the_recorded_directory() {
    let directory = parsed();
    assert!(
        directory.stations.len() > 100,
        "the directory lists hundreds of stations, got {}",
        directory.stations.len()
    );
    assert!(directory.stations.iter().all(|s| !s.slug.is_empty()));
    assert!(directory.stations.iter().all(|s| !s.name.is_empty()));
}

#[test]
fn reads_the_name_frequency_and_logo() {
    let directory = parsed();
    let station = directory
        .stations
        .iter()
        .find(|s| s.slug == "radio-nepal")
        .expect("Radio Nepal is in the directory");

    assert_eq!(station.name, "रेडियो नेपाल");
    assert_eq!(station.frequency.as_deref(), Some("100 MHz"));
    assert!(
        station
            .logo_url
            .as_deref()
            .is_some_and(|url| url.starts_with("https://")),
        "logo should be an absolute URL"
    );
    // The stream is resolved on demand rather than by crawling every page.
    assert_eq!(station.stream_url, None);
}

/// The name comes from the logo's alt text, which is the only place it appears
/// without the frequency appended — so removing it leaves a clean frequency.
#[test]
fn separates_the_frequency_from_the_name() {
    for station in &parsed().stations {
        if let Some(frequency) = &station.frequency {
            assert!(
                !frequency.contains(&station.name),
                "{}: frequency still carries the name: {frequency}",
                station.slug
            );
        }
    }
}

/// The page links each station more than once, and the directory links to
/// itself. Neither may produce a row.
#[test]
fn deduplicates_and_skips_the_self_link() {
    let directory = parsed();
    let mut slugs: Vec<&str> = directory.stations.iter().map(|s| s.slug.as_str()).collect();
    let count = slugs.len();
    slugs.sort_unstable();
    slugs.dedup();
    assert_eq!(slugs.len(), count, "slugs must be unique");

    assert!(!directory.stations.iter().any(|s| s.slug.is_empty()));
    assert!(!directory.stations.iter().any(|s| s.slug == "radio"));
}

#[test]
fn builds_a_station_url_from_a_slug() {
    assert_eq!(
        ratopati::station_url("radio-nepal"),
        "https://www.ratopati.com/radio/radio-nepal"
    );
}

/// A `javascript:` or `data:` source would be handed straight to the webview's
/// audio element, so the scheme is checked rather than trusted.
#[test]
fn accepts_only_an_http_stream_source() {
    assert_eq!(
        ratopati::parse_stream_url(r#"<audio><source src="https://stream.example/live"></audio>"#),
        Some("https://stream.example/live".to_owned())
    );
    assert_eq!(
        ratopati::parse_stream_url(r#"<source src="javascript:alert(1)">"#),
        None
    );
    assert_eq!(
        ratopati::parse_stream_url(r#"<source src="data:audio/mp3,x">"#),
        None
    );
    assert_eq!(
        ratopati::parse_stream_url(r#"<source src="/relative/path">"#),
        None
    );
    assert_eq!(ratopati::parse_stream_url("<html>no player</html>"), None);

    // A safe source further down the page is still found.
    let mixed = r#"<source src="data:audio/mp3,x"><source src="http://stream.example/live">"#;
    assert_eq!(
        ratopati::parse_stream_url(mixed),
        Some("http://stream.example/live".to_owned())
    );
}

#[test]
fn rejects_a_page_it_cannot_read() {
    let now = Utc.timestamp_opt(0, 0).unwrap();
    assert!(ratopati::parse_directory("<html><body>down</body></html>", now).is_err());
    // An anchor with no logo carries no name, so it yields no station.
    let nameless = r#"<a href="https://www.ratopati.com/radio/x">x</a>"#;
    assert!(ratopati::parse_directory(nameless, now).is_err());
}
