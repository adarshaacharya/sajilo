//! An open-end fund's NAV history, from ShareSansar.
//!
//! Open-end schemes never trade on NEPSE, so no price chart has them; their
//! only history is the NAV the manager publishes. ShareSansar keeps every one
//! and draws its "Price vs NAV" chart from a plain JSON series per fund, daily
//! and weekly. The series is keyed by ShareSansar's own company id, which its
//! fund table carries, so the table is read first to find it.
//!
//! Daily NAVs start later than weekly ones for most schemes, and one scheme's
//! daily series answers with a server error, so the weekly series fills in
//! before the daily one starts, or stands alone when there is no daily one.

use chrono::{DateTime, NaiveDate, Utc};
use sajilo_api::load_state::Freshness;
use sajilo_api::mutual_funds::{FundKind, NavHistory, NavHistoryPoint};
use serde::Deserialize;
use serde_json::Value;

use crate::error::{ProviderError, Result};
use crate::http::HttpClient;
use crate::mutual_funds::sharesansar_tab;
use crate::sharehub_chart::valid_symbol;
use crate::sharesansar::SOURCE_NAME as SOURCE;

const CHART_URL: &str = "https://www.sharesansar.com/mutual-fund-navs-chart";

pub async fn fetch(client: &HttpClient, symbol: &str, now: DateTime<Utc>) -> Result<NavHistory> {
    if !valid_symbol(symbol) {
        return Err(ProviderError::parse(SOURCE, "invalid symbol"));
    }
    let pages = sharesansar_tab(client, FundKind::OpenEnd).await?;
    let id = pages
        .iter()
        .find_map(|(_, body)| company_id(body, symbol).transpose())
        .transpose()?
        .ok_or_else(|| ProviderError::parse(SOURCE, format!("no open-end fund {symbol}")))?;

    let series = |criteria: &'static str| {
        let url = format!("{CHART_URL}?id={id}&criteria={criteria}");
        async move { client.get_text(SOURCE, &url).await }
    };
    let (daily, weekly) = tokio::join!(series("DAILY"), series("WEEKLY"));
    // Either one is enough to draw; only both failing is worth an error, and
    // then the weekly one's reason, since it is the series every fund has.
    let daily = daily.ok();
    let weekly = match weekly {
        Ok(body) => Some(body),
        Err(error) if daily.is_none() => return Err(error),
        Err(_) => None,
    };
    parse(symbol, daily.as_deref(), weekly.as_deref(), now)
}

#[derive(Deserialize)]
struct TablePage {
    data: Vec<TableRow>,
}

#[derive(Deserialize)]
struct TableRow {
    symbol: Option<String>,
    companyid: Option<Value>,
}

/// ShareSansar's id for `symbol` in one page of its fund table, if listed.
pub fn company_id(body: &str, symbol: &str) -> Result<Option<u32>> {
    let page: TablePage = serde_json::from_str(body)
        .map_err(|error| ProviderError::parse(SOURCE, error.to_string()))?;
    Ok(page.data.into_iter().find_map(|row| {
        let listed = row.symbol?.trim().eq_ignore_ascii_case(symbol);
        let id = match row.companyid? {
            Value::Number(number) => number.as_u64(),
            Value::String(text) => text.trim().parse().ok(),
            _ => None,
        };
        listed
            .then_some(id)
            .flatten()
            .and_then(|id| u32::try_from(id).ok())
    }))
}

#[derive(Deserialize)]
struct SeriesRow {
    date: Option<String>,
    value: Option<Value>,
}

/// The daily series, with the weekly one before it starts. Either may be
/// missing; a body that is not the expected JSON (an error page) counts as
/// missing too, so one bad series never loses the other.
pub fn parse(
    symbol: &str,
    daily: Option<&str>,
    weekly: Option<&str>,
    now: DateTime<Utc>,
) -> Result<NavHistory> {
    let daily = without_typos(daily.map(series).unwrap_or_default());
    let weekly = without_typos(weekly.map(series).unwrap_or_default());
    let starts = daily.first().map(|(date, _)| *date);
    let mut points: Vec<(NaiveDate, f64)> = weekly
        .into_iter()
        .filter(|(date, _)| starts.is_none_or(|start| *date < start))
        .chain(daily)
        .collect();
    points.sort_by_key(|(date, _)| *date);
    points.dedup_by_key(|(date, _)| *date);
    let points: Vec<NavHistoryPoint> = points
        .into_iter()
        .filter_map(|(date, nav)| {
            let time = u32::try_from(date.and_hms_opt(0, 0, 0)?.and_utc().timestamp()).ok()?;
            Some(NavHistoryPoint { time, nav })
        })
        .collect();
    if points.len() < 2 {
        return Err(ProviderError::parse(SOURCE, "no NAV history"));
    }
    Ok(NavHistory {
        symbol: symbol.to_owned(),
        points,
        source: SOURCE.to_owned(),
        freshness: Freshness::new(now),
    })
}

