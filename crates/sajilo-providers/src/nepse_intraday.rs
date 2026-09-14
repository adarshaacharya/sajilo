//! NEPSE through its latest session, from ShareHub.
//!
//! ShareHub relays the exchange's index as one-minute candles. The app draws a
//! line, so each minute keeps only its close. Outside trading hours the feed
//! still answers with the last session, which is what the chart should show
//! beside "Last traded".

use chrono::{DateTime, TimeZone, Utc};
use sajilo_api::load_state::Freshness;
use sajilo_api::stocks::{IndexIntraday, IndexPoint};
use serde::Deserialize;

use crate::error::{ProviderError, Result};
use crate::http::HttpClient;
use crate::market_status::SHAREHUB_SOURCE as SOURCE_NAME;

const INTRADAY_URL: &str = "https://sharehubnepal.com/live/api/v1/daily-graph/index/candle/NEPSE";

pub async fn fetch(client: &HttpClient, now: DateTime<Utc>) -> Result<IndexIntraday> {
    let body = client.get_text(SOURCE_NAME, INTRADAY_URL).await?;
    parse(&body, now)
}

// The upstream candle, modelled separately from the DTO. Both fields are
// optional so one malformed minute is skipped rather than failing the session.
#[derive(Deserialize)]
struct Candle {
    time: Option<i64>,
    close: Option<f64>,
}

pub fn parse(body: &str, now: DateTime<Utc>) -> Result<IndexIntraday> {
    let candles: Vec<Candle> = serde_json::from_str(body)
        .map_err(|error| ProviderError::parse(SOURCE_NAME, error.to_string()))?;

    let mut points: Vec<IndexPoint> = candles
        .into_iter()
        .filter_map(|candle| {
            let value = candle
                .close
                .filter(|close| close.is_finite() && *close > 0.0)?;
            let time = Utc.timestamp_opt(candle.time?, 0).single()?;
            Some(IndexPoint { time, value })
        })
        .collect();
    // The chart library requires strictly increasing times.
    points.sort_by_key(|point| point.time);
    points.dedup_by_key(|point| point.time);

    let mut freshness = Freshness::new(now);
    if let Some(last) = points.last() {
        freshness = freshness.with_source(last.time);
    }
    Ok(IndexIntraday { points, freshness })
}

#[cfg(test)]
mod tests {
    use super::*;

    const RECORDED: &str = include_str!("../../../fixtures/sharehub/nepse-intraday.json");

    fn at(instant: &str) -> DateTime<Utc> {
        instant.parse().unwrap()
    }

    #[test]
    fn reads_the_recorded_session_oldest_first() {
        let session = parse(RECORDED, at("2026-09-14T12:00:00Z")).unwrap();
        assert_eq!(session.points.len(), 242);
        // 11:00 and 15:01 in Kathmandu.
        assert_eq!(session.points[0].time, at("2026-09-14T05:15:00Z"));
        assert_eq!(session.points[0].value, 2558.74);
        let last = session.points.last().unwrap();
        assert_eq!(last.time, at("2026-09-14T09:16:00Z"));
        assert_eq!(last.value, 2585.04);
        assert!(
            session
                .points
                .windows(2)
                .all(|pair| pair[0].time < pair[1].time)
        );
        assert_eq!(session.freshness.source_timestamp, Some(last.time));
    }

    #[test]
    fn skips_malformed_minutes() {
        let body = r#"[
            {"time":1789362900,"close":2558.74},
            {"time":1789362960,"close":null},
            {"time":null,"close":2560.0},
            {"time":1789363020,"close":-1},
            {"time":1789362900,"close":2558.74}
        ]"#;
        let session = parse(body, at("2026-09-14T12:00:00Z")).unwrap();
        assert_eq!(session.points.len(), 1);
    }

    #[test]
    fn rejects_a_response_that_is_not_a_candle_list() {
        assert!(parse(r#"{"success":false}"#, at("2026-09-14T12:00:00Z")).is_err());
    }
}
