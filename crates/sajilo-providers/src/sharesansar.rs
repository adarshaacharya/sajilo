//! ShareSansar's public market and today-share-price pages.
//!
//! Ported from `ShareSansarStockProvider.swift`. One price-table request supplies
//! every listed symbol; the market page supplies NEPSE, sector sub-indices, and
//! the four leaderboards.

use std::collections::HashMap;

use chrono::{DateTime, NaiveDate, NaiveTime, TimeZone, Utc};
use sajilo_api::load_state::Freshness;
use sajilo_api::stocks::{MarketIndex, MarketMover, MoverBoard, StockMarketSnapshot, StockQuote};
use serde::Deserialize;

use crate::error::{ProviderError, Result};
use crate::html;
use crate::http::HttpClient;

pub const SOURCE_NAME: &str = "ShareSansar";

const MARKET_URL: &str = "https://www.sharesansar.com/index.php/market";
const PRICES_URL: &str = "https://www.sharesansar.com/index.php/today-share-price";

pub async fn fetch(client: &HttpClient, now: DateTime<Utc>) -> Result<StockMarketSnapshot> {
    let (market, prices) = tokio::try_join!(
        client.get_text(SOURCE_NAME, MARKET_URL),
        client.get_text(SOURCE_NAME, PRICES_URL),
    )?;
    parse(&market, &prices, now)
}

pub fn parse(
    market_html: &str,
    prices_html: &str,
    now: DateTime<Utc>,
) -> Result<StockMarketSnapshot> {
    let quotes = quotes(prices_html)?;
    let indices = parse_index_table(market_html, "Index");
    let nepse = indices
        .iter()
        .find(|index| index.name.to_ascii_lowercase().contains("nepse"))
        .cloned();
    let published = published_date(prices_html).or_else(|| published_date(market_html));
    let mut freshness = Freshness::new(now);
    if let Some(published) = published {
        freshness = freshness.with_source(published);
    }

    Ok(StockMarketSnapshot {
        nepse,
        sub_indices: parse_index_table(market_html, "Sub Index"),
        movers: movers(market_html),
        quotes,
        freshness,
    })
}

pub fn quotes(html: &str) -> Result<Vec<StockQuote>> {
    let table = html::all_tables(html)
        .into_iter()
        .find(|rows| {
            rows.first().is_some_and(|header| {
                let joined = header.join(" ");
                joined.contains("Symbol") && joined.contains("LTP")
            })
        })
        .ok_or_else(|| ProviderError::parse(SOURCE_NAME, "no Symbol/LTP price table"))?;

    let names = company_names(html);
    let quotes: Vec<StockQuote> = table
        .iter()
        .skip(1)
        .filter_map(|row| {
            if row.len() < 18 {
                return None;
            }
            let symbol = row[1].trim().to_ascii_uppercase();
            if symbol.is_empty() {
                return None;
            }
            let ltp = html::parse_number(&row[7])?;
            let previous_close = html::parse_number(&row[12])?;
            let turnover = html::parse_number(&row[13])?;
            let change = html::parse_number(&row[15])?;
            let change_percent = html::parse_number(&row[17])?;
            let optional = |index: usize| row.get(index).and_then(|cell| html::parse_number(cell));

            Some(StockQuote {
                symbol: symbol.clone(),
                company_name: names.get(&symbol).cloned(),
                ltp,
                previous_close,
                change,
                change_percent,
                open: optional(3),
                high: optional(4),
                low: optional(5),
                close: optional(6),
                vwap: optional(10),
                volume: optional(11),
                turnover,
                transactions: optional(14),
                week52_high: optional(22),
                week52_low: optional(23),
                average120_day: optional(20),
                average180_day: optional(21),
            })
        })
        .collect();

    if quotes.is_empty() {
        return Err(ProviderError::parse(
            SOURCE_NAME,
            "price table had no usable rows",
        ));
    }
    Ok(quotes)
}

