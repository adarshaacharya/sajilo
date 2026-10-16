//! The registrar platform behind NMB, Sanima, Laxmi Sunrise, Citizens and
//! Muktinath Capital: JSON under `/frontapi/en/`.
//!
//! An issue list, then one lookup per issue. Not allotted is an HTTP 500
//! saying "No query results for model [...Allotment]" — an answer, not a
//! failure. Muktinath runs a variant at `ipo-allotment`, answering 200 with
//! `allotted: false` instead.

use sajilo_api::boid::{Allotment, Registrar};
use serde_json::Value;

use super::{Issue, date_of, kitta};
use crate::error::{ProviderError, Result};
use crate::http::HttpClient;

pub const SOURCE_NAME: &str = "Share registrar";

pub const REGISTRARS: [Registrar; 5] = [
    Registrar::NmbCapital,
    Registrar::SanimaCapital,
    Registrar::LaxmiSunriseCapital,
    Registrar::CitizensCapital,
    Registrar::MuktinathCapital,
];

const HEADERS: [(&str, &str); 2] = [
    ("X-Requested-With", "XMLHttpRequest"),
    ("Accept", "application/json"),
];

pub fn base(registrar: Registrar) -> &'static str {
    match registrar {
        Registrar::NmbCapital => "https://nmbcl.com.np",
        Registrar::SanimaCapital => "https://sanima.capital",
        Registrar::LaxmiSunriseCapital => "https://lscapital.com.np",
        Registrar::CitizensCapital => "https://citizenscapital.com.np",
        _ => "https://muktinathcapital.com",
    }
}

/// Muktinath names the same thing differently.
fn path(registrar: Registrar) -> &'static str {
    if registrar == Registrar::MuktinathCapital {
        "ipo-allotment"
    } else {
        "ipo"
    }
}

pub async fn issues(client: &HttpClient, registrar: Registrar) -> Result<Vec<Issue>> {
    let url = format!("{}/frontapi/en/{}", base(registrar), path(registrar));
    let body = client
        .get_text_with_headers(SOURCE_NAME, &url, &HEADERS)
        .await?;
    parse_issues(&body)
}

pub fn parse_issues(body: &str) -> Result<Vec<Issue>> {
    let value: Value =
        serde_json::from_str(body).map_err(|e| ProviderError::parse(SOURCE_NAME, e.to_string()))?;
    let list = value
        .as_array()
        .or_else(|| value["data"].as_array())
        .ok_or_else(|| ProviderError::parse(SOURCE_NAME, "no issue list"))?;
    Ok(list
        .iter()
        .filter_map(|issue| {
            Some(Issue {
                id: issue["id"].as_u64()?.to_string(),
                name: issue["name"]
                    .as_str()?
                    .split_whitespace()
                    .collect::<Vec<_>>()
                    .join(" "),
            })
        })
        .collect())
}

pub async fn allotment(
    client: &HttpClient,
    registrar: Registrar,
    issue: &Issue,
    boid: &str,
) -> Result<Option<Allotment>> {
    let url = format!(
        "{}/frontapi/en/{}/filter?companyId={}&boidNumber={boid}",
        base(registrar),
        path(registrar),
        issue.id
    );
    let (status, body) = client.get_any_status(SOURCE_NAME, &url, &HEADERS).await?;
    parse_allotment(status, &body, registrar, issue)
}

/// One lookup's answer: `Some` allotted, `None` not.
pub fn parse_allotment(
    status: u16,
    body: &str,
    registrar: Registrar,
    issue: &Issue,
) -> Result<Option<Allotment>> {
    let value: Value =
        serde_json::from_str(body).map_err(|e| ProviderError::parse(SOURCE_NAME, e.to_string()))?;
    let message = value["message"].as_str().unwrap_or_default();
    if status == 500 && message.starts_with("No query results") {
        return Ok(None);
    }
    if status != 200 {
        return Err(ProviderError::Status {
            source_name: SOURCE_NAME,
            status,
        });
    }
    // The usual platform puts it under `allotments`, Muktinath under
    // `allotment_detail` behind an `allotted` flag.
    let data = &value["data"];
    if data["allotted"] == Value::Bool(false) {
        return Ok(None);
    }
    let row = if data["allotments"].is_object() {
        &data["allotments"]
    } else if data["allotment_detail"].is_object() {
        &data["allotment_detail"]
    } else {
        return Ok(None);
    };
    let Some(allotted) = kitta(&row["alloted_kitta"]).filter(|n| *n > 0) else {
        return Ok(None);
    };
    Ok(Some(Allotment {
        id: super::key(registrar, &issue.id),
        registrar,
        company: issue.name.clone(),
        applied: kitta(&row["applied_kitta"]),
        allotted,
        published_on: row["created_at"].as_str().and_then(date_of),
    }))
}

/// Sanima also answers unclaimed cash dividends for every company at once.
pub async fn sanima_dividends(
    client: &HttpClient,
    boid: &str,
) -> Result<Vec<sajilo_api::boid::UnclaimedDividend>> {
    let url = format!(
        "{}/frontapi/en/pending-cash-dividend/filter?companyId=0&boidNumber={boid}",
        base(Registrar::SanimaCapital)
    );
    let (status, body) = client.get_any_status(SOURCE_NAME, &url, &HEADERS).await?;
    if status != 200 {
        return Err(ProviderError::Status {
            source_name: SOURCE_NAME,
            status,
        });
    }
    parse_sanima_dividends(&body)
}

