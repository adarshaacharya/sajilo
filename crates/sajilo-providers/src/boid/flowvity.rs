//! The registrar platform behind Prabhu Capital and NIMB Ace Capital: plain
//! GETs under `/adminapi/v1/public/`. An issue is named by its company code;
//! not allotted is an empty `allotmentList`. Some of its issues hang, so a
//! lookup that times out is simply asked again next time.

use sajilo_api::boid::{Allotment, Registrar};
use serde_json::Value;

use super::{Issue, kitta};
use crate::error::{ProviderError, Result};
use crate::http::HttpClient;

pub const SOURCE_NAME: &str = "Share registrar";

pub const REGISTRARS: [Registrar; 2] = [Registrar::PrabhuCapital, Registrar::NimbAceCapital];

pub fn base(registrar: Registrar) -> &'static str {
    if registrar == Registrar::NimbAceCapital {
        "https://flowvity.nimbacecapital.com/adminapi/v1/public"
    } else {
        "https://www.prabhucapital.com/adminapi/v1/public"
    }
}

pub async fn issues(client: &HttpClient, registrar: Registrar) -> Result<Vec<Issue>> {
    let url = format!("{}/ipo-allotment-company", base(registrar));
    let body = client.get_text(SOURCE_NAME, &url).await?;
    parse_issues(&body)
}

pub fn parse_issues(body: &str) -> Result<Vec<Issue>> {
    let value: Value =
        serde_json::from_str(body).map_err(|e| ProviderError::parse(SOURCE_NAME, e.to_string()))?;
    let list = value["data"]["companyList"]
        .as_array()
        .ok_or_else(|| ProviderError::parse(SOURCE_NAME, "no company list"))?;
    Ok(list
        .iter()
        .filter_map(|company| {
            let code = company["companyCode"].as_str()?.to_owned();
            Some(Issue {
                name: code.split_whitespace().collect::<Vec<_>>().join(" "),
                id: code,
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
    let code: String = issue
        .id
        .bytes()
        .map(|b| match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' => (b as char).to_string(),
            b => format!("%{b:02X}"),
        })
        .collect();
    let url = format!(
        "{}/ipo-allotment?boid={boid}&companyCode={code}",
        base(registrar)
    );
    let body = client.get_text(SOURCE_NAME, &url).await?;
    parse_allotment(&body, registrar, issue)
}

/// `allotmentList` rows carry `boid` and `qty`; empty is not allotted.
pub fn parse_allotment(
    body: &str,
    registrar: Registrar,
    issue: &Issue,
) -> Result<Option<Allotment>> {
    let value: Value =
        serde_json::from_str(body).map_err(|e| ProviderError::parse(SOURCE_NAME, e.to_string()))?;
    let list = value["data"]["allotmentList"]
        .as_array()
        .ok_or_else(|| ProviderError::parse(SOURCE_NAME, "no allotment list"))?;
    let allotted: u32 = list.iter().filter_map(|row| kitta(&row["qty"])).sum();
    Ok((allotted > 0).then(|| Allotment {
        id: super::key(registrar, &issue.id),
        registrar,
        company: issue.name.clone(),
        applied: None,
        allotted,
        published_on: None,
        is_new: false,
        published_label: None,
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    const COMPANIES: &str = include_str!("../../../../fixtures/rts/flowvity-ipo-companies.json");
    const NONE: &str = include_str!("../../../../fixtures/rts/flowvity-ipo-none.json");

    #[test]
    fn the_issue_list() {
        let issues = parse_issues(COMPANIES).unwrap();
        assert_eq!(issues.len(), 48);
        assert!(issues.iter().all(|issue| !issue.id.is_empty()));
    }

    #[test]
    fn not_allotted_is_an_empty_list() {
        let issue = Issue {
            id: "x".into(),
            name: "x".into(),
        };
        assert_eq!(
            parse_allotment(NONE, Registrar::PrabhuCapital, &issue).unwrap(),
            None
        );
    }
}
