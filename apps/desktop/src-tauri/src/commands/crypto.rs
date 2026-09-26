//! Crypto prices from CoinGecko, with Kraken behind it, and each coin's chart.
//! Shown for information: see `sajilo_providers::crypto`.

use std::borrow::Cow;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use chrono::Utc;
use sajilo_api::crypto::{CryptoChart, CryptoSnapshot};
use sajilo_api::load_state::LoadState;
use sajilo_providers::{HttpClient, crypto};
use tauri::{AppHandle, Manager, Wry};

use crate::feed::Feed;
use crate::prefs::CRYPTO_KEY;

/// Crypto trades around the clock, so the list is refetched every few minutes
/// while it is looked at; a copy past half an hour is shown, labelled stale.
const MAX_AGE_SECS: i64 = 30 * 60;
const REFETCH_AFTER_SECS: i64 = 3 * 60;

/// A chart's cache, by coin id and span in days.
type ChartFeeds = HashMap<(String, u32), Arc<Feed<CryptoChart>>>;

pub struct CryptoCache {
    feed: Feed<CryptoSnapshot>,
    charts: Mutex<ChartFeeds>,
    client: HttpClient,
}

impl Default for CryptoCache {
    fn default() -> Self {
        Self {
            feed: Feed::new(CRYPTO_KEY, MAX_AGE_SECS, REFETCH_AFTER_SECS),
            charts: Mutex::new(HashMap::new()),
            client: HttpClient::new(),
        }
    }
}

impl CryptoCache {
    /// One cached chart per coin and span, made the first time it is asked
    /// for. A day's chart moves by the minute, a year's by the day, so the
    /// longer the span the longer a copy is kept.
    fn chart_feed(&self, id: &str, days: u32) -> Arc<Feed<CryptoChart>> {
        let (max_age, refetch) = match days {
            1 => (30 * 60, 5 * 60),
            7 => (2 * 60 * 60, 30 * 60),
            30 => (6 * 60 * 60, 60 * 60),
            _ => (24 * 60 * 60, 6 * 60 * 60),
        };
        self.charts
            .lock()
            .expect("crypto chart feeds mutex poisoned")
            .entry((id.to_owned(), days))
            .or_insert_with(|| {
                Arc::new(Feed::keyed(
                    Cow::Owned(format!("{CRYPTO_KEY}.chart.{id}.{days}")),
                    max_age,
                    refetch,
                ))
            })
            .clone()
    }
}

#[tauri::command]
pub async fn get_crypto(app: AppHandle<Wry>, refresh: Option<bool>) -> LoadState<CryptoSnapshot> {
    let cache = app.state::<CryptoCache>();
    let client = &cache.client;
    let now = Utc::now();
    cache
        .feed
        .get(&app, now, refresh.unwrap_or(false), || {
            crypto::fetch(client, now)
        })
        .await
}

#[tauri::command]
pub async fn get_crypto_chart(
    app: AppHandle<Wry>,
    id: String,
    days: u32,
) -> LoadState<CryptoChart> {
    if !crypto::CHART_DAYS.contains(&days) {
        return LoadState::Failed(format!("unsupported chart span: {days} days"));
    }
    let cache = app.state::<CryptoCache>();
    let feed = cache.chart_feed(&id, days);
    let client = &cache.client;
    let now = Utc::now();
    feed.get(&app, now, false, || {
        crypto::fetch_chart(client, &id, days, now)
    })
    .await
}
