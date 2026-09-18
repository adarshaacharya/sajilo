//! Mutual fund NAVs from ShareHub, with ShareSansar behind it, shown on the
//! mutual funds view.

use chrono::Utc;
use sajilo_api::load_state::LoadState;
use sajilo_api::mutual_funds::MutualFundSnapshot;
use sajilo_providers::{HttpClient, mutual_funds};
use tauri::{AppHandle, Manager, Wry};

use crate::feed::Feed;
use crate::prefs::MUTUAL_FUNDS_KEY;

/// Fund managers publish a NAV at most once a working day, most by late
/// morning for the day before, so a few pulls a day catch each one. A copy
/// past a day old is shown, labelled stale.
const MAX_AGE_SECS: i64 = 24 * 60 * 60;
const REFETCH_AFTER_SECS: i64 = 3 * 60 * 60;

pub struct MutualFundsCache {
    feed: Feed<MutualFundSnapshot>,
    client: HttpClient,
}

impl Default for MutualFundsCache {
    fn default() -> Self {
        Self {
            feed: Feed::new(MUTUAL_FUNDS_KEY, MAX_AGE_SECS, REFETCH_AFTER_SECS),
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
