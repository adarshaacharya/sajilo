//! Sources with sites of their own design, one small parser each. All five
//! are server-rendered HTML:
//!
//! - Gandaki's commission lists each advertisement with its post count and
//!   both deadlines (as AD dates in an attribute its script turns into BS).
//! - Lumbini's commission and Sudurpashchim's list notices with the date
//!   they were published.
//! - Nepal Police lists its vacancy notices in one table.
//! - The Armed Police Force lists every notice since 2075 on one page of
//!   cards, recruitment among exam centres, results and tenders.
//!
//! The Nepal Army is not a source: its recruitment portal answers scripts
//! with a CAPTCHA.

use chrono::NaiveDate;
use sajilo_api::jobs::{JobSource, JobVacancy};
use sajilo_core::NepaliDate;
use scraper::{ElementRef, Html, Selector};

use super::giwms::{is_vacancy, parse_published};
use super::{notice, parse_bs_date};
use crate::error::{ProviderError, Result};
use crate::http::HttpClient;

/// The newest notices are what matter, and APF's page holds hundreds.
const LIMIT: usize = 40;

pub fn listing_url(source: JobSource) -> Option<&'static str> {
    Some(match source {
        JobSource::PpscGandaki => "https://ppsc.gandaki.gov.np/advertisings-list",
        JobSource::PpscLumbini => {
            "https://ppsc.lumbini.gov.np/publications?category=%E0%A4%AC%E0%A4%BF%E0%A4%9C%E0%A5%8D%E0%A4%9E%E0%A4%BE%E0%A4%AA%E0%A4%A8"
        }
        JobSource::PpscSudurpashchim => "https://psc.sudurpashchim.gov.np/advertisements",
        JobSource::NepalPolice => "https://www.nepalpolice.gov.np/career/vacancy/",
        JobSource::Apf => "https://www.apf.gov.np/vacancy",
        _ => return None,
    })
}

fn source_name(source: JobSource) -> &'static str {
    match source {
        JobSource::PpscGandaki => "Gandaki Lok Sewa Aayog",
        JobSource::PpscLumbini => "Lumbini Lok Sewa Aayog",
        JobSource::PpscSudurpashchim => "Sudurpashchim Lok Sewa Aayog",
        JobSource::NepalPolice => "Nepal Police",
        JobSource::Apf => "Armed Police Force",
        _ => "Jobs",
    }
}

pub async fn fetch(client: &HttpClient, source: JobSource) -> Result<Vec<JobVacancy>> {
    let name = source_name(source);
    let url = listing_url(source).ok_or_else(|| ProviderError::parse(name, "not a site source"))?;
    let body = client.get_text(name, url).await?;
    parse(&body, source)
}

pub fn parse(body: &str, source: JobSource) -> Result<Vec<JobVacancy>> {
    let name = source_name(source);
    let document = Html::parse_document(body);
    let mut vacancies = match source {
        JobSource::PpscGandaki => gandaki(&document),
        JobSource::PpscLumbini => lumbini(&document),
        JobSource::PpscSudurpashchim => sudurpashchim(&document),
        JobSource::NepalPolice => police(&document),
        JobSource::Apf => apf(&document),
        _ => return Err(ProviderError::parse(name, "not a site source")),
    }
    .ok_or_else(|| ProviderError::parse(name, "the listing is not where it was"))?;
    vacancies.dedup_by(|a, b| a.id == b.id);
    vacancies.truncate(LIMIT);
    Ok(vacancies)
}

