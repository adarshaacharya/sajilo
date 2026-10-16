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

use chrono::{DateTime, Duration, NaiveDate, Utc};
use futures_util::future::join_all;
use sajilo_api::boid::{
    AccountSummary, Allotment, BoidAccount, BoidReport, HolderResult, IpoResult, Registrar,
    RegistrarCheck, UnclaimedDividend,
};
use serde::{Deserialize, Serialize};

use crate::http::HttpClient;

/// How long an allotment found after the first scan counts as new.
pub const NEW_FOR_DAYS: i64 = 14;

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

/// What one scan learned beyond the ledger: dividends change as they are
/// collected, so they are asked for every time, with how each registrar went.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct BoidScan {
    pub dividends: Vec<UnclaimedDividend>,
    pub registrars: Vec<RegistrarCheck>,
}

/// One issue a registrar lists: its own id, and its name.
#[derive(Debug, Clone, PartialEq)]
pub struct Issue {
    pub id: String,
    pub name: String,
}

/// Asks every registrar about the issues the ledger hasn't seen, adds the
/// answers to it, and reports the dividends and how each registrar went. A registrar that can't be
/// reached is marked so; its issues are asked about next time.
pub async fn scan(
    client: &HttpClient,
    boid: &str,
    ledger: &mut Ledger,
    now: DateTime<Utc>,
) -> BoidScan {
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

    let (dividends, dividend_checks) = dividends;
    for check in dividend_checks {
        if !registrars.iter().any(|r| r.registrar == check.registrar) {
            registrars.push(check);
        }
    }
    BoidScan {
        dividends,
        registrars,
    }
}

/// One account's part in a report: the account, everything its ledger knows,
/// and its last scan (`None` when it has never been scanned successfully).
pub struct AccountState<'a> {
    pub account: &'a BoidAccount,
    pub ledger: &'a Ledger,
    pub scan: Option<&'a BoidScan>,
}

