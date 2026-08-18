//! Gold and silver from Hamro Patro's price page — the fallback for when
//! FENEGOSIDA is unreachable.
//!
//! FENEGOSIDA is the Federation itself and stays the primary source: it quotes
//! fine gold, tejabi gold and silver, per tola and per 10 g, and it is the body
//! that actually sets the rate. This page carries fewer rates — hallmark gold
//! and silver, per tola only — but it is a different operator on different
//! infrastructure, which is the whole point of a fallback. FENEGOSIDA sits
//! behind Cloudflare and answers 521 when its origin is down; Hamro Patro
//! keeps serving.
//!
//! The page is server-rendered Next.js, so the figures are in the HTML rather
//! than fetched by script. What is *not* in the HTML is the per-10 g and tejabi
//! breakdown, which the client renders — so this provider reports only what it
//! can actually read.

use chrono::{DateTime, Utc};
use sajilo_api::bazar::{Metal, MetalRate, MetalRateSnapshot, MetalUnit};
use sajilo_api::load_state::Freshness;
use scraper::{Html, Selector};

use crate::error::{ProviderError, Result};
use crate::http::HttpClient;

pub const SOURCE_NAME: &str = "HamroPatro metals";

/// The English page: its labels are stable ASCII, where the Nepali one would
/// have the parser matching Devanagari that the site is free to reword.
pub const ENDPOINT: &str = "https://www.hamropatro.com/en/gold";

/// How far past a metal's label to look for its price. The label, its unit, a
/// percentage and the price sit within a few runs of each other; further than
/// this and the markup has moved.
const LOOKAHEAD_RUNS: usize = 12;

pub async fn fetch(client: &HttpClient, now: DateTime<Utc>) -> Result<MetalRateSnapshot> {
    let body = client.get_text(SOURCE_NAME, ENDPOINT).await?;
    parse(&body, now)
}

pub fn parse(page: &str, now: DateTime<Utc>) -> Result<MetalRateSnapshot> {
    let runs = text_runs(page);

    // "Gold (Hallmark)" is the Federation's fine gold — the same 999 metal
    // under the retail name, not a third grade.
    let rates: Vec<MetalRate> = [(Metal::FineGold, "gold"), (Metal::Silver, "silver")]
        .into_iter()
        .filter_map(|(metal, label)| rate(metal, label, &runs))
        .collect();

    if rates.is_empty() {
        return Err(ProviderError::parse(
            SOURCE_NAME,
            "no gold or silver price found — the page markup has changed",
        ));
    }

    Ok(MetalRateSnapshot {
        rates,
        // Only the headline cards are server-rendered; the 30-day series behind
        // them is not, so this source contributes no sparkline.
        gold_history: Vec::new(),
        freshness: Freshness::new(now),
    })
}

/// One metal's card: a label, "Per Tola", then the price, then the movement
/// against the previous quote as "Increase"/"Decrease" plus an amount.
fn rate(metal: Metal, label: &str, runs: &[String]) -> Option<MetalRate> {
    // The word appears in the navigation and in the page's own prose long
    // before the card does, so every occurrence is tried and the first one that
    // looks like a price card wins.
    let starts = runs
        .iter()
        .enumerate()
        .filter(|(_, run)| run.to_lowercase().contains(label))
        .map(|(index, _)| index);

    starts
        .filter_map(|start| card(metal, &runs[start..runs.len().min(start + LOOKAHEAD_RUNS)]))
        .next()
}

/// One candidate window, or `None` if it is not a price card after all.
fn card(metal: Metal, window: &[String]) -> Option<MetalRate> {
    // Per tola is the only unit this page renders server-side. Reading a price
    // without confirming its unit would silently label a 10 g rate as a tola.
    if !window
        .iter()
        .any(|run| run.to_lowercase().contains("per tola"))
    {
        return None;
    }

    let mut amounts = amounts(window);
    let price = amounts.next()?;
    let direction = window.iter().find_map(|run| {
        let run = run.to_lowercase();
        match () {
            _ if run.contains("increase") => Some(1.0),
            _ if run.contains("decrease") => Some(-1.0),
            _ => None,
        }
    });
    // The change is the second money figure on the card. With no movement
    // published, previous equals current — a flat row, never a fake change.
    let change = amounts.next();
    let delta = match (direction, change) {
        (Some(sign), Some(change)) => sign * change,
        _ => 0.0,
    };

    Some(MetalRate {
        metal,
        unit: MetalUnit::Tola,
        price,
        previous_price: price - delta,
    })
}

/// Rupee figures in document order.
///
/// Anchored on the "Rs" the page prints beside every amount, because the card
/// also carries a bare percentage — reading any number would take "0.5" as the
/// price of gold.
fn amounts(runs: &[String]) -> impl Iterator<Item = f64> + '_ {
    runs.windows(2).filter_map(|pair| {
        if !pair[0].contains("Rs") {
            return None;
        }
        let digits: String = pair[1]
            .chars()
            .filter(|c| c.is_ascii_digit() || *c == '.')
            .collect();
        digits.parse().ok().filter(|value: &f64| *value > 0.0)
    })
}

/// Direct text children of every element, in document order. The same approach
/// as the rashifal scrape: taking descendant text would make a wrapper's run
/// the concatenation of everything inside it.
fn text_runs(page: &str) -> Vec<String> {
    let document = Html::parse_document(page);
    let selector = Selector::parse("body *").expect("static selector");

    let mut runs = Vec::new();
    for element in document.select(&selector) {
        if matches!(element.value().name(), "script" | "style" | "noscript") {
            continue;
        }
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
