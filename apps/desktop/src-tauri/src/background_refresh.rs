//! Keeps enabled remote modules warm while Sajilo lives in the tray.
//!
//! Screens still own presentation and manual refresh. This scheduler only
//! asks each feed for its current value; `Feed` applies that source's own
//! refetch interval, so an hourly wake does not scrape slow-changing sources
//! such as fuel or the radio directory every hour.

use std::time::Duration;

use tauri::{AppHandle, Emitter, Wry};

use crate::{commands, db, prefs};

const INITIAL_DELAY: Duration = Duration::from_secs(15);
const REFRESH_INTERVAL: Duration = Duration::from_secs(60 * 60);
const REFRESHED_EVENT: &str = "sajilo://feeds-refreshed";

fn enabled(app: &AppHandle<Wry>, key: &str) -> bool {
    db::get_json(app, key)
        .ok()
        .flatten()
        .and_then(|value| value.as_bool())
        .unwrap_or(true)
}

async fn refresh(app: &AppHandle<Wry>) {
    let news_enabled = enabled(app, prefs::NEWS_ENABLED);
    let weather_enabled = enabled(app, prefs::WEATHER_ENABLED);
    let forex_enabled = enabled(app, prefs::FOREX_ENABLED);
    let bazar_enabled = enabled(app, prefs::BAZAR_ENABLED);
    let rashifal_enabled = enabled(app, prefs::RASHIFAL_ENABLED);
    let radio_enabled = enabled(app, prefs::RADIO_ENABLED);

    let news_app = app.clone();
    let weather_app = app.clone();
    let forex_app = app.clone();
    let bazar_app = app.clone();
    let stocks_app = app.clone();
    let rashifal_app = app.clone();
    let radio_app = app.clone();

    tokio::join!(
        async move {
            if news_enabled {
                commands::news::get_news(news_app, Some(false)).await;
            }
        },
        async move {
            if weather_enabled {
                commands::weather::get_weather(weather_app, Some(false), None).await;
            }
        },
        async move {
            if forex_enabled {
                commands::forex::get_forex(forex_app, Some(false)).await;
            }
        },
        async move {
            if bazar_enabled {
                commands::bazar::get_bazar(bazar_app, Some(false)).await;
                commands::stocks::get_stocks(stocks_app, Some(false)).await;
            }
        },
        async move {
            if rashifal_enabled {
                commands::rashifal::get_rashifal(rashifal_app, Some(false)).await;
            }
        },
        async move {
            if radio_enabled {
                commands::radio::get_stations(radio_app, Some(false)).await;
            }
        },
    );
}

pub fn spawn(app: AppHandle<Wry>) {
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(INITIAL_DELAY).await;
        loop {
            refresh(&app).await;
            let _ = app.emit(REFRESHED_EVENT, ());
            tokio::time::sleep(REFRESH_INTERVAL).await;
        }
    });
}
