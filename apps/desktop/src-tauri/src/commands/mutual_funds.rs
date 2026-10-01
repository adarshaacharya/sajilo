//! Mutual fund NAVs from ShareHub, with ShareSansar behind it, shown on the
//! mutual funds view.

use std::borrow::Cow;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use chrono::Utc;
use sajilo_api::load_state::LoadState;
use sajilo_api::mutual_funds::{MutualFundSnapshot, NavHistory};
use sajilo_providers::{HttpClient, fund_nav_history, mutual_funds, sharehub_chart};
use tauri::{AppHandle, Manager, Wry};

use crate::feed::Feed;
use crate::prefs::MUTUAL_FUNDS_KEY;

/// Fund managers publish a NAV at most once a working day, most by late
/// morning for the day before, so a few pulls a day catch each one. A copy
/// past a day old is shown, labelled stale.
const MAX_AGE_SECS: i64 = 24 * 60 * 60;
const REFETCH_AFTER_SECS: i64 = 3 * 60 * 60;

/// A fund's NAV history gains a point a working day at most, so the same
/// rhythm as the list serves it.
const HISTORY_MAX_AGE_SECS: i64 = 24 * 60 * 60;
const HISTORY_REFETCH_AFTER_SECS: i64 = 6 * 60 * 60;

pub struct MutualFundsCache {
    feed: Feed<MutualFundSnapshot>,
    /// One NAV history per open-end fund, made the first time it is opened.
    histories: Mutex<HashMap<String, Arc<Feed<NavHistory>>>>,
    client: HttpClient,
}

impl Default for MutualFundsCache {
    fn default() -> Self {
        Self {
            feed: Feed::new(MUTUAL_FUNDS_KEY, MAX_AGE_SECS, REFETCH_AFTER_SECS),
            histories: Mutex::new(HashMap::new()),
            client: HttpClient::new(),
        }
    }
}

#[tauri::command]
pub async fn get_mutual_funds(
    app: AppHandle<Wry>,
    refresh: Option<bool>,
) -> LoadState<MutualFundSnapshot> {
    let cache = app.state::<MutualFundsCache>();
    let client = &cache.client;
    let now = Utc::now();
    cache
        .feed
        .get(&app, now, refresh.unwrap_or(false), || {
            mutual_funds::fetch(client, now)
        })
        .await
}

/// An open-end fund's NAV since it started publishing, for its chart.
#[tauri::command]
pub async fn get_fund_nav_history(
    app: AppHandle<Wry>,
    symbol: String,
    refresh: Option<bool>,
) -> LoadState<NavHistory> {
    let symbol = symbol.trim().to_ascii_uppercase();
    if !sharehub_chart::valid_symbol(&symbol) {
        return LoadState::Failed(format!("unsupported fund: {symbol}"));
    }
    let cache = app.state::<MutualFundsCache>();
    let feed = cache
        .histories
        .lock()
        .expect("fund history feeds mutex poisoned")
        .entry(symbol.clone())
        .or_insert_with(|| {
            Arc::new(Feed::keyed(
                Cow::Owned(format!("{MUTUAL_FUNDS_KEY}.history.{symbol}")),
                HISTORY_MAX_AGE_SECS,
                HISTORY_REFETCH_AFTER_SECS,
            ))
        })
        .clone();
    let client = &cache.client;
    let now = Utc::now();
    feed.get(&app, now, refresh.unwrap_or(false), || {
        fund_nav_history::fetch(client, &symbol, now)
    })
    .await
}
