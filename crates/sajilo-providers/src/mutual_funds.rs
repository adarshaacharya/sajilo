//! Mutual fund NAVs, from ShareHub's fund list with ShareSansar's behind it.
//!
//! Fund managers publish NAVs on their own sites, one scheme at a time; both
//! portals collect them into a single table carrying the same figures. ShareHub
//! answers every scheme in one plain JSON list, so it is asked first.
//! ShareSansar's table only answers its own page's script, one tab and fifty
//! rows at a time, so it is paged through tab by tab when ShareHub is down.

use chrono::{DateTime, NaiveDate, Utc};
use sajilo_api::load_state::Freshness;
use sajilo_api::mutual_funds::{FundKind, MonthlyNav, MutualFund, MutualFundSnapshot, NavPoint};
use sajilo_core::NepaliMonth;
use serde::Deserialize;
use serde_json::Value;

use crate::error::{ProviderError, Result};
use crate::http::HttpClient;
use crate::market_status::SHAREHUB_SOURCE;
use crate::sharesansar::SOURCE_NAME as SHARESANSAR_SOURCE;

const SHAREHUB_URL: &str = "https://sharehubnepal.com/data/api/v1/mutual-fund/nav";
/// ShareHub sends logo paths relative to its image host.
const SHAREHUB_IMAGES: &str = "https://cdn.arthakendra.com/";
const SHARESANSAR_URL: &str = "https://www.sharesansar.com/mutual-fund-navs";
/// ShareSansar's page size. Asking for more does not return more: it returns
/// an empty table.
const SHARESANSAR_PAGE: usize = 50;
/// A bound on paging, so a miscounted total cannot keep the loop asking.
const SHARESANSAR_MAX_PAGES: usize = 6;

pub async fn fetch(client: &HttpClient, now: DateTime<Utc>) -> Result<MutualFundSnapshot> {
    let primary = match client.get_text(SHAREHUB_SOURCE, SHAREHUB_URL).await {
        Ok(body) => parse_sharehub(&body, now),
        Err(error) => Err(error),
    };
    if primary.is_ok() {
        return primary;
    }
    let (open, closed, matured) = tokio::join!(
        sharesansar_tab(client, FundKind::OpenEnd),
        sharesansar_tab(client, FundKind::ClosedEnd),
        sharesansar_tab(client, FundKind::Matured),
    );
    // Open-end NAVs are what an SIP holder opens this for, so the fallback
    // stands on them; a closed-end or matured tab that fails is left out.
    let fallback = open.and_then(|mut pages| {
        pages.extend(closed.unwrap_or_default());
        pages.extend(matured.unwrap_or_default());
        let pages: Vec<(FundKind, &str)> = pages
            .iter()
            .map(|(kind, body)| (*kind, body.as_str()))
            .collect();
        parse_sharesansar(&pages, now)
    });
    // Both down: the primary's reason is the one worth reporting.
    fallback.or(primary)
}

/// Every page of one ShareSansar tab, following the row count it reports.
async fn sharesansar_tab(client: &HttpClient, kind: FundKind) -> Result<Vec<(FundKind, String)>> {
    let tab = match kind {
        FundKind::OpenEnd => 2,
        FundKind::ClosedEnd => -1,
        FundKind::Matured => 1,
    };
    let mut pages = Vec::new();
    let mut start = 0;
    loop {
        let url =
            format!("{SHARESANSAR_URL}?type={tab}&draw=1&start={start}&length={SHARESANSAR_PAGE}");
        let body = client
            .get_text_with_headers(
                SHARESANSAR_SOURCE,
                &url,
                &[("X-Requested-With", "XMLHttpRequest")],
            )
            .await?;
        let total = sharesansar_page(&body)?.records_total;
        pages.push((kind, body));
        match next_start(pages.len(), total) {
            Some(next) => start = next,
            None => return Ok(pages),
        }
    }
}