/// `table.table` rows: number | title | post count | deadline | double-fee
/// deadline | file. Dates are `span[englishDate="2026-10-20"]`.
fn gandaki(document: &Html) -> Option<Vec<JobVacancy>> {
    let source = JobSource::PpscGandaki;
    let table = document.select(&css("table.table")).next()?;
    let date = css("span[englishdate]");
    let link = css("a[href]");
    Some(
        table
            .select(&css("tr"))
            .filter_map(|row| {
                let cells: Vec<_> = row.select(&css("td")).collect();
                let title = text(cells.get(1)?);
                if !is_vacancy(&title) {
                    return None;
                }
                let ad_date = |cell: Option<&ElementRef<'_>>| {
                    cell?
                        .select(&date)
                        .next()?
                        .value()
                        .attr("englishdate")
                        .and_then(bs_from_ad)
                };
                let file = row
                    .select(&link)
                    .find_map(|a| a.value().attr("href"))
                    .map(encode_path)?;
                // The upload's numeric prefix is the stable part of its name.
                let key = file
                    .rsplit('/')
                    .next()
                    .and_then(|name| name.split('_').next())
                    .unwrap_or(&file)
                    .to_owned();
                let mut vacancy = notice(source, &key, title, file, None);
                vacancy.openings = number(&text(cells.get(2)?)).filter(|n| *n > 0);
                vacancy.advertisement_code = Some(text(cells.first()?)).filter(|code| {
                    // `-/०८३-८४` is the site's way of saying there is none.
                    !code.starts_with('-') && !code.is_empty()
                });
                vacancy.deadline = ad_date(cells.get(3));
                vacancy.double_fee_deadline = ad_date(cells.get(4));
                Some(vacancy)
            })
            .collect(),
    )
}

/// `tbody.table-hover-css tr`: published date (`असार २, २०८३`) | title link.
fn lumbini(document: &Html) -> Option<Vec<JobVacancy>> {
    let source = JobSource::PpscLumbini;
    let body = document.select(&css("tbody.table-hover-css")).next()?;
    let title_link = css("a.list-detail-font[href]");
    Some(
        body.select(&css("tr"))
            .filter_map(|row| {
                let link = row.select(&title_link).next()?;
                let title = text(&link);
                if !is_vacancy(&title) {
                    return None;
                }
                let href = link.value().attr("href")?.trim();
                let key = href.rsplit('/').find(|part| !part.is_empty())?.to_owned();
                let published = row
                    .select(&css("td"))
                    .next()
                    .and_then(|cell| parse_published(&text(&cell)));
                Some(notice(
                    source,
                    &key,
                    title,
                    format!("https://ppsc.lumbini.gov.np{href}"),
                    published,
                ))
            })
            .collect(),
    )
}

/// `table.n-tbl tbody tr`: number | title link | advertisement number badge |
/// published date (`२०८२ चैत २७`) | files.
fn sudurpashchim(document: &Html) -> Option<Vec<JobVacancy>> {
    let source = JobSource::PpscSudurpashchim;
    let table = document.select(&css("table.n-tbl tbody")).next()?;
    let title_link = css("a.n-tlink[href]");
    let badge = css("span.n-tbadge");
    Some(
        table
            .select(&css("tr"))
            .filter_map(|row| {
                let link = row.select(&title_link).next()?;
                let title = text(&link);
                if !is_vacancy(&title) {
                    return None;
                }
                let href = link.value().attr("href")?.trim().to_owned();
                // The slug ends in the notice's number: `...-sacana-2493`.
                let key = href.rsplit('-').next()?.trim_end_matches('/').to_owned();
                let published = row
                    .select(&css("td"))
                    .nth(3)
                    .and_then(|cell| year_first_date(&text(&cell)));
                let mut vacancy = notice(source, &key, title, href, published);
                vacancy.advertisement_code = row.select(&badge).next().map(|b| text(&b));
                Some(vacancy)
            })
            .collect(),
    )
}

/// `table.table-01 tbody tr`: published date (`२०८३-०६-०२`) | title link.
fn police(document: &Html) -> Option<Vec<JobVacancy>> {
    let source = JobSource::NepalPolice;
    let table = document.select(&css("table.table-01 tbody")).next()?;
    Some(
        table
            .select(&css("tr"))
            .filter_map(|row| {
                let cells: Vec<_> = row.select(&css("td")).collect();
                let link = cells.get(1)?.select(&css("a[href]")).next()?;
                let title = text(&link);
                if !is_vacancy(&title) {
                    return None;
                }
                let href = link.value().attr("href")?.trim();
                let key = href.rsplit('/').find(|part| !part.is_empty())?.to_owned();
                Some(notice(
                    source,
                    &key,
                    title,
                    format!("https://www.nepalpolice.gov.np{href}"),
                    parse_bs_date(&text(cells.first()?)),
                ))
            })
            .collect(),
    )
}

