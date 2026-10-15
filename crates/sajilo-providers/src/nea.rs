//! Nepal Electricity Authority's public bill check: a plain HTML form at
//! `neabilling.com/viewonline`, no login and no CAPTCHA, that answers with a
//! table of the account's bills and payments for a date range.
//!
//! The table interleaves two kinds of row under each payment's transaction:
//! a bare payment (no month, the amount paid) and the bills it settled (the
//! month, the reading, the amounts). Only bill rows are kept; a payment is
//! read off the bills it paid. `PAY ADVANCE` rows say how much is paid ahead
//! and up to which month. The customer's name is in the page too, and is
//! never read.

use chrono::NaiveDate;
use sajilo_api::electricity::{
    BillAdjustment, ElectricityBill, ElectricityStatement, NeaAccount, NeaOffice,
};
use scraper::{ElementRef, Html, Selector};

use crate::error::{ProviderError, Result};
use crate::http::HttpClient;

pub const SOURCE_NAME: &str = "Nepal Electricity Authority";
pub const FORM_URL: &str = "https://neabilling.com/viewonline/";
pub const RESULT_URL: &str = "https://neabilling.com/viewonline/viewonlineresult/";
/// Two months of bills: the current one, last month's for comparison, and
/// any arrears between.
pub const LOOKBACK_DAYS: i64 = 75;

/// Every office the form offers.
pub async fn fetch_offices(client: &HttpClient) -> Result<Vec<NeaOffice>> {
    let body = client.get_text(SOURCE_NAME, FORM_URL).await?;
    parse_offices(&body)
}

pub fn parse_offices(body: &str) -> Result<Vec<NeaOffice>> {
    let document = Html::parse_document(body);
    let option = css("select[name=NEA_location] option");
    let offices: Vec<NeaOffice> = document
        .select(&option)
        .filter_map(|o| {
            let code = o.value().attr("value")?.trim().to_owned();
            let name = text(&o);
            (!code.is_empty() && !name.is_empty()).then_some(NeaOffice { code, name })
        })
        .collect();
    if offices.is_empty() {
        return Err(ProviderError::parse(SOURCE_NAME, "no offices in the form"));
    }
    Ok(offices)
}

/// The account's bills from `LOOKBACK_DAYS` before `today` to `today`.
pub async fn fetch_statement(
    client: &HttpClient,
    account: &NeaAccount,
    today: NaiveDate,
) -> Result<ElectricityStatement> {
    let from = today - chrono::Duration::days(LOOKBACK_DAYS);
    let format = |date: NaiveDate| date.format("%m/%d/%Y").to_string();
    let (from, to) = (format(from), format(today));
    let body = client
        .post_form_text(
            SOURCE_NAME,
            RESULT_URL,
            &[
                ("NEA_location", account.office_code.as_str()),
                ("sc_no", account.sc_no.trim()),
                ("consumer_id", account.consumer_id.trim()),
                ("Fromdatepicker", from.as_str()),
                ("Todatepicker", to.as_str()),
            ],
        )
        .await?;
    parse_statement(&body)
}

/// What the bill check answered. "No Records Found" (a wrong number, or an
/// account with nothing in the range) is its own error, so the screen can
/// say "check the numbers" rather than "NEA is down".
pub fn parse_statement(body: &str) -> Result<ElectricityStatement> {
    if body.contains("No Records Found") {
        return Err(ProviderError::parse(SOURCE_NAME, NO_RECORDS));
    }
    let document = Html::parse_document(body);
    let row = css("tr");
    let cell = css("td");

    let mut office = String::new();
    let mut bills = Vec::new();
    let mut advance = 0.0;
    let mut paid_upto = None;
    let mut saw_bill_table = false;

    for tr in document.select(&row) {
        let cells: Vec<String> = tr.select(&cell).map(|c| text(&c)).collect();
        // The consumer detail: label, value, label, value.
        if let Some(at) = cells.iter().position(|c| c == "NEA Location") {
            office = cells.get(at + 1).cloned().unwrap_or_default();
            continue;
        }
        // Bill rows: SNo | status | due bill of | bill date | units | amount |
        // rebate | rate | payable | paid amount | via | txn | paid date.
        if cells.len() < 13 || cells[0].parse::<u32>().is_err() {
            continue;
        }
        saw_bill_table = true;
        let status = cells[1].to_ascii_uppercase();
        let month = cells[2].clone();
        if status.contains("ADVANCE") {
            if month.eq_ignore_ascii_case("ADVANCE") {
                advance += -number(&cells[5]).unwrap_or(0.0);
            } else if let Some(upto) = month.strip_prefix("PAID UPTO ") {
                paid_upto = Some(upto.trim().to_owned());
            }
            continue;
        }
        // A bare payment row: no month. Its bills carry its date.
        if month.is_empty() {
            continue;
        }
        let Some(bill_date) = NaiveDate::parse_from_str(&cells[3], "%d-%b-%y").ok() else {
            continue;
        };
        let paid = status.contains("PAID") && !status.contains("UNPAID");
        bills.push(ElectricityBill {
            is_arrears: month.eq_ignore_ascii_case("ARREARS"),
            month,
            bill_date,
            units: cells[4].parse().unwrap_or(0),
            amount: number(&cells[5]).unwrap_or(0.0),
            adjustment: match cells[6].to_ascii_uppercase().as_str() {
                "REBATE" => BillAdjustment::Rebate,
                "PENALTY" => BillAdjustment::Penalty,
                _ => BillAdjustment::None,
            },
            adjustment_rate: number(&cells[7]).unwrap_or(0.0),
            payable: number(&cells[8]).unwrap_or(0.0),
            paid,
            paid_on: paid.then(|| paid_date(&cells[12])).flatten(),
            paid_via: paid
                .then(|| cells[10].trim().to_owned())
                .filter(|via| !via.is_empty()),
            bill_date_label: None,
            paid_on_label: None,
        });
    }
    if !saw_bill_table {
        return Err(ProviderError::parse(SOURCE_NAME, "no bill table"));
    }
    bills.sort_by_key(|bill| std::cmp::Reverse(bill.bill_date));
    Ok(ElectricityStatement {
        office,
        bills,
        advance: (advance * 100.0).round() / 100.0,
        paid_upto,
        due: None,
    })
}