/// A NAV that jumps far from both neighbours while they agree with each
/// other is a typing slip at the source (8.87, 4.19, 8.88), not a market: a
/// fund's NAV moves a few percent a week at most. Those points are dropped so
/// one slip does not draw a cliff across the chart.
fn without_typos(points: Vec<(NaiveDate, f64)>) -> Vec<(NaiveDate, f64)> {
    const JUMP: f64 = 0.08;
    const AGREE: f64 = 0.03;
    let apart = |a: f64, b: f64| (a - b).abs() / b;
    (0..points.len())
        .filter(|&i| {
            let (Some(before), Some(after)) = (
                i.checked_sub(1).map(|j| points[j].1),
                points.get(i + 1).map(|p| p.1),
            ) else {
                return true;
            };
            let nav = points[i].1;
            !(apart(nav, before) > JUMP && apart(nav, after) > JUMP && apart(after, before) < AGREE)
        })
        .map(|i| points[i])
        .collect()
}

/// One series, oldest first, keeping only rows with a real date and a NAV
/// above zero.
fn series(body: &str) -> Vec<(NaiveDate, f64)> {
    let rows: Vec<SeriesRow> = serde_json::from_str(body).unwrap_or_default();
    let mut points: Vec<(NaiveDate, f64)> = rows
        .into_iter()
        .filter_map(|row| {
            let date = NaiveDate::parse_from_str(row.date?.trim(), "%Y-%m-%d").ok()?;
            let nav = match row.value? {
                Value::Number(number) => number.as_f64(),
                Value::String(text) => text.trim().parse().ok(),
                _ => None,
            }?;
            (nav.is_finite() && nav > 0.0).then_some((date, nav))
        })
        .collect();
    points.sort_by_key(|(date, _)| *date);
    points
}

#[cfg(test)]
mod tests {
    use super::*;

    const TABLE: &str = include_str!("../../../fixtures/sharesansar/mutual-fund-navs-open.json");
    const DAILY: &str = include_str!("../../../fixtures/sharesansar/nav-chart-1082-daily.json");
    const WEEKLY: &str = include_str!("../../../fixtures/sharesansar/nav-chart-1082-weekly.json");

    fn now() -> DateTime<Utc> {
        DateTime::parse_from_rfc3339("2026-10-01T06:00:00Z")
            .unwrap()
            .with_timezone(&Utc)
    }

    fn day(time: u32) -> NaiveDate {
        DateTime::from_timestamp(i64::from(time), 0)
            .unwrap()
            .date_naive()
    }

    #[test]
    fn a_fund_is_found_by_symbol_in_the_table() {
        assert_eq!(company_id(TABLE, "NMBSBF").unwrap(), Some(1082));
        assert_eq!(company_id(TABLE, "nmbsbf").unwrap(), Some(1082));
        assert_eq!(company_id(TABLE, "NOPE").unwrap(), None);
    }

    #[test]
    fn weekly_navs_fill_in_before_the_daily_series_starts() {
        let history = parse("NMBSBF", Some(DAILY), Some(WEEKLY), now()).unwrap();
        let first = history.points.first().unwrap();
        let last = history.points.last().unwrap();
        // Weekly goes back to September 2021; daily only starts in May 2022.
        assert_eq!(day(first.time).to_string(), "2021-09-24");
        assert!((first.nav - 9.97).abs() < 1e-9);
        assert_eq!(day(last.time).to_string(), "2026-09-29");
        assert!(
            history
                .points
                .windows(2)
                .all(|pair| pair[0].time < pair[1].time)
        );
        // Once the daily series starts, no weekly point is mixed into it.
        let daily_start = NaiveDate::from_ymd_opt(2022, 5, 26).unwrap();
        let after: Vec<_> = history
            .points
            .iter()
            .filter(|point| day(point.time) >= daily_start)
            .collect();
        // 1221 rows: three a second NAV for a day already listed, and one
        // typing slip.
        assert_eq!(after.len(), 1217);
    }

    #[test]
    fn a_failed_daily_series_leaves_the_weekly_one() {
        let error_page = "<!DOCTYPE html><html><body>Server Error</body></html>";
        // 255 weekly NAVs, less the 9.98 slipped in between 8.88 and 8.90.
        let history = parse("SLK", Some(error_page), Some(WEEKLY), now()).unwrap();
        assert_eq!(history.points.len(), 254);
        let history = parse("SLK", None, Some(WEEKLY), now()).unwrap();
        assert_eq!(history.points.len(), 254);
    }

    #[test]
    fn a_typing_slip_at_the_source_is_left_out() {
        let history = parse("NMBSBF", Some(DAILY), Some(WEEKLY), now()).unwrap();
        // The daily series reads 8.87, 4.19, 8.88 across 18-20 April 2023.
        let slip = NaiveDate::from_ymd_opt(2023, 4, 19).unwrap();
        assert!(!history.points.iter().any(|point| day(point.time) == slip));
        // A real move, up and staying up, is kept.
        let steady = vec![
            (NaiveDate::from_ymd_opt(2024, 1, 1).unwrap(), 10.0),
            (NaiveDate::from_ymd_opt(2024, 1, 2).unwrap(), 11.0),
            (NaiveDate::from_ymd_opt(2024, 1, 3).unwrap(), 11.1),
        ];
        assert_eq!(without_typos(steady.clone()), steady);
    }

    #[test]
    fn nothing_to_draw_is_an_error() {
        assert!(parse("NMBSBF", None, None, now()).is_err());
        assert!(parse("NMBSBF", Some("[]"), Some("[]"), now()).is_err());
    }
}
