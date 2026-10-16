//! A BOID's IPO allotments and unclaimed dividends, asked of each share
//! registrar (RTS) that publishes a keyless lookup. There is no central one:
//! CDSC's result page is behind a CAPTCHA, so the registrars are asked
//! directly, each about the issues it ran.
//!
//! Two platforms cover most of them:
//!
//! - [`infodev`]: NMB, Sanima, Laxmi Sunrise and Citizens Capital, and
//!   Muktinath's variant of the same API.
//! - [`flowvity`]: Prabhu Capital and NIMB Ace Capital.
//!
//! Unclaimed dividends come from Global IME Capital and Sanima, the two that
//! answer for every company at once ([`dividends`]).
//!
//! An allotment never changes once published, so each issue is asked about
//! once and the answer kept in a [`Ledger`]; later scans ask only about
//! issues listed since. The first scan's finds are history, not news: only
//! what a later scan finds counts as new.

pub mod dividends;
pub mod flowvity;
pub mod infodev;

use std::collections::BTreeMap;

use chrono::{DateTime, NaiveDate, Utc};
use futures_util::future::join_all;
use sajilo_api::boid::{Allotment, BoidReport, Registrar, RegistrarCheck};
use serde::{Deserialize, Serialize};

use crate::http::HttpClient;

/// How many lookups run at once at one registrar: a first scan is a hundred
/// requests, and these are small companies' servers.
const AT_ONCE: usize = 4;

/// Every issue already asked about, and what was found.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Ledger {
    /// `registrar:issue` → the allotment, or `None` for "not allotted".
    pub checked: BTreeMap<String, Option<Allotment>>,
    /// Set once a scan has finished: finds after it are new.
    pub seeded: bool,
    /// When each allotment found after seeding was found, by id.
    pub found_at: BTreeMap<String, DateTime<Utc>>,
}

/// One issue a registrar lists: its own id, and its name.
#[derive(Debug, Clone, PartialEq)]
pub struct Issue {
    pub id: String,
    pub name: String,
}

/// Asks every registrar about the issues the ledger hasn't seen, adds the
/// answers to it, and reports everything known. A registrar that can't be
/// reached is marked so; its issues are asked about next time.
pub async fn scan(
    client: &HttpClient,
    boid: &str,
    ledger: &mut Ledger,
    now: DateTime<Utc>,
) -> BoidReport {
    let platforms = join_all(
        infodev::REGISTRARS
            .iter()
            .map(|&registrar| scan_registrar(client, boid, registrar, ledger)),
    );
    let flowvity = join_all(
        flowvity::REGISTRARS
            .iter()
            .map(|&registrar| scan_registrar(client, boid, registrar, ledger)),
    );
    let (platforms, flowvity, dividends) =
        tokio::join!(platforms, flowvity, dividends::fetch_all(client, boid));

    let mut registrars = Vec::new();
    for (registrar, outcome) in platforms.into_iter().chain(flowvity) {
        match outcome {
            Some((issues, answers)) => {
                for (key, answer) in answers {
                    if ledger.seeded
                        && let Some(found) = &answer
                    {
                        ledger.found_at.entry(found.id.clone()).or_insert(now);
                    }
                    ledger.checked.insert(key, answer);
                }
                registrars.push(RegistrarCheck {
                    registrar,
                    ok: true,
                    issues,
                });
            }
            None => registrars.push(RegistrarCheck {
                registrar,
                ok: false,
                issues: 0,
            }),
        }
    }
    ledger.seeded = true;

    let mut allotments: Vec<Allotment> = ledger.checked.values().flatten().cloned().collect();
    allotments.sort_by(|a, b| b.published_on.cmp(&a.published_on).then(a.id.cmp(&b.id)));
    let (dividends, dividend_checks) = dividends;
    for check in dividend_checks {
        if !registrars.iter().any(|r| r.registrar == check.registrar) {
            registrars.push(check);
        }
    }
    BoidReport {
        allotments,
        dividends,
        registrars,
    }
}

type Answers = Vec<(String, Option<Allotment>)>;

/// One registrar: its issues, and answers for the ones not yet asked about.
/// `None` when its list could not be had at all.
async fn scan_registrar(
    client: &HttpClient,
    boid: &str,
    registrar: Registrar,
    ledger: &Ledger,
) -> (Registrar, Option<(u32, Answers)>) {
    let issues = if flowvity::REGISTRARS.contains(&registrar) {
        flowvity::issues(client, registrar).await
    } else {
        infodev::issues(client, registrar).await
    };
    let Ok(issues) = issues else {
        return (registrar, None);
    };
    let count = u32::try_from(issues.len()).unwrap_or(u32::MAX);
    let unasked: Vec<&Issue> = issues
        .iter()
        .filter(|issue| !ledger.checked.contains_key(&key(registrar, &issue.id)))
        .collect();

    let mut answers = Vec::new();
    for chunk in unasked.chunks(AT_ONCE) {
        let results = join_all(chunk.iter().map(|issue| async move {
            let answer = if flowvity::REGISTRARS.contains(&registrar) {
                flowvity::allotment(client, registrar, issue, boid).await
            } else {
                infodev::allotment(client, registrar, issue, boid).await
            };
            (key(registrar, &issue.id), answer)
        }))
        .await;
        // An issue whose lookup failed stays unasked, to be tried again.
        answers.extend(
            results
                .into_iter()
                .filter_map(|(key, answer)| answer.ok().map(|answer| (key, answer))),
        );
    }
    (registrar, Some((count, answers)))
}

pub fn key(registrar: Registrar, issue: &str) -> String {
    let registrar = serde_json::to_value(registrar)
        .ok()
        .and_then(|value| value.as_str().map(str::to_owned))
        .unwrap_or_default();
    format!("{registrar}:{issue}")
}

/// `2023-12-27 07:44:50` or `2026-05-13T09:44:34.000000Z` → the date.
pub(crate) fn date_of(text: &str) -> Option<NaiveDate> {
    NaiveDate::parse_from_str(text.get(..10)?, "%Y-%m-%d").ok()
}

/// `10`, `"10"` or `"10.00"` → 10.
pub(crate) fn kitta(value: &serde_json::Value) -> Option<u32> {
    match value {
        serde_json::Value::Number(n) => n.as_f64().map(|f| f.round() as u32),
        serde_json::Value::String(s) => s.trim().parse::<f64>().ok().map(|f| f.round() as u32),
        _ => None,
    }
}

/// A 16-digit BOID, or `None`.
pub fn valid_boid(text: &str) -> Option<String> {
    let digits: String = text.chars().filter(char::is_ascii_digit).collect();
    (digits.len() == 16 && digits.starts_with("130")).then_some(digits)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn boids_as_people_type_them() {
        assert_eq!(
            valid_boid("1301 0000 0000 0001").as_deref(),
            Some("1301000000000001")
        );
        assert_eq!(valid_boid("13010000000000"), None);
        assert_eq!(valid_boid("9901000000000001"), None);
    }

    #[test]
    fn kitta_however_it_is_written() {
        assert_eq!(kitta(&serde_json::json!(10)), Some(10));
        assert_eq!(kitta(&serde_json::json!("10.00")), Some(10));
        assert_eq!(kitta(&serde_json::Value::Null), None);
    }
}