/// What [`parse_statement`] says for an account NEA has nothing for.
pub const NO_RECORDS: &str = "no records for this account";

/// `10/13/2026 9:50:15 AM` → 2026-10-13.
fn paid_date(text: &str) -> Option<NaiveDate> {
    NaiveDate::parse_from_str(text.split_whitespace().next()?, "%m/%d/%Y").ok()
}

fn number(text: &str) -> Option<f64> {
    text.replace(',', "").trim().parse().ok()
}

fn css(selector: &str) -> Selector {
    Selector::parse(selector).expect("static selector")
}

fn text(element: &ElementRef<'_>) -> String {
    element
        .text()
        .collect::<String>()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

#[cfg(test)]
mod tests {
    use super::*;

    const FORM: &str = include_str!("../../../fixtures/nea/form.html");
    const BILLS: &str = include_str!("../../../fixtures/nea/bills.html");
    const NONE: &str = include_str!("../../../fixtures/nea/no-records.html");

    fn date(y: i32, m: u32, d: u32) -> NaiveDate {
        NaiveDate::from_ymd_opt(y, m, d).unwrap()
    }

    #[test]
    fn every_office_in_the_form() {
        let offices = parse_offices(FORM).unwrap();
        assert_eq!(offices.len(), 181);
        assert!(
            offices
                .iter()
                .any(|o| o.code == "205" && o.name == "KULESHOR")
        );
        assert!(offices.iter().all(|o| o.name != "SELECT..."));
    }

    #[test]
    fn a_statement_newest_first() {
        let statement = parse_statement(BILLS).unwrap();
        assert_eq!(statement.office, "KULESWORE DC");
        let months: Vec<&str> = statement
            .bills
            .iter()
            .filter(|b| !b.is_arrears)
            .map(|b| b.month.as_str())
            .collect();
        assert_eq!(
            months,
            [
                "Ashwin/2083",
                "Bhadra/2083",
                "Shrawan/2083",
                "Ashad/2083",
                "Jestha/2083"
            ]
        );
        assert_eq!(statement.bills.iter().filter(|b| b.is_arrears).count(), 3);
    }

    #[test]
    fn a_bill_paid_with_the_rebate() {
        let statement = parse_statement(BILLS).unwrap();
        let ashwin = &statement.bills[1];
        assert_eq!(ashwin.month, "Ashwin/2083");
        assert_eq!(ashwin.bill_date, date(2026, 10, 11));
        assert_eq!(ashwin.units, 267);
        assert!((ashwin.amount - 2611.0).abs() < 1e-9);
        assert!((ashwin.payable - 2559.0).abs() < 1e-9);
        assert_eq!(ashwin.adjustment, BillAdjustment::Rebate);
        assert!(ashwin.paid);
        assert_eq!(ashwin.paid_on, Some(date(2026, 10, 13)));
        assert_eq!(ashwin.paid_via.as_deref(), Some("ESEWA Company"));
    }

    #[test]
    fn a_bill_paid_late_with_a_penalty() {
        let statement = parse_statement(BILLS).unwrap();
        let shrawan = statement
            .bills
            .iter()
            .find(|b| b.month == "Shrawan/2083")
            .unwrap();
        assert_eq!(shrawan.adjustment, BillAdjustment::Penalty);
        assert!((shrawan.adjustment_rate - 5.0).abs() < 1e-9);
        assert!((shrawan.payable - 3263.0).abs() < 1e-9);
    }

    #[test]
    fn paid_ahead() {
        let statement = parse_statement(BILLS).unwrap();
        assert!((statement.advance - 0.97).abs() < 1e-9);
        assert_eq!(statement.paid_upto.as_deref(), Some("2083-06"));
    }

    #[test]
    fn the_customers_name_is_never_read() {
        let json = serde_json::to_string(&parse_statement(BILLS).unwrap()).unwrap();
        assert!(!json.contains("THAPA"));
    }

    #[test]
    fn nothing_found_is_its_own_answer() {
        let error = parse_statement(NONE).unwrap_err().to_string();
        assert!(error.contains(NO_RECORDS), "{error}");
    }

    #[test]
    fn an_unrelated_page_is_an_error() {
        assert!(parse_statement("<html><body>Maintenance</body></html>").is_err());
    }
}
