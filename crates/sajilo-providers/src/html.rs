//! Table scraping for the sources that publish server-rendered HTML and offer
//! no API — Nepal Oil Corporation's fuel prices and the Kalimati market board.
//!
//! Replaces `HTMLTable.swift`, which hand-scanned for tag pairs because Swift
//! ships no HTML parser. `scraper` is a real one, so malformed markup, nested
//! tables and attribute quirks are its problem rather than ours.

use scraper::{Html, Selector};

/// Every table on the page, each as rows of tag-stripped cell text.
///
/// Sources such as the Kalimati board put several independent datasets on one
/// page, so callers select a table by its own header rather than by position.
pub fn all_tables(html: &str) -> Vec<Vec<Vec<String>>> {
    let document = Html::parse_document(html);
    let table = Selector::parse("table").expect("static selector");
    let row = Selector::parse("tr").expect("static selector");
    // `th, td` in one selector keeps a heading row that mixes both in document
    // order; reading all the `th`s then all the `td`s would reorder it.
    let cell = Selector::parse("th, td").expect("static selector");

    document
        .select(&table)
        .map(|table| {
            table
                .select(&row)
                .map(|row| {
                    row.select(&cell)
                        .map(|cell| text(&cell))
                        .collect::<Vec<_>>()
                })
                .filter(|cells: &Vec<String>| !cells.is_empty())
                .collect()
        })
        .collect()
}

pub fn first_table(html: &str) -> Vec<Vec<String>> {
    all_tables(html).into_iter().next().unwrap_or_default()
}

/// The first table whose header row mentions every one of `headings`, compared
/// case-insensitively. Selecting by content survives a page that grows another
/// table above the one we want.
pub fn table_with_headings(html: &str, headings: &[&str]) -> Option<Vec<Vec<String>>> {
    all_tables(html).into_iter().find(|table| {
        table.first().is_some_and(|header| {
            let joined = header.join(" ").to_lowercase();
            headings
                .iter()
                .all(|heading| joined.contains(&heading.to_lowercase()))
        })
    })
}

/// Whitespace-collapsed text of an element, entities already decoded by the
/// parser.
fn text(element: &scraper::ElementRef) -> String {
    element
        .text()
        .flat_map(str::split_whitespace)
        .collect::<Vec<_>>()
        .join(" ")
}

/// Digits, a decimal point and a minus sign, with everything else discarded —
/// these tables carry `Rs 1,234.50`, `१२३`, stray footnote markers and
/// non-breaking spaces in the same column.
pub fn parse_number(raw: &str) -> Option<f64> {
    let ascii = sajilo_core::numerals::to_ascii_digits(raw);
    let cleaned: String = ascii
        .chars()
        .filter(|c| c.is_ascii_digit() || *c == '.' || *c == '-')
        .collect();
    // Guard against a lone "-" or "." parsing as something, and against a cell
    // that was pure punctuation.
    if !cleaned.chars().any(|c| c.is_ascii_digit()) {
        return None;
    }
    cleaned.parse().ok()
}