/// `a[href] > div.career-card-div` cards: `span.posted` (`2083-05-26`) and
/// `h5.card-title-en`, the link going straight to the PDF.
fn apf(document: &Html) -> Option<Vec<JobVacancy>> {
    let source = JobSource::Apf;
    let cards = css("a[href]");
    let card = css("div.career-card-div");
    let posted = css("span.posted");
    let heading = css("h5.card-title-en");
    let vacancies: Vec<JobVacancy> = document
        .select(&cards)
        .filter_map(|link| {
            let body = link.select(&card).next()?;
            let title = text(&body.select(&heading).next()?);
            let recruiting = title.contains("भर्ना") || title.contains("Vacancy");
            if !recruiting || !is_vacancy(&title) || title.contains("नतिजा") {
                return None;
            }
            let href = link.value().attr("href")?.trim().to_owned();
            // PDFs are named `<name>_<unix time>.pdf`.
            let key = href
                .rsplit('_')
                .next()
                .and_then(|tail| tail.strip_suffix(".pdf"))
                .unwrap_or(&href)
                .to_owned();
            let published = body
                .select(&posted)
                .next()
                .and_then(|span| parse_bs_date(&text(&span)));
            Some(notice(source, &key, title, href, published))
        })
        .collect();
    // An empty page means the cards moved, not that the force stopped hiring.
    (document.select(&card).next().is_some()).then_some(vacancies)
}

/// `2026-10-20` (AD) as a BS date.
fn bs_from_ad(text: &str) -> Option<NepaliDate> {
    let date = NaiveDate::parse_from_str(text.trim(), "%Y-%m-%d").ok()?;
    sajilo_core::calendar::bikram_sambat::nepali_date_from(date).ok()
}

/// `२०८२ चैत २७`: year, month, day.
fn year_first_date(text: &str) -> Option<NepaliDate> {
    let mut parts = text.split_whitespace();
    let (year, month, day) = (parts.next()?, parts.next()?, parts.next()?);
    parse_published(&format!("{month} {day}, {year}"))
}

fn number(text: &str) -> Option<u32> {
    sajilo_core::numerals::to_ascii_digits(text)
        .trim()
        .parse()
        .ok()
}