fn parse_index_table(html: &str, heading: &str) -> Vec<MarketIndex> {
    let Some(table) = html::all_tables(html).into_iter().find(|rows| {
        rows.first().is_some_and(|header| {
            header.iter().any(|cell| cell.trim() == heading)
                && header.iter().any(|cell| cell.contains("Point"))
        })
    }) else {
        return Vec::new();
    };

    table
        .iter()
        .skip(1)
        .filter_map(|row| {
            if row.len() < 8 {
                return None;
            }
            let name = row[0].trim().to_owned();
            if name.is_empty() {
                return None;
            }
            Some(MarketIndex {
                name,
                value: html::parse_number(&row[4])?,
                change: html::parse_number(&row[5])?,
                change_percent: html::parse_number(&row[6])?,
                turnover: html::parse_number(&row[7])?,
            })
        })
        .collect()
}

fn movers(html: &str) -> Vec<MarketMover> {
    let tables = html::all_tables(html);

    let by_percent: Vec<_> = tables
        .iter()
        .filter(|table| {
            table.first().is_some_and(|header| {
                header.len() >= 3
                    && header[0].trim() == "Symbol"
                    && header
                        .iter()
                        .any(|cell| cell.to_ascii_lowercase().contains("% change"))
            })
        })
        .collect();

    let mut movers = Vec::new();
    if let Some(gainers) = by_percent.first() {
        movers.extend(parse_mover_rows(gainers, MoverBoard::Gainers, 1, 3));
    }
    if by_percent.len() > 1 {
        movers.extend(parse_mover_rows(by_percent[1], MoverBoard::Losers, 1, 3));
    }

    if let Some(turnover) = tables.iter().find(|table| {
        table.first().is_some_and(|header| {
            header.len() >= 3
                && header[0].trim() == "Symbol"
                && header
                    .iter()
                    .any(|cell| cell.to_ascii_lowercase().contains("turnover"))
        })
    }) {
        movers.extend(parse_mover_rows(turnover, MoverBoard::Turnover, 2, 1));
    }

    if let Some(volume) = tables.iter().find(|table| {
        table.first().is_some_and(|header| {
            header.len() >= 3
                && header[0].trim() == "Symbol"
                && header
                    .iter()
                    .any(|cell| cell.to_ascii_lowercase().contains("volume"))
        })
    }) {
        movers.extend(parse_mover_rows(volume, MoverBoard::Volume, 2, 1));
    }

    movers
}

fn parse_mover_rows(
    table: &[Vec<String>],
    board: MoverBoard,
    ltp: usize,
    metric: usize,
) -> Vec<MarketMover> {
    table
        .iter()
        .skip(1)
        .filter_map(|row| {
            let needed = ltp.max(metric);
            if row.len() <= needed {
                return None;
            }
            let symbol = row[0].trim().to_ascii_uppercase();
            if symbol.is_empty() {
                return None;
            }
            let metric_value = html::parse_number(&row[metric])?;
            Some(MarketMover {
                board,
                symbol,
                ltp: html::parse_number(&row[ltp]).unwrap_or(0.0),
                metric: metric_value,
            })
        })
        .collect()
}

fn company_names(html: &str) -> HashMap<String, String> {
    #[derive(Deserialize)]
    struct CompanyRecord {
        symbol: String,
        companyname: String,
    }

    let Some(marker) = html.find("var cmpjson =") else {
        return HashMap::new();
    };
    let after = &html[marker + "var cmpjson =".len()..];
    let Some(start) = after.find('[') else {
        return HashMap::new();
    };
    let slice = &after[start..];
    let Some(end) = slice.find("];") else {
        return HashMap::new();
    };
    let Ok(records) = serde_json::from_str::<Vec<CompanyRecord>>(&slice[..=end]) else {
        return HashMap::new();
    };
    records
        .into_iter()
        .map(|record| (record.symbol.to_ascii_uppercase(), record.companyname))
        .collect()
}

