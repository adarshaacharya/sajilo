//! Lok Sewa Aayog (the Public Service Commission): every office's
//! advertisements, from the JSON its own website is built on.
//!
//! The site is a Vue app over a small API at `/front`. Three calls give the
//! whole picture: `header` lists the fiscal years, `branch` the 15 offices,
//! and `branch-details/advertisement` one office's posts for one fiscal year,
//! each with its deadlines and application count.
//!
//! Two quirks of that API, both found the hard way:
//!
//! - Pages are numbered from 0. The website's own client asks for page 1
//!   first, which is why the site never shows an office's first few posts.
//! - A `per_page` of 50 or more answers an empty page, so pages stay small.

use futures_util::future::join_all;
use sajilo_api::jobs::{JobDetailPart, JobSource, JobVacancy};
use serde::Deserialize;

use super::parse_bs_date;
use crate::error::{ProviderError, Result};
use crate::http::HttpClient;

pub const SOURCE_NAME: &str = "Lok Sewa Aayog";
pub const API_ROOT: &str = "https://psc.gov.np/front";
pub const LISTING_URL: &str = "https://psc.gov.np/category/advertisement/all";

/// Small enough that the API answers it; see the module note.
const PAGE_SIZE: u32 = 20;
/// A runaway total must not turn into hundreds of requests.
const MAX_PAGES: u32 = 10;
/// The current fiscal year and the one before: posts advertised in Asar are
/// often still open in Shrawan.
const FISCAL_YEARS: usize = 2;

/// The API answers its own page's script with JSON, and a plain request with
/// the page's HTML shell.
const HEADERS: [(&str, &str); 2] = [
    ("X-Requested-With", "XMLHttpRequest"),
    ("Accept", "application/json"),
];

pub async fn fetch(client: &HttpClient) -> Result<Vec<JobVacancy>> {
    let header = client
        .get_text_with_headers(SOURCE_NAME, &format!("{API_ROOT}/header"), &HEADERS)
        .await?;
    let years = parse_fiscal_years(&header)?;
    let branches = client
        .get_text_with_headers(SOURCE_NAME, &format!("{API_ROOT}/branch"), &HEADERS)
        .await?;
    let branches = parse_branches(&branches)?;

    let pairs: Vec<(u32, u32)> = years
        .iter()
        .take(FISCAL_YEARS)
        .flat_map(|&year| branches.iter().map(move |&branch| (branch, year)))
        .collect();
    let results = join_all(
        pairs
            .iter()
            .map(|&(branch, year)| fetch_office(client, branch, year)),
    )
    .await;

    // One office failing is not the whole commission failing; all of them
    // failing is, so that is an error rather than an empty list.
    let mut vacancies = Vec::new();
    let mut first_error = None;
    let mut any_ok = false;
    for result in results {
        match result {
            Ok(mut found) => {
                any_ok = true;
                vacancies.append(&mut found);
            }
            Err(error) => {
                first_error.get_or_insert(error);
            }
        }
    }
    if !any_ok && let Some(error) = first_error {
        return Err(error);
    }
    Ok(finish(vacancies))
}

async fn fetch_office(client: &HttpClient, branch: u32, year: u32) -> Result<Vec<JobVacancy>> {
    let mut vacancies = Vec::new();
    let mut page = 0;
    loop {
        let url = format!(
            "{API_ROOT}/branch-details/advertisement?branch_id={branch}&fiscal_year_id={year}&per_page={PAGE_SIZE}&current_page={page}"
        );
        let body = client
            .get_text_with_headers(SOURCE_NAME, &url, &HEADERS)
            .await?;
        let parsed = parse_advertisements(&body)?;
        vacancies.extend(parsed.vacancies);
        page += 1;
        if page >= parsed.total_pages.min(MAX_PAGES) {
            return Ok(vacancies);
        }
    }
}

/// The services and quotas one advertisement covers. Asked for only when a
/// vacancy is opened: once per advertisement would be hundreds of requests a
/// refresh. Empty when the commission has not filled it in.
pub async fn fetch_detail(client: &HttpClient, code: &str) -> Result<Vec<JobDetailPart>> {
    let url = format!("{API_ROOT}/branch-details/advertisement-detail?advertisementCode={code}");
    let body = client
        .get_text_with_headers(SOURCE_NAME, &url, &HEADERS)
        .await?;
    parse_detail(&body)
}

pub fn parse_detail(body: &str) -> Result<Vec<JobDetailPart>> {
    let detail: WireDetail = decode(body)?;
    Ok(detail
        .data
        .into_iter()
        .filter_map(|part| {
            Some(JobDetailPart {
                service: tidy(&part.service_name)?,
                open_type: tidy(&part.open_type_name).unwrap_or_default(),
                openings: part.vac_number.unwrap_or(0),
            })
        })
        .collect())
}