/// Where the next page starts, or `None` once the reported total is covered.
/// Without a total there is no telling, so one page is taken as the whole tab.
fn next_start(pages_fetched: usize, records_total: Option<usize>) -> Option<usize> {
    let fetched = pages_fetched * SHARESANSAR_PAGE;
    (pages_fetched < SHARESANSAR_MAX_PAGES && fetched < records_total?).then_some(fetched)
}

// Both upstream payloads, modelled separately from the DTO so a portal's field
// rename cannot reach into the contract the app is built on.
#[derive(Deserialize)]
struct ShareHubResponse {
    data: Vec<ShareHubFund>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ShareHubFund {
    symbol: Option<String>,
    name: Option<String>,
    #[serde(rename = "type")]
    kind: Option<String>,
    #[serde(default)]
    is_matured: bool,
    icon_url: Option<String>,
    size: Option<Value>,
    maturity_date: Option<String>,
    daily_nav_price: Option<Value>,
    daily_date: Option<String>,
    weekly_nav_price: Option<Value>,
    weekly_date: Option<String>,
    monthly_nav_price: Option<Value>,
    monthly_date: Option<String>,
    ltp: Option<Value>,
    published_date: Option<String>,
    discount_percent: Option<Value>,
    refund_nav: Option<Value>,
    holding_stocks: Option<Value>,
    total_holding_quantity: Option<Value>,
}

#[derive(Deserialize)]
struct ShareSansarPage {
    #[serde(rename = "recordsTotal")]
    records_total: Option<usize>,
    data: Vec<ShareSansarFund>,
}

#[derive(Deserialize)]
struct ShareSansarFund {
    symbol: Option<String>,
    companyname: Option<String>,
    fund_size: Option<Value>,
    daily_nav_price: Option<Value>,
    daily_date: Option<String>,
    weekly_nav_price: Option<Value>,
    weekly_date: Option<String>,
    monthly_nav_price: Option<Value>,
    monthly_date: Option<String>,
    maturity_date: Option<String>,
    /// Closed-end only: the last traded price.
    close: Option<Value>,
    published_date: Option<String>,
    prem_dis: Option<Value>,
    refund_nav: Option<Value>,
}

fn sharesansar_page(body: &str) -> Result<ShareSansarPage> {
    serde_json::from_str(body)
        .map_err(|error| ProviderError::parse(SHARESANSAR_SOURCE, error.to_string()))
}

/// What both portals agree on, before it is checked and shaped into a DTO.
struct RawFund {
    symbol: Option<String>,
    name: Option<String>,
    kind: FundKind,
    logo_url: Option<String>,
    fund_size: Option<f64>,
    maturity_date: Option<String>,
    daily: Option<NavPoint>,
    weekly: Option<NavPoint>,
    monthly: Option<MonthlyNav>,
    ltp: Option<f64>,
    ltp_date: Option<String>,
    premium_percent: Option<f64>,
    refund_nav: Option<f64>,
    holdings: Option<u32>,
    held_shares: Option<f64>,
}

pub fn parse_sharehub(body: &str, now: DateTime<Utc>) -> Result<MutualFundSnapshot> {
    let response: ShareHubResponse = serde_json::from_str(body)
        .map_err(|error| ProviderError::parse(SHAREHUB_SOURCE, error.to_string()))?;
    let raw = response.data.into_iter().filter_map(|fund| {
        let kind = match fund.kind.as_deref()?.trim() {
            _ if fund.is_matured => FundKind::Matured,
            "OpenEnd" => FundKind::OpenEnd,
            "CloseEnd" | "ClosedEnd" => FundKind::ClosedEnd,
            _ => return None,
        };
        Some(RawFund {
            symbol: fund.symbol,
            name: fund.name,
            kind,
            logo_url: fund.icon_url.as_deref().and_then(logo_url),
            fund_size: fund.size.as_ref().and_then(number),
            maturity_date: fund.maturity_date,
            daily: nav_point(fund.daily_nav_price.as_ref(), fund.daily_date.as_deref()),
            weekly: nav_point(fund.weekly_nav_price.as_ref(), fund.weekly_date.as_deref()),
            monthly: monthly_nav(
                fund.monthly_nav_price.as_ref(),
                fund.monthly_date.as_deref(),
            ),
            ltp: fund.ltp.as_ref().and_then(number),
            ltp_date: fund.published_date,
            premium_percent: fund.discount_percent.as_ref().and_then(number),
            refund_nav: fund.refund_nav.as_ref().and_then(number),
            holdings: fund
                .holding_stocks
                .as_ref()
                .and_then(number)
                .map(|count| count as u32),
            held_shares: fund.total_holding_quantity.as_ref().and_then(number),
        })
    });
    snapshot(SHAREHUB_SOURCE, raw, now)
}

/// ShareSansar's rows carry no scheme type of their own, so each page comes
/// paired with the tab it was asked from.
pub fn parse_sharesansar(
    pages: &[(FundKind, &str)],
    now: DateTime<Utc>,
) -> Result<MutualFundSnapshot> {
    let mut raw = Vec::new();
    for (kind, body) in pages {
        raw.extend(
            sharesansar_page(body)?
                .data
                .into_iter()
                .map(|fund| RawFund {
                    symbol: fund.symbol,
                    name: fund.companyname,
                    kind: *kind,
                    logo_url: None,
                    fund_size: fund.fund_size.as_ref().and_then(number),
                    maturity_date: fund.maturity_date,
                    daily: nav_point(fund.daily_nav_price.as_ref(), fund.daily_date.as_deref()),
                    weekly: nav_point(fund.weekly_nav_price.as_ref(), fund.weekly_date.as_deref()),
                    monthly: monthly_nav(
                        fund.monthly_nav_price.as_ref(),
                        fund.monthly_date.as_deref(),
                    ),
                    ltp: fund.close.as_ref().and_then(number),
                    ltp_date: fund.published_date,
                    premium_percent: fund.prem_dis.as_ref().and_then(number),
                    refund_nav: fund.refund_nav.as_ref().and_then(number),
                    holdings: None,
                    held_shares: None,
                }),
        );
    }
    // A fund on two pages (the table shifting between requests) is kept once.
    let mut seen = std::collections::HashSet::new();
    raw.retain(|fund| {
        fund.symbol
            .as_deref()
            .is_none_or(|symbol| seen.insert(symbol.trim().to_ascii_uppercase()))
    });
    snapshot(SHARESANSAR_SOURCE, raw.into_iter(), now)
}

fn snapshot(
    source_name: &'static str,
    raw: impl Iterator<Item = RawFund>,
    now: DateTime<Utc>,
) -> Result<MutualFundSnapshot> {
    let mut funds: Vec<MutualFund> = raw.filter_map(fund).collect();
    if funds.is_empty() {
        return Err(ProviderError::parse(
            source_name,
            "no fund had a usable NAV",
        ));
    }
    funds.sort_by(|a, b| {
        kind_rank(a.kind)
            .cmp(&kind_rank(b.kind))
            .then_with(|| a.name.cmp(&b.name))
    });
    Ok(MutualFundSnapshot {
        funds,
        source: source_name.to_owned(),
        freshness: Freshness::new(now),
    })
}

fn kind_rank(kind: FundKind) -> u8 {
    match kind {
        FundKind::OpenEnd => 0,
        FundKind::ClosedEnd => 1,
        FundKind::Matured => 2,
    }
}

/// A fund with no NAV at all has nothing to show, so it is dropped rather than
/// listed empty.
fn fund(raw: RawFund) -> Option<MutualFund> {
    let symbol = raw.symbol?.trim().to_ascii_uppercase();
    let name = raw.name.map(|name| name.trim().to_owned())?;
    if symbol.is_empty() || name.is_empty() {
        return None;
    }

    // A daily NAV older than the weekly one is a scheme that stopped
    // publishing daily; the weekly figure is then the newer word.
    let (latest, previous) = match (&raw.daily, &raw.weekly) {
        (Some(daily), Some(weekly)) if daily.date > weekly.date => {
            (daily.clone(), Some(weekly.clone()))
        }
        (Some(daily), Some(weekly)) if daily.date == weekly.date => (daily.clone(), None),
        (_, Some(weekly)) => (weekly.clone(), None),
        (Some(daily), None) => (daily.clone(), None),
        (None, None) => return None,
    };

    let closed = raw.kind == FundKind::ClosedEnd;
    let matured = raw.kind == FundKind::Matured;
    // A matured scheme's last trade is history; what it pays is the refund NAV.
    let ltp = raw.ltp.filter(|price| closed && *price > 0.0);
    let premium_percent = ltp.and_then(|ltp| {
        let percent = raw
            .premium_percent
            .or_else(|| Some((ltp / raw.weekly.as_ref()?.nav - 1.0) * 100.0))?;
        Some((percent * 100.0).round() / 100.0)
    });

    Some(MutualFund {
        symbol,
        name,
        kind: raw.kind,
        logo_url: raw.logo_url,
        latest,
        previous,
        daily: raw.daily,
        weekly: raw.weekly,
        monthly: raw.monthly,
        fund_size: raw.fund_size.filter(|size| *size > 0.0),
        ltp_date: raw
            .ltp_date
            .filter(|_| ltp.is_some())
            .and_then(|raw| iso_date(&raw)),
        ltp,
        premium_percent,
        // Open-end schemes carry their launch date here, not a maturity.
        maturity_date: raw
            .maturity_date
            .filter(|_| closed || matured)
            .and_then(|raw| iso_date(&raw)),
        refund_nav: raw.refund_nav.filter(|nav| matured && *nav > 0.0),
        holdings: raw.holdings.filter(|count| *count > 0),
        held_shares: raw.held_shares.filter(|count| *count > 0.0),
    })
}

/// A path on ShareHub's image host, or an absolute URL, as https.
fn logo_url(path: &str) -> Option<String> {
    let path = path.trim();
    if path.is_empty() {
        None
    } else if path.starts_with("https://") {
        Some(path.to_owned())
    } else if path.contains("://") {
        None
    } else {
        Some(format!("{SHAREHUB_IMAGES}{}", path.trim_start_matches('/')))
    }
}

fn nav_point(nav: Option<&Value>, date: Option<&str>) -> Option<NavPoint> {
    let nav = nav.and_then(number).filter(|nav| *nav > 0.0)?;
    Some(NavPoint {
        nav,
        date: iso_date(date?)?,
    })
}

fn iso_date(raw: &str) -> Option<String> {
    let date = NaiveDate::parse_from_str(raw.trim().get(..10)?, "%Y-%m-%d").ok()?;
    Some(date.to_string())
}

/// Portals send figures as numbers or as strings, depending on the column.
fn number(value: &Value) -> Option<f64> {
    match value {
        Value::Number(number) => number.as_f64(),
        Value::String(text) => text.trim().replace(',', "").parse().ok(),
        _ => None,
    }
    .filter(|number: &f64| number.is_finite())
}

fn monthly_nav(nav: Option<&Value>, label: Option<&str>) -> Option<MonthlyNav> {
    let nav = nav.and_then(number).filter(|nav| *nav > 0.0)?;
    let (month, bs_year) = bs_month(label?)?;
    Some(MonthlyNav {
        nav,
        bs_year,
        bs_month: month.number(),
        month_name: month.english_name().to_owned(),
        month_name_ne: month.nepali_name().to_owned(),
    })
}

/// `Shrawan 2083`, `Baishak,2075`, `Jestha, 2075` — every romanisation the
/// portals have been seen to use, since each fund manager types its own.
fn bs_month(label: &str) -> Option<(NepaliMonth, i32)> {
    let mut words = label
        .split(|c: char| !c.is_ascii_alphanumeric())
        .filter(|word| !word.is_empty());
    let name = words.next()?.to_ascii_lowercase();
    let year: i32 = words.next()?.parse().ok()?;
    if !(2000..=2200).contains(&year) {
        return None;
    }
    let number = match name.as_str() {
        "baishakh" | "baisakh" | "baishak" | "baisak" | "vaishakh" => 1,
        "jestha" | "jeth" | "jesth" | "jyestha" => 2,
        "asar" | "asadh" | "ashad" | "ashadh" | "ashar" => 3,
        "shrawan" | "srawan" | "shravan" | "sawan" | "saun" => 4,
        "bhadra" | "bhadau" | "bhadaw" => 5,
        "ashwin" | "aswin" | "asoj" | "ashoj" => 6,
        "kartik" | "kartika" => 7,
        "mangsir" | "mangshir" | "marga" | "mangsheer" => 8,
        "poush" | "paush" | "push" | "pous" | "pus" => 9,
        "magh" | "mag" => 10,
        "falgun" | "phalgun" | "fagun" | "phagun" => 11,
        "chaitra" | "chait" | "chaita" => 12,
        _ => return None,
    };
    Some((NepaliMonth::from_number(number)?, year))
}

#[cfg(test)]
mod tests {
    use super::*;

