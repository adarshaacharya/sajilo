//! Reads only from `fixtures/cdsc/`.

use chrono::{TimeZone, Utc};
use sajilo_api::ipos::IpoIssue;
use sajilo_providers::cdsc;

const FIXTURE: &str = include_str!("../../../fixtures/cdsc/current-issues.html");

fn now() -> chrono::DateTime<Utc> {
    Utc.with_ymd_and_hms(2026, 9, 14, 10, 0, 0).unwrap()
}

/// A one-row current-issue table carrying just the name cell under test.
fn issue_named(company: &str) -> IpoIssue {
    let page = format!(
        "<table><tr><th>Company Name</th><th>Open-Date</th><th>Close-Date</th></tr>\
         <tr><td>{company}</td><td>2026-09-07</td><td>2026-09-11</td></tr></table>"
    );
    cdsc::parse(&page, now())
        .expect("one-row table parses")
        .issues
        .remove(0)
}

#[test]
fn reads_the_current_issue_row_by_header_name() {
    let snapshot = cdsc::parse(FIXTURE, now()).expect("recorded CDSC page parses");
    assert_eq!(snapshot.issues.len(), 1);

    let issue = &snapshot.issues[0];
    assert_eq!(
        issue.company_name,
        "Beni Hydropower Project Limited - BENI (IPO - For General Public)"
    );
    assert_eq!(issue.issue_manager, "NMB CAPITAL LIMITED");
    assert_eq!(issue.issued_units, "863200");
    assert_eq!(issue.open_date, "2026-09-07");
    assert_eq!(issue.close_date, "2026-09-11");
}

#[test]
fn splits_the_recorded_name_into_company_symbol_and_issue() {
    let snapshot = cdsc::parse(FIXTURE, now()).expect("recorded CDSC page parses");
    let issue = &snapshot.issues[0];
    assert_eq!(issue.name, "Beni Hydropower Project Limited");
    assert_eq!(issue.symbol.as_deref(), Some("BENI"));
    assert_eq!(issue.issue_type.as_deref(), Some("IPO"));
    assert_eq!(issue.audience.as_deref(), Some("General Public"));
}

#[test]
fn drops_the_leading_for_from_any_audience() {
    let issue = issue_named(
        "Himalayan Hydropower Limited - HHL (IPO - For Nepalese citizens working abroad)",
    );
    assert_eq!(issue.symbol.as_deref(), Some("HHL"));
    assert_eq!(
        issue.audience.as_deref(),
        Some("Nepalese citizens working abroad")
    );
}

#[test]
fn keeps_an_issue_type_that_names_no_audience() {
    let issue = issue_named("Nabil Bank Limited - NABIL (Right Share)");
    assert_eq!(issue.name, "Nabil Bank Limited");
    assert_eq!(issue.issue_type.as_deref(), Some("Right Share"));
    assert_eq!(issue.audience, None);
}

#[test]
fn reads_a_symbol_with_digits_and_no_description() {
    let issue = issue_named("Nabil Bank Debenture 2089 - NABILD2089");
    assert_eq!(issue.name, "Nabil Bank Debenture 2089");
    assert_eq!(issue.symbol.as_deref(), Some("NABILD2089"));
    assert_eq!(issue.issue_type, None);
}

#[test]
fn reads_a_description_without_a_symbol() {
    let issue = issue_named("Sana Kisan Laghubitta Limited (FPO - For General Public)");
    assert_eq!(issue.name, "Sana Kisan Laghubitta Limited");
    assert_eq!(issue.symbol, None);
    assert_eq!(issue.issue_type.as_deref(), Some("FPO"));
    assert_eq!(issue.audience.as_deref(), Some("General Public"));
}

#[test]
fn does_not_mistake_a_hyphen_in_the_company_name_for_the_symbol_separator() {
    let issue = issue_named("Api Power - Company Limited - API (IPO - For General Public)");
    assert_eq!(issue.name, "Api Power - Company Limited");
    assert_eq!(issue.symbol.as_deref(), Some("API"));
}

#[test]
fn leaves_an_unrecognised_name_whole() {
    let issue = issue_named("  Shree Ram - Laxman   Traders ");
    assert_eq!(issue.name, "Shree Ram - Laxman Traders");
    assert_eq!(issue.symbol, None);
    assert_eq!(issue.issue_type, None);
    assert_eq!(issue.audience, None);
}

#[test]
fn accepts_a_valid_empty_current_issue_table() {
    let empty =
        r#"<table><tr><th>Company Name</th><th>Open-Date</th><th>Close-Date</th></tr></table>"#;
    assert!(cdsc::parse(empty, now()).unwrap().issues.is_empty());
}

#[test]
fn rejects_a_page_without_the_current_issue_table() {
    assert!(cdsc::parse("<html><body>maintenance</body></html>", now()).is_err());
}