pub fn parse_sanima_dividends(body: &str) -> Result<Vec<sajilo_api::boid::UnclaimedDividend>> {
    let value: Value =
        serde_json::from_str(body).map_err(|e| ProviderError::parse(SOURCE_NAME, e.to_string()))?;
    let rows = value["data"]["allotments"]
        .as_array()
        .ok_or_else(|| ProviderError::parse(SOURCE_NAME, "no dividend list"))?;
    Ok(rows
        .iter()
        .filter_map(|row| {
            Some(sajilo_api::boid::UnclaimedDividend {
                registrar: Registrar::SanimaCapital,
                company: row["company_name"].as_str()?.trim().to_owned(),
                fiscal_year: row["fiscal_year"].as_str().map(str::to_owned),
                amount: super::kitta(&row["div_amount"])
                    .map_or_else(|| row["div_amount"].as_f64().unwrap_or(0.0), f64::from),
                kitta: kitta(&row["total_kitta"]),
                holder: String::new(),
            })
        })
        .collect())
}

#[cfg(test)]
mod tests {
    use super::*;

    const LIST: &str = include_str!("../../../../fixtures/rts/infodev-ipo-list.json");
    const FOUND: &str = include_str!("../../../../fixtures/rts/infodev-ipo-found.json");
    const FOUND_NO_APPLIED: &str =
        include_str!("../../../../fixtures/rts/infodev-ipo-found-no-applied.json");
    const NONE: &str = include_str!("../../../../fixtures/rts/infodev-ipo-none.json");
    const MUKTINATH_LIST: &str = include_str!("../../../../fixtures/rts/muktinath-ipo-list.json");
    const MUKTINATH_FOUND: &str = include_str!("../../../../fixtures/rts/muktinath-ipo-found.json");
    const MUKTINATH_NONE: &str = include_str!("../../../../fixtures/rts/muktinath-ipo-none.json");
    const SANIMA_DIVIDENDS: &str =
        include_str!("../../../../fixtures/rts/sanima-dividend-none.json");

    fn issue(id: &str, name: &str) -> Issue {
        Issue {
            id: id.into(),
            name: name.into(),
        }
    }

    #[test]
    fn the_issue_list_newest_first() {
        let issues = parse_issues(LIST).unwrap();
        assert_eq!(issues.len(), 27);
        assert_eq!(issues[0].id, "41");
        assert_eq!(issues[0].name, "Beni Hydropower Project Limited-Public");
        assert_eq!(parse_issues(MUKTINATH_LIST).unwrap().len(), 6);
    }

    #[test]
    fn allotted() {
        let it = issue("28", "Himalayan ReInsurance Limited - Public");
        let found = parse_allotment(200, FOUND, Registrar::NmbCapital, &it)
            .unwrap()
            .expect("allotted");
        assert_eq!(found.allotted, 10);
        assert_eq!(found.applied, Some(10));
        assert_eq!(found.id, "nmbCapital:28");
        assert_eq!(
            found.published_on,
            chrono::NaiveDate::from_ymd_opt(2023, 12, 27)
        );
    }

    #[test]
    fn allotted_without_the_applied_count() {
        let it = issue("56", "Kalanga Hydro Limited- General Public");
        let found = parse_allotment(200, FOUND_NO_APPLIED, Registrar::SanimaCapital, &it)
            .unwrap()
            .unwrap();
        assert_eq!(found.applied, None);
        assert_eq!(found.allotted, 10);
    }

    #[test]
    fn not_allotted_is_a_500_that_is_an_answer() {
        let it = issue("41", "x");
        assert_eq!(
            parse_allotment(500, NONE, Registrar::NmbCapital, &it).unwrap(),
            None
        );
        // Any other 500 is a failure, to be asked again.
        assert!(
            parse_allotment(
                500,
                r#"{"message":"Server Error"}"#,
                Registrar::NmbCapital,
                &it
            )
            .is_err()
        );
    }

    #[test]
    fn muktinaths_variant() {
        let it = issue("45", "Yambling Hydropower Limited (YMHL) (General Public)");
        let found = parse_allotment(200, MUKTINATH_FOUND, Registrar::MuktinathCapital, &it)
            .unwrap()
            .unwrap();
        assert_eq!(found.allotted, 10);
        assert_eq!(found.applied, Some(10));
        assert_eq!(
            parse_allotment(200, MUKTINATH_NONE, Registrar::MuktinathCapital, &it).unwrap(),
            None
        );
    }

    #[test]
    fn no_unclaimed_dividends_at_sanima() {
        assert!(parse_sanima_dividends(SANIMA_DIVIDENDS).unwrap().is_empty());
    }

    #[test]
    fn the_holders_name_is_never_read() {
        let it = issue("28", "x");
        let found = parse_allotment(200, FOUND, Registrar::NmbCapital, &it).unwrap();
        assert!(!serde_json::to_string(&found).unwrap().contains("THAPA"));
    }
}