/// Upload paths with Devanagari and spaces in them, made into a real URL.
pub(crate) fn encode_path(href: &str) -> String {
    use std::fmt::Write;
    let href = href.trim();
    let href = href
        .strip_prefix("//")
        .map_or_else(|| href.to_owned(), |rest| format!("https://{rest}"));
    let mut out = String::with_capacity(href.len() * 3);
    for c in href.chars() {
        if c == ' ' {
            out.push_str("%20");
        } else if c.is_ascii() {
            out.push(c);
        } else {
            let mut buffer = [0; 4];
            for byte in c.encode_utf8(&mut buffer).bytes() {
                let _ = write!(out, "%{byte:02X}");
            }
        }
    }
    out
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

    const GANDAKI: &str = include_str!("../../../../fixtures/ppsc/gandaki.html");
    const LUMBINI: &str = include_str!("../../../../fixtures/ppsc/lumbini.html");
    const SUDURPASHCHIM: &str = include_str!("../../../../fixtures/ppsc/sudurpashchim.html");
    const POLICE: &str = include_str!("../../../../fixtures/security/police.html");
    const APF: &str = include_str!("../../../../fixtures/security/apf.html");

    #[test]
    fn gandaki_with_its_deadlines() {
        let vacancies = parse(GANDAKI, JobSource::PpscGandaki).unwrap();
        let first = &vacancies[0];
        assert!(first.title.contains("एघारौँ, नवौँ र आठौँ तहका पदहरूको विज्ञापन"));
        assert_eq!(first.openings, Some(69));
        // 2026-10-20 and 2026-10-27 AD.
        assert_eq!(first.deadline, Some(NepaliDate::new(2083, 7, 3)));
        assert_eq!(
            first.double_fee_deadline,
            Some(NepaliDate::new(2083, 7, 10))
        );
        assert_eq!(first.advertisement_code, None, "`-/०८३-८४` is no number");
        assert!(
            first
                .url
                .starts_with("https://ppsc.gandaki.gov.np/images/advertising/")
        );
        assert!(!first.url.contains(' '));
        assert!(vacancies.iter().all(|v| !v.title.contains("बढुवाको सूचना")));
    }

    #[test]
    fn lumbini_keeps_the_advertisements_not_the_promotions() {
        let vacancies = parse(LUMBINI, JobSource::PpscLumbini).unwrap();
        for vacancy in &vacancies {
            assert!(vacancy.published_on.is_some(), "{}", vacancy.title);
            assert!(
                vacancy
                    .url
                    .starts_with("https://ppsc.lumbini.gov.np/publications/")
            );
            assert!(!vacancy.title.contains("संशोधन"));
        }
    }

    #[test]
    fn sudurpashchim_with_its_advertisement_numbers() {
        let vacancies = parse(SUDURPASHCHIM, JobSource::PpscSudurpashchim).unwrap();
        let fourth = vacancies
            .iter()
            .find(|v| v.id == "ppsc-sudurpashchim:2493")
            .expect("the fourth-level advertisement");
        assert_eq!(fourth.advertisement_code.as_deref(), Some("१०९-११७/०८२-८३"));
        assert_eq!(fourth.published_on, Some(NepaliDate::new(2082, 12, 27)));
        // Listed once, though the page draws each row twice.
        assert_eq!(vacancies.iter().filter(|v| v.id == fourth.id).count(), 1);
    }

    #[test]
    fn police_vacancies_not_their_forms() {
        let vacancies = parse(POLICE, JobSource::NepalPolice).unwrap();
        let asi = vacancies
            .iter()
            .find(|v| v.id == "police:58")
            .expect("the 2083-06-02 advertisement");
        assert_eq!(asi.published_on, Some(NepaliDate::new(2083, 6, 2)));
        assert_eq!(asi.url, "https://www.nepalpolice.gov.np/career/vacancy/58");
        assert!(vacancies.iter().all(|v| !v.title.contains("फाराम")));
    }

    #[test]
    fn apf_recruitment_among_its_notices() {
        let vacancies = parse(APF, JobSource::Apf).unwrap();
        let newest = &vacancies[0];
        assert!(newest.title.starts_with("नयाँ भर्ना सम्बन्धी सूचना"));
        assert_eq!(newest.published_on, Some(NepaliDate::new(2083, 5, 26)));
        assert_eq!(newest.id, "apf:1789101214");
        assert!(vacancies.iter().all(|v| !v.title.contains("परीक्षा केन्द्र")));
        assert!(vacancies.iter().all(|v| !v.title.contains("Bids")));
    }

    #[test]
    fn a_redesigned_page_is_an_error() {
        for source in [
            JobSource::PpscGandaki,
            JobSource::PpscLumbini,
            JobSource::PpscSudurpashchim,
            JobSource::NepalPolice,
            JobSource::Apf,
        ] {
            assert!(
                parse("<html><body>new look</body></html>", source).is_err(),
                "{source:?}"
            );
        }
    }

    #[test]
    fn upload_paths_become_urls() {
        assert_eq!(
            encode_path("//psc.example.gov.np/up/1_चौथो तह.pdf"),
            "https://psc.example.gov.np/up/1_%E0%A4%9A%E0%A5%8C%E0%A4%A5%E0%A5%8B%20%E0%A4%A4%E0%A4%B9.pdf"
        );
    }
}