/// Every account's answers together, by issue: each issue in which anyone
/// was allotted shares, with what each account got, newest first. Labels for
/// dates are the caller's to add.
pub fn report(accounts: &[AccountState<'_>], now: DateTime<Utc>) -> BoidReport {
    let is_new = |ledger: &Ledger, id: &str| {
        ledger
            .found_at
            .get(id)
            .is_some_and(|found| now - *found < Duration::days(NEW_FOR_DAYS))
    };

    let mut issues: BTreeMap<&str, &Allotment> = BTreeMap::new();
    for state in accounts {
        for allotment in state.ledger.checked.values().flatten() {
            issues.entry(&allotment.id).or_insert(allotment);
        }
    }
    let mut ipos: Vec<IpoResult> = issues
        .into_values()
        .map(|first| {
            let holders: Vec<HolderResult> = accounts
                .iter()
                .map(|state| {
                    let answer = state.ledger.checked.get(&first.id);
                    let found = answer.and_then(Option::as_ref);
                    HolderResult {
                        boid: state.account.boid.clone(),
                        name: state.account.name(),
                        allotted: found.map(|a| a.allotted),
                        applied: found.and_then(|a| a.applied),
                        checked: answer.is_some(),
                        is_new: found.is_some() && is_new(state.ledger, &first.id),
                    }
                })
                .collect();
            IpoResult {
                id: first.id.clone(),
                registrar: first.registrar,
                company: short_company(&first.company),
                published_on: first.published_on,
                published_label: None,
                is_new: holders.iter().any(|holder| holder.is_new),
                holders,
            }
        })
        .collect();
    ipos.sort_by(|a, b| {
        b.published_on
            .cmp(&a.published_on)
            .then_with(|| a.id.cmp(&b.id))
    });

    let mut dividends = Vec::new();
    let mut registrars: Vec<RegistrarCheck> = Vec::new();
    for state in accounts {
        let Some(scan) = state.scan else { continue };
        dividends.extend(scan.dividends.iter().map(|dividend| UnclaimedDividend {
            holder: state.account.name(),
            company: short_company(&dividend.company),
            ..dividend.clone()
        }));
        for check in &scan.registrars {
            match registrars
                .iter_mut()
                .find(|r| r.registrar == check.registrar)
            {
                Some(merged) => {
                    merged.ok &= check.ok;
                    merged.issues = merged.issues.max(check.issues);
                }
                None => registrars.push(check.clone()),
            }
        }
    }

    BoidReport {
        ipos,
        dividends,
        accounts: accounts
            .iter()
            .map(|state| AccountSummary {
                boid: state.account.boid.clone(),
                name: state.account.name(),
                allotments: u32::try_from(state.ledger.checked.values().flatten().count())
                    .unwrap_or(u32::MAX),
                ok: state.scan.is_some(),
            })
            .collect(),
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

/// An issue's name as people say it: `Yambling Hydropower Limited (YMHL)
/// (General Public)` → `Yambling Hydropower`. Registrars append the company
/// form, a ticker and who the shares were for; none of it helps tell issues
/// apart at a glance. Anything that would leave nothing is kept whole.
pub fn short_company(name: &str) -> String {
    let mut cut = name;
    if let Some(at) = cut.find('(') {
        cut = &cut[..at];
    }
    let words: Vec<&str> = cut.split_whitespace().collect();
    let end = words
        .iter()
        .position(|word| {
            let word = word.trim_end_matches(['-', '.', ',']).to_ascii_lowercase();
            word == "limited" || word == "ltd" || word.starts_with("limited-")
        })
        .unwrap_or(words.len());
    let short = words[..end]
        .join(" ")
        .trim_end_matches([' ', '-', ',', '.'])
        .to_owned();
    if short.is_empty() {
        name.trim().to_owned()
    } else {
        short
    }
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

    fn allotment(id: &str, kitta: u32, day: u32) -> Allotment {
        Allotment {
            id: id.into(),
            registrar: Registrar::NmbCapital,
            company: format!("Company {id}"),
            applied: Some(10),
            allotted: kitta,
            published_on: NaiveDate::from_ymd_opt(2026, 5, day),
        }
    }

    fn account(boid: &str, label: &str) -> BoidAccount {
        BoidAccount {
            boid: boid.into(),
            label: label.into(),
        }
    }

    #[test]
    fn a_family_by_issue() {
        let now = Utc::now();
        let me = account("1301000000000001", "Sita");
        let aama = account("1301000000000002", "");
        let mut mine = Ledger::default();
        mine.checked.insert(
            "nmbCapital:1".into(),
            Some(allotment("nmbCapital:1", 10, 1)),
        );
        mine.checked.insert("nmbCapital:2".into(), None);
        mine.found_at.insert("nmbCapital:1".into(), now);
        let mut hers = Ledger::default();
        hers.checked.insert(
            "nmbCapital:2".into(),
            Some(allotment("nmbCapital:2", 10, 9)),
        );
        hers.checked.insert("nmbCapital:1".into(), None);
        let scan = BoidScan {
            dividends: vec![UnclaimedDividend {
                registrar: Registrar::GlobalImeCapital,
                company: "Bank".into(),
                fiscal_year: None,
                amount: 100.0,
                kitta: None,
                holder: String::new(),
            }],
            registrars: vec![RegistrarCheck {
                registrar: Registrar::NmbCapital,
                ok: true,
                issues: 2,
            }],
        };
        let failed = BoidScan {
            dividends: Vec::new(),
            registrars: vec![RegistrarCheck {
                registrar: Registrar::NmbCapital,
                ok: false,
                issues: 0,
            }],
        };
        let report = report(
            &[
                AccountState {
                    account: &me,
                    ledger: &mine,
                    scan: Some(&scan),
                },
                AccountState {
                    account: &aama,
                    ledger: &hers,
                    scan: Some(&failed),
                },
            ],
            now,
        );

        // Newest first, every account in each.
        assert_eq!(report.ipos.len(), 2);
        assert_eq!(report.ipos[0].id, "nmbCapital:2");
        assert_eq!(report.ipos[0].company, "Company nmbCapital:2");
        let holders = &report.ipos[1].holders;
        assert_eq!(holders[0].name, "Sita");
        assert_eq!(holders[0].allotted, Some(10));
        assert!(holders[0].is_new && report.ipos[1].is_new);
        assert_eq!(holders[1].name, "BOID …0002");
        assert_eq!(holders[1].allotted, None);
        assert!(holders[1].checked);
        assert!(!report.ipos[0].is_new);

        assert_eq!(report.dividends[0].holder, "Sita");
        assert_eq!(report.accounts[1].allotments, 1);
        // A registrar is fine only if it was fine for everyone.
        assert!(!report.registrars[0].ok);
        assert_eq!(report.registrars[0].issues, 2);
    }

    #[test]
    fn not_asked_yet_is_not_not_allotted() {
        let me = account("1301000000000001", "Me");
        let new = account("1301000000000003", "Hari");
        let mut mine = Ledger::default();
        mine.checked.insert(
            "nmbCapital:1".into(),
            Some(allotment("nmbCapital:1", 10, 1)),
        );
        let empty = Ledger::default();
        let report = report(
            &[
                AccountState {
                    account: &me,
                    ledger: &mine,
                    scan: None,
                },
                AccountState {
                    account: &new,
                    ledger: &empty,
                    scan: None,
                },
            ],
            Utc::now(),
        );
        let hari = &report.ipos[0].holders[1];
        assert!(!hari.checked);
        assert_eq!(hari.allotted, None);
        assert!(!report.accounts[1].ok);
    }

    #[test]
    fn issue_names_as_people_say_them() {
        for (full, short) in [
            (
                "Yambling Hydropower Limited (YMHL) (General Public)",
                "Yambling Hydropower",
            ),
            (
                "Himalayan ReInsurance Limited - Public",
                "Himalayan ReInsurance",
            ),
            ("Kalanga Hydro Limited- General Public", "Kalanga Hydro"),
            (
                "Beni Hydropower Project Limited-Public",
                "Beni Hydropower Project",
            ),
            ("Global IME Bank Ltd.", "Global IME Bank"),
            ("Limited", "Limited"),
        ] {
            assert_eq!(short_company(full), short);
        }
    }

    #[test]
    fn kitta_however_it_is_written() {
        assert_eq!(kitta(&serde_json::json!(10)), Some(10));
        assert_eq!(kitta(&serde_json::json!("10.00")), Some(10));
        assert_eq!(kitta(&serde_json::Value::Null), None);
    }
}
