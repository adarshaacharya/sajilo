//! WorldLink: the customer lookup its payment site makes before a renewal,
//! `epayment.worldlink.com.np/new/api/customers/{username}`. Keyless; the
//! site's CAPTCHA guards paying, not this. The answer carries the customer's
//! full name, which is never read.

use chrono::{Duration, NaiveDate};
use sajilo_api::internet::{InternetStatus, WorldLinkAccount};
use serde::Deserialize;

use crate::error::{ProviderError, Result};
use crate::http::HttpClient;

pub const SOURCE_NAME: &str = "WorldLink";
pub const LOOKUP_URL: &str = "https://epayment.worldlink.com.np/new/api/customers/";
/// What [`parse`] says for a username WorldLink does not know.
pub const NOT_FOUND: &str = "no customer with this username";

pub async fn fetch(
    client: &HttpClient,
    account: &WorldLinkAccount,
    today: NaiveDate,
) -> Result<InternetStatus> {
    let username: String = account
        .username
        .trim()
        .chars()
        .filter(|c| c.is_ascii_alphanumeric() || matches!(c, '_' | '.' | '-' | '@'))
        .collect();
    if username.is_empty() {
        return Err(ProviderError::parse(SOURCE_NAME, NOT_FOUND));
    }
    let url = format!("{LOOKUP_URL}{username}?gateway=khalti");
    match client
        .get_text_with_headers(SOURCE_NAME, &url, &[("Accept", "application/json")])
        .await
    {
        Ok(body) => parse(&body, today),
        // WorldLink answers an unknown username with 400 and a message.
        Err(ProviderError::Status { status: 400, .. }) => {
            Err(ProviderError::parse(SOURCE_NAME, NOT_FOUND))
        }
        Err(error) => Err(error),
    }
}

/// The lookup's answer, read on `today`.
pub fn parse(body: &str, today: NaiveDate) -> Result<InternetStatus> {
    let wire: Wire =
        serde_json::from_str(body).map_err(|e| ProviderError::parse(SOURCE_NAME, e.to_string()))?;
    if wire.subscribed_package_name.is_none()
        && wire.message.as_deref() == Some("Customer not found.")
    {
        return Err(ProviderError::parse(SOURCE_NAME, NOT_FOUND));
    }
    let days: i64 = match &wire.days_remaining {
        Some(Days::Number(n)) => *n,
        Some(Days::Text(text)) => text.trim().parse().unwrap_or(0),
        None => return Err(ProviderError::parse(SOURCE_NAME, "no days remaining")),
    };
    Ok(InternetStatus {
        package: wire
            .subscribed_package_name
            .or_else(|| wire.current_plan.as_ref().map(|p| p.package_name.clone()))
            .unwrap_or_default(),
        expires_on: today + Duration::days(days.max(0)),
        disabled: wire.account_disabled.unwrap_or(false),
        renewal_rate: wire.current_plan.map(|plan| plan.package_rate),
        amount_due: wire.amount.unwrap_or(0.0),
        branch: wire.branch.unwrap_or_default(),
        days_left: None,
        expires_label: None,
    })
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Wire {
    #[serde(default)]
    message: Option<String>,
    #[serde(default)]
    subscribed_package_name: Option<String>,
    #[serde(default)]
    account_disabled: Option<bool>,
    #[serde(default)]
    days_remaining: Option<Days>,
    #[serde(default)]
    amount: Option<f64>,
    #[serde(default)]
    branch: Option<String>,
    #[serde(default)]
    current_plan: Option<Plan>,
}

/// WorldLink sends the days as a string today; a number is read too.
#[derive(Deserialize)]
#[serde(untagged)]
enum Days {
    Number(i64),
    Text(String),
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Plan {
    package_name: String,
    package_rate: f64,
}

#[cfg(test)]
mod tests {
    use super::*;

    const CUSTOMER: &str = include_str!("../../../fixtures/worldlink/customer.json");
    const NOT_FOUND_BODY: &str = include_str!("../../../fixtures/worldlink/not-found.json");

    #[test]
    fn a_subscription_with_its_expiry() {
        let today = NaiveDate::from_ymd_opt(2026, 10, 15).unwrap();
        let status = parse(CUSTOMER, today).unwrap();
        assert_eq!(status.package, "6G 400Mbps/12mths with 1TV");
        assert_eq!(
            status.expires_on,
            NaiveDate::from_ymd_opt(2027, 2, 9).unwrap()
        );
        assert!(!status.disabled);
        assert_eq!(status.renewal_rate, Some(18080.0));
        assert!(status.amount_due.abs() < 1e-9);
        assert_eq!(status.branch, "KALIMATI");
    }

    #[test]
    fn the_name_is_never_read() {
        let today = NaiveDate::from_ymd_opt(2026, 10, 15).unwrap();
        let json = serde_json::to_string(&parse(CUSTOMER, today).unwrap()).unwrap();
        assert!(!json.contains("Thapa"));
    }

    #[test]
    fn an_unknown_username() {
        let today = NaiveDate::from_ymd_opt(2026, 10, 15).unwrap();
        let error = parse(NOT_FOUND_BODY, today).unwrap_err().to_string();
        assert!(error.contains(NOT_FOUND), "{error}");
    }
}