fn published_date(html: &str) -> Option<DateTime<Utc>> {
    // yyyy-MM-dd somewhere on the page ("As of : 2026-08-14").
    let bytes = html.as_bytes();
    let mut i = 0;
    while i + 10 <= bytes.len() {
        if bytes[i] == b'2'
            && bytes[i + 1] == b'0'
            && bytes[i + 2].is_ascii_digit()
            && bytes[i + 3].is_ascii_digit()
            && bytes[i + 4] == b'-'
            && bytes[i + 5].is_ascii_digit()
            && bytes[i + 6].is_ascii_digit()
            && bytes[i + 7] == b'-'
            && bytes[i + 8].is_ascii_digit()
            && bytes[i + 9].is_ascii_digit()
        {
            let text = std::str::from_utf8(&bytes[i..i + 10]).ok()?;
            let date = NaiveDate::parse_from_str(text, "%Y-%m-%d").ok()?;
            return Some(Utc.from_utc_datetime(&date.and_time(NaiveTime::from_hms_opt(0, 0, 0)?)));
        }
        i += 1;
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    const PRICE_PAGE: &str = r#"
    <script>var cmpjson = [{"symbol":"NABIL","companyname":"Nabil Bank Limited"},{"symbol":"UPPER","companyname":"Upper Tamakoshi Hydropower Limited"}];</script>
    <h5>As of : <span>2026-08-14</span></h5>
    <table id="headFixed"><thead><tr>
      <th>S.No</th><th>Symbol</th><th>Conf.</th><th>Open</th><th>High</th><th>Low</th><th>Close</th><th>LTP</th><th>Close - LTP</th><th>Close - LTP %</th><th>VWAP</th><th>Vol</th><th>Prev. Close</th><th>Turnover</th><th>Trans.</th><th>Diff</th><th>Range</th><th>Diff %</th>
    </tr></thead><tbody>
      <tr><td>1</td><td><a>NABIL</a></td><td>42</td><td>525</td><td>535</td><td>520</td><td>530</td><td>532</td><td>-2</td><td>-0.38</td><td>528</td><td>1,000</td><td>530</td><td>532,000</td><td>12</td><td>2</td><td>15</td><td>0.38</td></tr>
      <tr><td>2</td><td><a>UPPER</a></td><td>30</td><td>200</td><td>205</td><td>198</td><td>202</td><td>200</td><td>2</td><td>0.99</td><td>201</td><td>2,000</td><td>202</td><td>400,000</td><td>8</td><td>-2</td><td>7</td><td>-0.99</td></tr>
    </tbody></table>
    "#;

    const MARKET_PAGE: &str = r#"
    <p>As of <span>2026-08-14</span></p>
    <table><thead><tr><th>Index</th><th>Open</th><th>High</th><th>Low</th><th>Close</th><th>Point Change</th><th>% Change</th><th>Turnover</th></tr></thead>
    <tbody><tr><td>NEPSE Index</td><td>2,600</td><td>2,650</td><td>2,590</td><td>2,643.83</td><td>-7.37</td><td>-0.27</td><td>4,275,675,402.84</td></tr></tbody></table>
    "#;

    #[test]
    fn reads_quotes_and_company_names() {
        let quotes = quotes(PRICE_PAGE).unwrap();
        assert_eq!(quotes.len(), 2);
        let nabil = quotes.iter().find(|q| q.symbol == "NABIL").unwrap();
        assert_eq!(nabil.ltp, 532.0);
        assert_eq!(nabil.company_name.as_deref(), Some("Nabil Bank Limited"));
        assert_eq!(nabil.previous_close, 530.0);
        assert_eq!(nabil.change, 2.0);
        assert_eq!(nabil.change_percent, 0.38);
        assert_eq!(nabil.turnover, 532_000.0);
    }

    #[test]
    fn reads_the_index_separately_from_ticker_rows() {
        let snapshot = parse(MARKET_PAGE, PRICE_PAGE, Utc::now()).unwrap();
        let index = snapshot.nepse.unwrap();
        assert_eq!(index.value, 2643.83);
        assert_eq!(index.change, -7.37);
        assert_eq!(index.turnover, 4_275_675_402.84);
        assert_eq!(
            snapshot
                .quotes
                .iter()
                .find(|q| q.symbol == "NABIL")
                .map(|q| q.ltp),
            Some(532.0)
        );
        assert!(snapshot.freshness.source_timestamp.is_some());
    }

    #[test]
    fn rejects_a_page_that_only_looks_like_a_stock_table() {
        assert!(quotes("<table><tr><th>Symbol</th></tr><tr><td>NABIL</td></tr></table>").is_err());
    }
}