/// Fiscal-year ids, newest first.
pub fn parse_fiscal_years(body: &str) -> Result<Vec<u32>> {
    let header: Wire<WireHeader> = decode(body)?;
    let mut years = header.data.fiscalyear;
    years.sort_by(|a, b| b.start_from.cmp(&a.start_from));
    if years.is_empty() {
        return Err(ProviderError::parse(SOURCE_NAME, "no fiscal years"));
    }
    Ok(years.into_iter().map(|year| year.id).collect())
}

/// Office ids.
pub fn parse_branches(body: &str) -> Result<Vec<u32>> {
    let branches: Wire<WireBranches> = decode(body)?;
    if branches.data.branch.is_empty() {
        return Err(ProviderError::parse(SOURCE_NAME, "no offices"));
    }
    Ok(branches.data.branch.into_iter().map(|b| b.id).collect())
}

pub struct AdvertisementPage {
    pub vacancies: Vec<JobVacancy>,
    pub total_pages: u32,
}

pub fn parse_advertisements(body: &str) -> Result<AdvertisementPage> {
    let page: Wire<WirePageEnvelope> = decode(body)?;
    let page = page.data.data;
    let vacancies = page
        .content
        .into_iter()
        .filter_map(|ad| {
            let post = tidy(&ad.post)?;
            let code = tidy(&ad.advertisement_code)?;
            Some(JobVacancy {
                id: format!("{}:{code}", JobSource::Psc.key()),
                source: JobSource::Psc,
                title: post,
                office: tidy(&ad.organization_name),
                level: tidy(&ad.class_name),
                openings: ad.total_openings.filter(|n| *n > 0),
                advertisement_code: Some(code),
                deadline: ad
                    .single_payment_last_date
                    .as_deref()
                    .and_then(parse_bs_date),
                double_fee_deadline: ad
                    .double_payment_last_date
                    .as_deref()
                    .and_then(parse_bs_date),
                published_on: None,
                applicants: ad.paid_applications,
                url: LISTING_URL.to_owned(),
                days_left: None,
                is_new: false,
                reminded: false,
                deadline_label: None,
                double_fee_deadline_label: None,
                published_label: None,
                published_days_ago: None,
            })
        })
        .collect();
    Ok(AdvertisementPage {
        vacancies,
        total_pages: page.total_pages,
    })
}

/// Latest deadline first, and one row per advertisement: the same code can
/// come back from two fiscal years' lists.
pub fn finish(mut vacancies: Vec<JobVacancy>) -> Vec<JobVacancy> {
    vacancies.sort_by(|a, b| {
        let last = |v: &JobVacancy| v.double_fee_deadline.or(v.deadline);
        last(b).cmp(&last(a)).then_with(|| a.id.cmp(&b.id))
    });
    vacancies.dedup_by(|a, b| a.id == b.id);
    vacancies
}

/// Collapses the double spaces the commission's data is full of
/// (`उपसचिव  वा सो सरह`). `None` for blank.
fn tidy(text: &str) -> Option<String> {
    let text = text.split_whitespace().collect::<Vec<_>>().join(" ");
    (!text.is_empty()).then_some(text)
}

fn decode<T: for<'de> Deserialize<'de>>(body: &str) -> Result<T> {
    serde_json::from_str(body).map_err(|error| ProviderError::parse(SOURCE_NAME, error.to_string()))
}

#[derive(Deserialize)]
struct Wire<T> {
    data: T,
}

#[derive(Deserialize)]
struct WireDetail {
    #[serde(default)]
    data: Vec<WireDetailPart>,
}

#[derive(Deserialize)]
struct WireDetailPart {
    #[serde(default)]
    service_name: String,
    #[serde(default)]
    open_type_name: String,
    #[serde(default)]
    vac_number: Option<u32>,
}

#[derive(Deserialize)]
struct WireHeader {
    fiscalyear: Vec<WireFiscalYear>,
}

#[derive(Deserialize)]
struct WireFiscalYear {
    id: u32,
    start_from: String,
}

#[derive(Deserialize)]
struct WireBranches {
    branch: Vec<WireBranch>,
}

#[derive(Deserialize)]
struct WireBranch {
    id: u32,
}

