//! Reads only from `fixtures/sharesansar/`.

use chrono::{TimeZone, Utc};
use sajilo_api::stocks::MoverBoard;
use sajilo_providers::sharesansar;

const MARKET: &str = include_str!("../../../fixtures/sharesansar/market.html");
const PRICES: &str = include_str!("../../../fixtures/sharesansar/prices.html");

fn now() -> chrono::DateTime<Utc> {
    Utc.with_ymd_and_hms(2026, 8, 26, 14, 20, 0).unwrap()
}

#[test]
fn reads_the_index_the_market_page_leads_with() {
    let snapshot = sharesansar::parse(MARKET, PRICES, now()).expect("the recorded page parses");
    let nepse = snapshot.nepse.expect("the market page names NEPSE");
    assert!(nepse.name.to_lowercase().contains("nepse"));
    assert!(nepse.value > 0.0);
    assert!(
        !snapshot.sub_indices.is_empty(),
        "the sector indices are listed too"
    );
}

/// Every board on the market page is read, and a gainer really is one — the
/// four tables are laid out identically, so reading them in the wrong order
/// would put losers under the "top gainers" heading and nothing would look
/// wrong until someone checked a price.
#[test]
fn separates_the_four_leaderboards() {
    let snapshot = sharesansar::parse(MARKET, PRICES, now()).expect("the recorded page parses");

    for board in [
        MoverBoard::Gainers,
        MoverBoard::Losers,
        MoverBoard::Turnover,
        MoverBoard::Volume,
    ] {
        let rows: Vec<_> = snapshot
            .movers
            .iter()
            .filter(|m| m.board == board)
            .collect();
        assert!(!rows.is_empty(), "{board:?} is empty");
        assert!(rows.iter().all(|row| !row.symbol.is_empty()));
    }

    let gainers: Vec<_> = snapshot
        .movers
        .iter()
        .filter(|m| m.board == MoverBoard::Gainers)
        .collect();
    let losers: Vec<_> = snapshot
        .movers
        .iter()
        .filter(|m| m.board == MoverBoard::Losers)
        .collect();
    assert!(
        gainers.iter().all(|row| row.metric > 0.0),
        "a gainer gained"
    );
    assert!(losers.iter().all(|row| row.metric < 0.0), "a loser lost");
}

/// The price table is the long one — every listed company, not a leaderboard.
#[test]
fn reads_the_whole_price_table() {
    let quotes = sharesansar::quotes(PRICES).expect("the recorded page parses");
    assert!(quotes.len() > 100, "got {}", quotes.len());
    assert!(quotes.iter().all(|quote| !quote.symbol.is_empty()));
    assert!(quotes.iter().all(|quote| quote.ltp > 0.0));

    // The two decimal places the market publishes must survive: a quoted 722.90
    // rounded to 723 is a different price.
    assert!(
        quotes.iter().any(|quote| quote.ltp.fract() != 0.0),
        "prices are quoted to the paisa"
    );
}