    const SHAREHUB: &str = include_str!("../../../fixtures/sharehub/mutual-fund-nav.json");
    const SHARESANSAR_OPEN: &str =
        include_str!("../../../fixtures/sharesansar/mutual-fund-navs-open.json");
    const SHARESANSAR_CLOSED: &str =
        include_str!("../../../fixtures/sharesansar/mutual-fund-navs-closed.json");
    const SHARESANSAR_MATURED: &str =
        include_str!("../../../fixtures/sharesansar/mutual-fund-navs-matured.json");

    fn sharesansar() -> MutualFundSnapshot {
        parse_sharesansar(
            &[
                (FundKind::OpenEnd, SHARESANSAR_OPEN),
                (FundKind::ClosedEnd, SHARESANSAR_CLOSED),
                (FundKind::Matured, SHARESANSAR_MATURED),
            ],
            now(),
        )
        .unwrap()
    }

    fn now() -> DateTime<Utc> {
        "2026-09-18T06:00:00Z".parse().unwrap()
    }

    fn find<'a>(snapshot: &'a MutualFundSnapshot, symbol: &str) -> &'a MutualFund {
        snapshot
            .funds
            .iter()
            .find(|fund| fund.symbol == symbol)
            .unwrap_or_else(|| panic!("{symbol} missing"))
    }

    #[test]
    fn sharehub_lists_every_scheme_open_end_first_matured_last() {
        let snapshot = parse_sharehub(SHAREHUB, now()).unwrap();
        assert_eq!(snapshot.source, "ShareHub");
        let open = snapshot
            .funds
            .iter()
            .filter(|fund| fund.kind == FundKind::OpenEnd)
            .count();
        assert_eq!(open, 14);
        assert_eq!(snapshot.funds.len(), 14 + 45 + 16);
        let first = |kind| {
            snapshot
                .funds
                .iter()
                .position(|fund| fund.kind == kind)
                .unwrap()
        };
        assert_eq!(first(FundKind::ClosedEnd), 14);
        assert_eq!(first(FundKind::Matured), 14 + 45);
        assert!(
            snapshot.funds[..14]
                .windows(2)
                .all(|pair| pair[0].name <= pair[1].name)
        );
    }

    #[test]
    fn an_open_end_fund_moves_from_its_weekly_nav_to_its_daily_one() {
        let snapshot = parse_sharehub(SHAREHUB, now()).unwrap();
        let ssis = find(&snapshot, "SSIS");
        assert_eq!(ssis.kind, FundKind::OpenEnd);
        assert_eq!(
            ssis.latest,
            NavPoint {
                nav: 10.79,
                date: "2026-09-17".into()
            }
        );
        assert_eq!(
            ssis.previous,
            Some(NavPoint {
                nav: 10.57,
                date: "2026-09-11".into()
            })
        );
        let monthly = ssis.monthly.as_ref().unwrap();
        assert_eq!((monthly.bs_year, monthly.bs_month), (2083, 4));
        assert_eq!(monthly.month_name, "Shrawan");
        assert_eq!(monthly.month_name_ne, "साउन");
        assert_eq!(ssis.ltp, None);
        assert_eq!(ssis.maturity_date, None);
        assert_eq!(ssis.fund_size, Some(33_544_703_773.0));
    }

    #[test]
    fn a_late_fund_keeps_its_own_dates() {
        let snapshot = parse_sharehub(SHAREHUB, now()).unwrap();
        let csby = find(&snapshot, "CSBY");
        assert_eq!(csby.latest.date, "2026-09-07");
        assert_eq!(csby.previous.as_ref().unwrap().date, "2026-08-28");
    }

    #[test]
    fn a_closed_end_fund_carries_its_market_price_against_nav() {
        let snapshot = parse_sharehub(SHAREHUB, now()).unwrap();
        let sef = find(&snapshot, "SEF");
        assert_eq!(sef.kind, FundKind::ClosedEnd);
        // Closed-end schemes publish weekly only, so that is the latest.
        assert_eq!(sef.latest.nav, 10.35);
        assert_eq!(sef.previous, None);
        assert_eq!(sef.ltp, Some(9.61));
        assert_eq!(sef.premium_percent, Some(-7.15));
        assert_eq!(sef.ltp_date.as_deref(), Some("2026-09-18"));
        // Each fund's price is dated by its own last trade.
        assert_eq!(
            find(&snapshot, "NICBF").ltp_date.as_deref(),
            Some("2026-09-17")
        );
        assert_eq!(find(&snapshot, "SSIS").ltp_date, None);
        assert_eq!(sef.maturity_date.as_deref(), Some("2027-11-08"));
        assert_eq!(sef.holdings, Some(53));
        assert_eq!(
            sef.logo_url.as_deref(),
            Some(
                "https://cdn.arthakendra.com/sharehub/images/2025/01/08/070230-siddharth-bank-logo.png"
            )
        );
        assert_eq!(sef.held_shares, Some(4_490_303.0));
    }

    #[test]
    fn a_matured_fund_carries_its_refund_nav() {
        let snapshot = parse_sharehub(SHAREHUB, now()).unwrap();
        let lemf = find(&snapshot, "LEMF");
        assert_eq!(lemf.kind, FundKind::Matured);
        assert_eq!(lemf.refund_nav, Some(11.14));
        assert_eq!(lemf.maturity_date.as_deref(), Some("2024-06-12"));
        // Its last trade is history, not a price anyone can sell at.
        assert_eq!(lemf.ltp, None);
        assert_eq!(lemf.ltp_date, None);
        assert_eq!(lemf.premium_percent, None);
    }

    #[test]
    fn sharesansar_reads_every_tab_with_figures_sent_as_strings() {
        let snapshot = sharesansar();
        assert_eq!(snapshot.source, "ShareSansar");
        let count = |kind| {
            snapshot
                .funds
                .iter()
                .filter(|fund| fund.kind == kind)
                .count()
        };
        assert_eq!(count(FundKind::OpenEnd), 14);
        assert_eq!(count(FundKind::ClosedEnd), 45);
        assert_eq!(count(FundKind::Matured), 16);

        let niblsf = find(&snapshot, "NIBLSF");
        assert_eq!(niblsf.latest.nav, 10.14);
        assert_eq!(niblsf.latest.date, "2026-09-17");
        assert_eq!(niblsf.previous.as_ref().unwrap().nav, 9.96);
        assert_eq!(niblsf.fund_size, Some(9_980_675_490.0));

        let sef = find(&snapshot, "SEF");
        assert_eq!(sef.ltp, Some(9.61));
        assert_eq!(sef.ltp_date.as_deref(), Some("2026-09-18"));
        assert_eq!(sef.logo_url, None);
        // ShareSansar sends the full float; it is rounded like ShareHub's.
        assert_eq!(sef.premium_percent, Some(-7.15));

        assert_eq!(find(&snapshot, "LEMF").refund_nav, Some(11.14));
    }

    #[test]
    fn both_portals_agree_on_every_nav() {
        let sharehub = parse_sharehub(SHAREHUB, now()).unwrap();
        let sharesansar = sharesansar();
        assert_eq!(sharesansar.funds.len(), sharehub.funds.len());
        for fund in &sharesansar.funds {
            let other = find(&sharehub, &fund.symbol);
            assert_eq!(other.kind, fund.kind, "{}", fund.symbol);
            assert_eq!(other.latest, fund.latest, "{}", fund.symbol);
        }
    }

    #[test]
    fn pages_until_the_reported_total_is_covered() {
        assert_eq!(next_start(1, Some(45)), None);
        assert_eq!(next_start(1, Some(50)), None);
        assert_eq!(next_start(1, Some(75)), Some(50));
        assert_eq!(next_start(2, Some(75)), None);
        // No total: one page is the whole tab.
        assert_eq!(next_start(1, None), None);
        // A runaway total stops at the page cap.
        assert_eq!(next_start(SHARESANSAR_MAX_PAGES, Some(10_000)), None);
    }

    #[test]
    fn a_fund_repeated_across_pages_is_kept_once() {
        let page = r#"{"recordsTotal":2,"data":[{"symbol":"ABC","companyname":"A Fund",
            "weekly_nav_price":"10","weekly_date":"2026-09-11"}]}"#;
        let snapshot = parse_sharesansar(
            &[(FundKind::ClosedEnd, page), (FundKind::ClosedEnd, page)],
            now(),
        )
        .unwrap();
        assert_eq!(snapshot.funds.len(), 1);
    }

    #[test]
    fn logo_paths_become_https_urls_and_nothing_else_does() {
        assert_eq!(
            logo_url("sharehub/icons/nabil.png").as_deref(),
            Some("https://cdn.arthakendra.com/sharehub/icons/nabil.png")
        );
        assert_eq!(
            logo_url("https://example.com/a.png").as_deref(),
            Some("https://example.com/a.png")
        );
        assert_eq!(logo_url("http://example.com/a.png"), None);
        assert_eq!(logo_url("  "), None);
    }

    #[test]
    fn reads_each_romanisation_of_the_bs_month() {
        assert_eq!(bs_month("Shrawan 2083"), Some((NepaliMonth::Shrawan, 2083)));
        assert_eq!(
            bs_month("Baishak,2075"),
            Some((NepaliMonth::Baishakh, 2075))
        );
        assert_eq!(bs_month("Jestha, 2075"), Some((NepaliMonth::Jestha, 2075)));
        assert_eq!(bs_month("Asoj 2083"), Some((NepaliMonth::Ashwin, 2083)));
        assert_eq!(bs_month("Shrawan"), None);
        assert_eq!(bs_month("Someday 2083"), None);
    }

    #[test]
    fn a_stale_daily_nav_gives_way_to_a_newer_weekly_one() {
        let body = r#"{"data":[{"symbol":"x","name":"X Fund","type":"OpenEnd",
            "dailyNavPrice":10.0,"dailyDate":"2026-09-01",
            "weeklyNavPrice":10.5,"weeklyDate":"2026-09-11"}]}"#;
        let snapshot = parse_sharehub(body, now()).unwrap();
        let fund = &snapshot.funds[0];
        assert_eq!(fund.symbol, "X");
        assert_eq!(fund.latest.nav, 10.5);
        assert_eq!(fund.previous, None);
    }

    #[test]
    fn drops_funds_with_no_nav_or_an_unknown_type() {
        let body = r#"{"data":[
            {"symbol":"NONE","name":"No Nav","type":"OpenEnd","dailyDate":"","weeklyDate":""},
            {"symbol":"ODD","name":"Odd Fund","type":"Interval",
             "weeklyNavPrice":10,"weeklyDate":"2026-09-11"}
        ]}"#;
        assert!(parse_sharehub(body, now()).is_err());
    }

    #[test]
    fn rejects_a_response_that_is_not_the_fund_list() {
        assert!(parse_sharehub("<html></html>", now()).is_err());
        assert!(parse_sharesansar(&[(FundKind::OpenEnd, "<!DOCTYPE html>")], now()).is_err());
    }
}