#[derive(Deserialize)]
struct WirePageEnvelope {
    data: WirePage,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct WirePage {
    #[serde(default)]
    total_pages: u32,
    #[serde(default)]
    content: Vec<WireAdvertisement>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct WireAdvertisement {
    #[serde(default)]
    organization_name: String,
    #[serde(default)]
    class_name: String,
    #[serde(default)]
    post: String,
    #[serde(default)]
    total_openings: Option<u32>,
    #[serde(default)]
    advertisement_code: String,
    #[serde(default)]
    single_payment_last_date: Option<String>,
    #[serde(default)]
    double_payment_last_date: Option<String>,
    #[serde(default)]
    paid_applications: Option<u32>,
}

#[cfg(test)]
mod tests {
    use super::*;
    use sajilo_core::NepaliDate;

    const HEADER: &str = include_str!("../../../../fixtures/psc/header.json");
    const BRANCH: &str = include_str!("../../../../fixtures/psc/branch.json");
    const CENTRAL_0: &str = include_str!("../../../../fixtures/psc/advertisement-1-0.json");
    const CENTRAL_1: &str = include_str!("../../../../fixtures/psc/advertisement-1-1.json");
    const POKHARA_EMPTY: &str = include_str!("../../../../fixtures/psc/advertisement-4-0.json");
    const POKHARA_2082: &str = include_str!("../../../../fixtures/psc/advertisement-4-0-2082.json");

    #[test]
    fn an_advertisement_open_and_internal_side_by_side() {
        let parts = parse_detail(include_str!(
            "../../../../fixtures/psc/advertisement-detail-17152.json"
        ))
        .unwrap();
        assert_eq!(parts.len(), 2);
        assert!(parts.iter().all(|p| p.service == "नेपाल इञ्जिनियरिङग्"));
        assert!(
            parts
                .iter()
                .any(|p| p.open_type == "खुला" && p.openings == 1)
        );
        assert!(parts.iter().any(|p| p.open_type == "आन्तरिक"));
    }

    #[test]
    fn a_detail_not_filled_in() {
        let parts = parse_detail(include_str!(
            "../../../../fixtures/psc/advertisement-detail-empty.json"
        ))
        .unwrap();
        assert!(parts.is_empty());
    }

    #[test]
    fn fiscal_years_newest_first() {
        let years = parse_fiscal_years(HEADER).unwrap();
        assert_eq!(years[0], 19, "2083/84");
        assert_eq!(years[1], 18, "2082/83");
    }

    #[test]
    fn every_office() {
        assert_eq!(parse_branches(BRANCH).unwrap().len(), 15);
    }

    #[test]
    fn an_office_spread_over_two_pages() {
        let first = parse_advertisements(CENTRAL_0).unwrap();
        let second = parse_advertisements(CENTRAL_1).unwrap();
        assert_eq!(first.total_pages, 2);
        assert_eq!(first.vacancies.len() + second.vacancies.len(), 29);
    }

    #[test]
    fn a_post_with_its_deadlines() {
        let all: Vec<JobVacancy> = parse_advertisements(CENTRAL_0)
            .unwrap()
            .vacancies
            .into_iter()
            .chain(parse_advertisements(CENTRAL_1).unwrap().vacancies)
            .collect();
        let kharidar = all
            .iter()
            .find(|v| v.advertisement_code.as_deref() == Some("102-102/2083-84"))
            .expect("the Kharidar advertisement");
        assert_eq!(kharidar.title, "खरिदार वा सो सरह");
        assert_eq!(kharidar.level.as_deref(), Some("सहायक चौथो तह"));
        assert_eq!(kharidar.deadline, Some(NepaliDate::new(2083, 4, 26)));
        assert_eq!(
            kharidar.double_fee_deadline,
            Some(NepaliDate::new(2083, 5, 2))
        );
        assert_eq!(kharidar.applicants, Some(89292));
        assert_eq!(kharidar.id, "psc:102-102/2083-84");
        // The commission's double spaces are gone.
        assert!(all.iter().all(|v| !v.title.contains("  ")));
    }

    #[test]
    fn a_regional_office() {
        let page = parse_advertisements(POKHARA_2082).unwrap();
        assert_eq!(page.vacancies.len(), 17);
        assert_eq!(
            page.vacancies[0].office.as_deref(),
            Some("लोक सेवा आयोग, पोखरा कार्यालय")
        );
    }

    #[test]
    fn an_office_with_nothing_yet() {
        let page = parse_advertisements(POKHARA_EMPTY).unwrap();
        assert!(page.vacancies.is_empty());
        assert_eq!(page.total_pages, 0);
    }

    #[test]
    fn the_page_shell_is_a_parse_error_not_an_empty_list() {
        assert!(parse_advertisements("<!DOCTYPE html><html></html>").is_err());
    }

    #[test]
    fn latest_deadline_first_without_repeats() {
        let page = parse_advertisements(CENTRAL_0).unwrap();
        let mut twice = page.vacancies.clone();
        twice.extend(page.vacancies);
        let finished = finish(twice);
        assert_eq!(finished.len(), 20);
        let last = |v: &JobVacancy| v.double_fee_deadline.or(v.deadline);
        assert!(finished.windows(2).all(|w| last(&w[0]) >= last(&w[1])));
    }
}
