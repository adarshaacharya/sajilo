//! Ratopati's Nepal radio directory. Ported from `RatopatiRadioProvider.swift`.
//!
//! The Swift version matched anchors with regular expressions because Swift
//! ships no HTML parser; here the same shape is expressed as CSS selectors,
//! which cannot be fooled by an attribute order change or a nested tag.

use std::collections::HashSet;

use chrono::{DateTime, Utc};
use sajilo_api::load_state::Freshness;
use sajilo_api::radio::{RadioDirectory, RadioStation};
use scraper::{Html, Selector};

use crate::error::{ProviderError, Result};
use crate::http::HttpClient;

pub const SOURCE_NAME: &str = "Ratopati radio";

pub const DIRECTORY_URL: &str = "https://www.ratopati.com/radio";

const STATION_PREFIX: &str = "https://www.ratopati.com/radio/";

pub fn station_url(slug: &str) -> String {
    format!("{STATION_PREFIX}{slug}")
}

pub async fn fetch_directory(client: &HttpClient, now: DateTime<Utc>) -> Result<RadioDirectory> {
    let body = client.get_text(SOURCE_NAME, DIRECTORY_URL).await?;
    parse_directory(&body, now)
}

/// The stream lives on the station's own page, so it is resolved on demand
/// rather than by crawling 270 pages up front.
pub async fn fetch_stream_url(client: &HttpClient, slug: &str) -> Result<String> {
    let body = client.get_text(SOURCE_NAME, &station_url(slug)).await?;
    parse_stream_url(&body)
        .ok_or_else(|| ProviderError::parse(SOURCE_NAME, "no playable source on the station page"))
}

pub fn parse_directory(page: &str, now: DateTime<Utc>) -> Result<RadioDirectory> {
    let document = Html::parse_document(page);
    let anchor =
        Selector::parse(r#"a[href^="https://www.ratopati.com/radio/"]"#).expect("static selector");
    let image = Selector::parse("img").expect("static selector");

    let mut seen = HashSet::new();
    let mut stations = Vec::new();

    for anchor in document.select(&anchor) {
        let Some(href) = anchor.value().attr("href") else {
            continue;
        };
        let slug = href
            .trim_start_matches(STATION_PREFIX)
            .trim_end_matches('/')
            .trim();
        // The directory links to itself; that anchor is not a station.
        if slug.is_empty() || slug.contains('/') {
            continue;
        }

        // The name lives in the logo's alt text, which is the only place it
        // appears without the frequency appended.
        let Some(image) = anchor.select(&image).next() else {
            continue;
        };
        let name = image.value().attr("alt").unwrap_or_default().trim();
        if name.is_empty() {
            continue;
        }

        // The anchor's text is the name followed by the frequency, so removing
        // the name leaves the frequency.
        let text = anchor
            .text()
            .flat_map(str::split_whitespace)
            .collect::<Vec<_>>()
            .join(" ");
        let frequency = text.replace(name, "");
        let frequency = frequency.trim();

        if !seen.insert(slug.to_owned()) {
            continue;
        }
        stations.push(RadioStation {
            slug: slug.to_owned(),
            name: name.to_owned(),
            frequency: (!frequency.is_empty()).then(|| frequency.to_owned()),
            logo_url: image.value().attr("src").map(str::to_owned),
            // Resolved on demand from the station's own page.
            stream_url: None,
        });
    }

    if stations.is_empty() {
        return Err(ProviderError::parse(
            SOURCE_NAME,
            "no station anchors on the directory page",
        ));
    }

    Ok(RadioDirectory {
        stations,
        freshness: Freshness::new(now),
    })
}

/// Only `http(s)` is accepted. A `javascript:` or `data:` source would be
/// handed straight to the webview's audio element, so the scheme is checked
/// rather than trusted.
pub fn parse_stream_url(page: &str) -> Option<String> {
    let document = Html::parse_document(page);
    let source = Selector::parse("source[src]").expect("static selector");
    document
        .select(&source)
        .filter_map(|element| element.value().attr("src"))
        .map(str::trim)
        .find(|src| src.starts_with("http://") || src.starts_with("https://"))
        .map(str::to_owned)
}
