//! Daily rashifal from Hamro Patro. Ported from
//! `HamroPatroRashifalProvider.swift`.
//!
//! The `/en/` path serves the same Nepali prose with only the surrounding
//! chrome translated, so there is no English edition to prefer. The reading
//! stays Nepali whatever Sajilo's language is set to — the same call made for
//! news headlines.

use chrono::{DateTime, Utc};
use sajilo_api::load_state::Freshness;
use sajilo_api::rashifal::{RashiSign, Rashifal, RashifalSnapshot};
use scraper::{Html, Selector};

use crate::error::{ProviderError, Result};
use crate::http::HttpClient;

pub const SOURCE_NAME: &str = "HamroPatro rashifal";

pub const ENDPOINT: &str = "https://www.hamropatro.com/rashifal";

/// Long enough to be a reading rather than a stray label like a lucky colour or
/// the sign's name syllables, and short of any real paragraph the source
/// publishes. Counted in characters, not bytes — Devanagari is three bytes per
/// character, so a byte length would let a 20-character label through.
const MINIMUM_PREDICTION_CHARS: usize = 60;

/// How far past a sign's heading to look before giving up. The prediction sits
/// two runs later; more than this and the markup has moved.
const LOOKAHEAD_RUNS: usize = 6;

pub async fn fetch(client: &HttpClient, now: DateTime<Utc>) -> Result<RashifalSnapshot> {
    let body = client.get_text(SOURCE_NAME, ENDPOINT).await?;
    parse(&body, now)
}

pub fn parse(page: &str, now: DateTime<Utc>) -> Result<RashifalSnapshot> {
    let runs = text_runs(page);

    let readings: Vec<Rashifal> = RashiSign::ALL
        .into_iter()
        .filter_map(|sign| {
            Some(Rashifal {
                sign,
                prediction: prediction(sign, &runs)?,
            })
        })
        .collect();

    // All twelve or nothing. A partial page means the markup moved, and showing
    // four signs while silently dropping eight is worse than saying the reading
    // is unavailable.
    if readings.len() != RashiSign::ALL.len() {
        return Err(ProviderError::parse(
            SOURCE_NAME,
            format!(
                "found {} of {} signs — the page markup has changed",
                readings.len(),
                RashiSign::ALL.len()
            ),
        ));
    }

    Ok(RashifalSnapshot {
        readings,
        freshness: Freshness::new(now),
    })
}

/// Each sign is a heading of its own followed by its paragraph. The first
/// substantial run of Devanagari after the heading is that paragraph.
fn prediction(sign: RashiSign, runs: &[String]) -> Option<String> {
    // The sign's own name is an exact run, which is what separates the heading
    // from the many places the word appears inside prose.
    let index = runs.iter().position(|run| run == sign.nepali_name())?;

    runs.iter()
        .skip(index + 1)
        .take(LOOKAHEAD_RUNS)
        .find(|run| run.chars().count() >= MINIMUM_PREDICTION_CHARS && contains_devanagari(run))
        // Carried verbatim — never trimmed, summarised or reflowed. It is
        // someone's writing, and Sajilo shows it as published.
        .cloned()
}

/// Tag-stripped text runs, in document order, with script and style content
/// excluded so a JSON blob in a `<script>` cannot be mistaken for a reading.
fn text_runs(page: &str) -> Vec<String> {
    let document = Html::parse_document(page);
    let selector = Selector::parse("body *").expect("static selector");

    let mut runs = Vec::new();
    for element in document.select(&selector) {
        if matches!(element.value().name(), "script" | "style" | "noscript") {
            continue;
        }
        // Direct text children only: taking descendant text too would make a
        // wrapper element's run the concatenation of everything inside it.
        for node in element.children() {
            if let Some(text) = node.value().as_text() {
                let run = text.split_whitespace().collect::<Vec<_>>().join(" ");
                if !run.is_empty() {
                    runs.push(run);
                }
            }
        }
    }
    runs
}

fn contains_devanagari(text: &str) -> bool {
    text.chars().any(|c| ('\u{0900}'..='\u{097F}').contains(&c))
}
