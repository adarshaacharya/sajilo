//! Unclaimed cash dividends, from the registrars that answer for every
//! company in one request: Global IME Capital (`company_id` 0, as its own
//! page sends) and Sanima. Dividends change as they're collected, so these
//! are asked every scan rather than kept in the ledger.

use futures_util::future::join;
use sajilo_api::boid::{Registrar, RegistrarCheck, UnclaimedDividend};
use serde_json::{Value, json};

use crate::error::{ProviderError, Result};
use crate::http::HttpClient;

pub const SOURCE_NAME: &str = "Share registrar";
const GLOBAL_IME_URL: &str =
    "https://globalimecapital.com/api/v1/public/uncollected-cash-dividend-check";

pub async fn fetch_all(
    client: &HttpClient,
    boid: &str,
) -> (Vec<UnclaimedDividend>, Vec<RegistrarCheck>) {
    let (global_ime, sanima) = join(
        global_ime(client, boid),
        super::infodev::sanima_dividends(client, boid),
    )
    .await;
    let mut dividends = Vec::new();
    let mut checks = Vec::new();
    for (registrar, result) in [
        (Registrar::GlobalImeCapital, global_ime),
        (Registrar::SanimaCapital, sanima),
    ] {
        let ok = result.is_ok();
        dividends.extend(result.unwrap_or_default());
        checks.push(RegistrarCheck {
            registrar,
            ok,
            issues: 0,
        });
    }
    (dividends, checks)
}

async fn global_ime(client: &HttpClient, boid: &str) -> Result<Vec<UnclaimedDividend>> {
    let (status, body) = client
        .post_json_any_status(
            SOURCE_NAME,
            GLOBAL_IME_URL,
            &json!({ "company_id": 0, "boid": boid }),
        )
        .await?;
    if status != 200 {
        return Err(ProviderError::Status {
            source_name: SOURCE_NAME,
            status,
        });
    }
    parse_global_ime(&body)
}

/// Rows carry `company_name`, `total_kitta`, `net_div_amt` (after tax) and
/// `fiscal_year`; none is `data: []` with a "did not match" message.
pub fn parse_global_ime(body: &str) -> Result<Vec<UnclaimedDividend>> {
    let value: Value =
        serde_json::from_str(body).map_err(|e| ProviderError::parse(SOURCE_NAME, e.to_string()))?;
    let rows = value["data"]
        .as_array()
        .ok_or_else(|| ProviderError::parse(SOURCE_NAME, "no dividend list"))?;
    Ok(rows
        .iter()
        .filter_map(|row| {
            let amount = number(&row["net_div_amt"]).or_else(|| number(&row["dividend_amt"]))?;
            Some(UnclaimedDividend {
                registrar: Registrar::GlobalImeCapital,
                company: row["company_name"].as_str()?.trim().to_owned(),
                fiscal_year: row["fiscal_year"].as_str().map(str::to_owned),
                amount,
                kitta: super::kitta(&row["total_kitta"]),
                holder: String::new(),
            })
        })
        .collect())
}

fn number(value: &Value) -> Option<f64> {
    match value {
        Value::Number(n) => n.as_f64(),
        Value::String(s) => s.replace(',', "").trim().parse().ok(),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn nothing_unclaimed_at_global_ime() {
        let body = include_str!("../../../../fixtures/rts/gic-dividend-none.json");
        assert!(parse_global_ime(body).unwrap().is_empty());
    }
}
