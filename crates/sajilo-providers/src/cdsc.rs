//! CDSC's public current-issue table.
//!
//! CDSC does not expose a public JSON endpoint for open IPOs. Its `/ipolist`
//! route is server-rendered HTML, so this parser selects the table by its
//! headers rather than depending on its position in the page.
//!
//! Each issue's name arrives as one cell that packs the company, its symbol,
//! and the issue description together. It is split here, once, so the app
//! never has to pattern-match source text; the raw cell is kept alongside.

use std::sync::LazyLock;

use chrono::{DateTime, Utc};
use regex::Regex;
use sajilo_api::ipos::{IpoIssue, IpoSnapshot};

use crate::error::{ProviderError, Result};
use crate::html;
use crate::http::HttpClient;

pub const SOURCE_NAME: &str = "CDSC";
pub const CURRENT_ISSUES_URL: &str = "https://cdsc.com.np/index.php/ipolist";

/// `Company - SYMBOL (Issue type - For audience)`, CDSC's usual shape. The
/// description is optional, and a symbol must be upper-case so a hyphen inside
/// a company name is never mistaken for the separator.
static LISTED_NAME: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(
        r"^(?P<name>.+?)\s+[-–]\s+(?P<symbol>[A-Z][A-Z0-9]{1,11})(?:\s*\((?P<issue>[^()]*)\))?$",
    )
    .expect("listed-name pattern is valid")
});

/// `Company (Issue type - For audience)`, when CDSC leaves the symbol out.
static UNLISTED_NAME: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"^(?P<name>.+?)\s*\((?P<issue>[^()]*)\)$").expect("unlisted-name pattern is valid")
});

pub async fn fetch(client: &HttpClient, now: DateTime<Utc>) -> Result<IpoSnapshot> {
    let page = client.get_text(SOURCE_NAME, CURRENT_ISSUES_URL).await?;
    parse(&page, now)
}

pub fn parse(page: &str, now: DateTime<Utc>) -> Result<IpoSnapshot> {
    let table = html::table_with_headings(page, &["Company Name", "Open-Date", "Close-Date"])
        .ok_or_else(|| ProviderError::parse(SOURCE_NAME, "no current-issue table"))?;
    let header = table
        .first()
        .ok_or_else(|| ProviderError::parse(SOURCE_NAME, "current-issue table has no header"))?;

    let issues = table
        .iter()
        .skip(1)
        .filter_map(|row| issue(header, row))
        .collect();

    Ok(IpoSnapshot {
        issues,
        freshness: sajilo_api::load_state::Freshness::new(now),
    })
}

fn issue(header: &[String], row: &[String]) -> Option<IpoIssue> {
    let value = |name: &str| value_for(header, row, name);
    let company_name = value("company name");
    if company_name.is_empty() {
        return None;
    }

    let parts = split_company_name(&company_name);
    let open_date = value("open date");
    let close_date = value("close date");
    let open_to_public = is_open_to_public(parts.issue_type.as_deref(), parts.audience.as_deref());

    Some(IpoIssue {
        id: format!("{company_name}|{open_date}|{close_date}"),
        company_name,
        name: parts.name,
        symbol: parts.symbol,
        issue_type: parts.issue_type,
        audience: parts.audience,
        open_to_public,
        issue_manager: value("issue manager"),
        issued_units: value("issued unit"),
        application_count: value("number of application"),
        applied_units: value("applied unit"),
        amount: value("amount"),
        open_date,
        close_date,
        last_update: value("last update"),
    })
}

/// A named audience decides it; without one, anything but a right share is
/// taken as a public offer, since that is what CDSC lists by default.
fn is_open_to_public(issue_type: Option<&str>, audience: Option<&str>) -> bool {
    let mentions = |text: &str, word: &str| text.to_ascii_lowercase().contains(word);
    audience.map_or_else(
        || !issue_type.is_some_and(|kind| mentions(kind, "right")),
        |audience| mentions(audience, "general public"),
    )
}

#[derive(Debug, Default)]
struct NameParts {
    name: String,
    symbol: Option<String>,
    issue_type: Option<String>,
    audience: Option<String>,
}

/// Anything that does not fit a known shape keeps its whole text as the name
/// rather than being guessed at.
fn split_company_name(raw: &str) -> NameParts {
    let text = raw.split_whitespace().collect::<Vec<_>>().join(" ");
    let Some(captures) = LISTED_NAME
        .captures(&text)
        .or_else(|| UNLISTED_NAME.captures(&text))
    else {
        return NameParts {
            name: text,
            ..NameParts::default()
        };
    };

    let (issue_type, audience) = captures
        .name("issue")
        .map_or((None, None), |issue| split_issue(issue.as_str()));

    NameParts {
        name: captures["name"].trim().to_owned(),
        symbol: captures
            .name("symbol")
            .map(|symbol| symbol.as_str().to_owned()),
        issue_type,
        audience,
    }
}

/// `IPO - For General Public` → (`IPO`, `General Public`).
fn split_issue(text: &str) -> (Option<String>, Option<String>) {
    let (kind, audience) = match text.split_once(" - ") {
        Some((kind, audience)) => (kind, Some(audience)),
        None => (text, None),
    };
    (
        non_empty(kind),
        audience.map(without_for).and_then(non_empty),
    )
}

fn without_for(text: &str) -> &str {
    let text = text.trim();
    match text.get(..4) {
        Some(prefix) if prefix.eq_ignore_ascii_case("for ") => &text[4..],
        _ => text,
    }
}

fn non_empty(text: &str) -> Option<String> {
    let text = text.trim();
    (!text.is_empty()).then(|| text.to_owned())
}

fn value_for(header: &[String], row: &[String], name: &str) -> String {
    let needle = normalize(name);
    header
        .iter()
        .position(|cell| normalize(cell) == needle)
        .and_then(|index| row.get(index))
        .cloned()
        .unwrap_or_default()
}

fn normalize(value: &str) -> String {
    value
        .chars()
        .filter(|character| character.is_ascii_alphanumeric())
        .collect::<String>()
        .to_ascii_lowercase()
}
