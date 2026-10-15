//! Public banks and Tribhuvan University: four more sites of their own
//! design, all server-rendered, none with a deadline outside its PDF. Their
//! dates are AD, written three different ways, and turned into BS here.
//!
//! - Nepal Rastra Bank lists its HR department's notices: vacancies among
//!   results, name lists and interview calls.
//! - Nepal Bank keeps a vacancy tab in one table.
//! - Rastriya Banijya Bank's "Open Competition" section has a row per date,
//!   each with several files: adverts, exam centres, accepted lists.
//! - TU's Service Commission lists advertisements as their own notice type.
//!
//! Left out on purpose: the Agricultural Development Bank's API wants a key
//! copied from its own app, Nepal Oil's vacancy list is years old, Nepal
//! Telecom's are hand-written pages, and the Electricity Authority does not
//! answer from outside Nepal.

use chrono::NaiveDate;
use sajilo_api::jobs::{JobSource, JobVacancy};
use sajilo_core::NepaliDate;
use scraper::{ElementRef, Html, Selector};

use super::giwms::is_vacancy;
use super::notice;
use crate::error::{ProviderError, Result};
use crate::http::HttpClient;

const LIMIT: usize = 30;

pub fn listing_url(source: JobSource) -> Option<&'static str> {
    Some(match source {
        JobSource::Nrb => "https://www.nrb.org.np/category/notices/?department=hrm",
        JobSource::NepalBank => "https://www.nepalbank.com.np/career",
        JobSource::Rbb => "https://www.rbb.com.np/career",
        JobSource::Tusc => "https://tusc.tu.edu.np/notices?notice_type=38",
        _ => return None,
    })
}

fn source_name(source: JobSource) -> &'static str {
    match source {
        JobSource::Nrb => "Nepal Rastra Bank",
        JobSource::NepalBank => "Nepal Bank",
        JobSource::Rbb => "Rastriya Banijya Bank",
        JobSource::Tusc => "TU Service Commission",
        _ => "Jobs",
    }
}

pub async fn fetch(client: &HttpClient, source: JobSource) -> Result<Vec<JobVacancy>> {
    let name = source_name(source);
    let url =
        listing_url(source).ok_or_else(|| ProviderError::parse(name, "not a public source"))?;
    let body = client.get_text(name, url).await?;
    parse(&body, source)
}

pub fn parse(body: &str, source: JobSource) -> Result<Vec<JobVacancy>> {
    let name = source_name(source);
    let document = Html::parse_document(body);
    let mut vacancies = match source {
        JobSource::Nrb => nrb(&document),
        JobSource::NepalBank => nepal_bank(&document),
        JobSource::Rbb => rbb(&document),
        JobSource::Tusc => tusc(&document),
        _ => return Err(ProviderError::parse(name, "not a public source")),
    }
    .ok_or_else(|| ProviderError::parse(name, "the listing is not where it was"))?;
    vacancies.dedup_by(|a, b| a.id == b.id);
    vacancies.truncate(LIMIT);
    Ok(vacancies)
}

/// `ul.arrowed-list > li`: title link, then the date (`October 2, 2026`).
fn nrb(document: &Html) -> Option<Vec<JobVacancy>> {
    let source = JobSource::Nrb;
    let list = document.select(&css("ul.arrowed-list")).next()?;
    let link = css("span.text-primary a[href]");
    let date = css(".font-size-xs span.text-muted");
    Some(
        list.select(&css("li"))
            .filter_map(|item| {
                let a = item.select(&link).next()?;
                let title = text(&a);
                if !is_vacancy(&title) {
                    return None;
                }
                let href = a.value().attr("href")?.trim().to_owned();
                let key = href.trim_end_matches('/').rsplit('/').next()?.to_owned();
                let published = item
                    .select(&date)
                    .next()
                    .and_then(|d| bs_from(&text(&d), "%B %e, %Y"));
                Some(notice(source, &key, title, href, published))
            })
            .collect(),
    )
}

/// `#vacancy table tbody tr`: number | title, `<br>`, date (`Feb 13, 2026`)
/// | download link.
fn nepal_bank(document: &Html) -> Option<Vec<JobVacancy>> {
    let source = JobSource::NepalBank;
    let table = document.select(&css("#vacancy table tbody")).next()?;
    Some(
        table
            .select(&css("tr"))
            .filter_map(|row| {
                let cells: Vec<_> = row.select(&css("td")).collect();
                // The title and date share a cell, either side of a <br>.
                let lines: Vec<String> = cells
                    .get(1)?
                    .text()
                    .map(|line| line.split_whitespace().collect::<Vec<_>>().join(" "))
                    .filter(|line| !line.is_empty())
                    .collect();
                let title = lines.first()?.clone();
                if !is_vacancy(&title) {
                    return None;
                }
                let published = lines.get(1).and_then(|d| bs_from(d, "%b %e, %Y"));
                let href = cells
                    .get(2)?
                    .select(&css("a[href]"))
                    .next()?
                    .value()
                    .attr("href")?
                    .trim()
                    .to_owned();
                let key = href.rsplit('/').next()?.trim_end_matches(".pdf").to_owned();
                Some(notice(source, &key, title, href, published))
            })
            .collect(),
    )
}

/// The Open Competition section (`#collapse0`): a row per date
/// (`10/02/2026`), each listing files. Adverts are titled `Vacancy: …` or
/// `Level 9, Law (…)`; the rest are exam centres and accepted lists.
fn rbb(document: &Html) -> Option<Vec<JobVacancy>> {
    let source = JobSource::Rbb;
    let section = document.select(&css("#collapse0")).next()?;
    let date_cell = css("table.new_gif_table td");
    let file = css("ul li a[href]");
    let mut vacancies = Vec::new();
    for row in section.select(&css("tbody > tr")) {
        let Some(published) = row
            .select(&date_cell)
            .next()
            .and_then(|d| bs_from(&text(&d), "%m/%d/%Y"))
        else {
            continue;
        };
        for a in row.select(&file) {
            let title = text(&a);
            let advert = title.starts_with("Vacancy") || is_level_advert(&title);
            if !advert || !is_vacancy(&format!("Vacancy {title}")) {
                continue;
            }
            let Some(href) = a.value().attr("href") else {
                continue;
            };
            let href = super::sites::encode_path(href);
            let key = href
                .rsplit('/')
                .next()
                .map(|name| {
                    name.chars()
                        .take_while(char::is_ascii_digit)
                        .collect::<String>()
                })
                .filter(|digits| !digits.is_empty())
                .unwrap_or_else(|| href.clone());
            vacancies.push(notice(source, &key, title, href, Some(published)));
        }
    }
    Some(vacancies)
}

/// `Level 9, Law (Senior Manager-Law)`: an advert for one post.
fn is_level_advert(title: &str) -> bool {
    title
        .strip_prefix("Level ")
        .and_then(|rest| rest.split(',').next())
        .is_some_and(|level| level.trim().parse::<u32>().is_ok())
}

/// `.recent-post-wrapper`: `span.nep_date` (an AD date, despite its name)
/// and the title link.
fn tusc(document: &Html) -> Option<Vec<JobVacancy>> {
    let source = JobSource::Tusc;
    let posts: Vec<_> = document.select(&css(".recent-post-wrapper")).collect();
    if posts.is_empty() && document.select(&css(".notices-warpper")).next().is_none() {
        return None;
    }
    Some(
        posts
            .into_iter()
            .filter_map(|post| {
                let a = post.select(&css(".detail a[href]")).next()?;
                let title = text(&a);
                if !is_vacancy(&title) {
                    return None;
                }
                let href = a.value().attr("href")?.trim().to_owned();
                let key = href.rsplit('/').next()?.to_owned();
                let published = post
                    .select(&css("span.nep_date"))
                    .next()
                    .and_then(|d| bs_from(&text(&d), "%Y-%m-%d"));
                Some(notice(source, &key, title, href, published))
            })
            .collect(),
    )
}

/// An AD date in `format`, as BS.
fn bs_from(text: &str, format: &str) -> Option<NepaliDate> {
    let date = NaiveDate::parse_from_str(text.trim(), format).ok()?;
    sajilo_core::calendar::bikram_sambat::nepali_date_from(date).ok()
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

    const NRB: &str = include_str!("../../../../fixtures/public/nrb.html");
    const NEPAL_BANK: &str = include_str!("../../../../fixtures/public/nepal-bank.html");
    const RBB: &str = include_str!("../../../../fixtures/public/rbb.html");
    const TUSC: &str = include_str!("../../../../fixtures/public/tusc.html");

    #[test]
    fn nrb_calls_for_applications_not_its_results() {
        let vacancies = parse(NRB, JobSource::Nrb).unwrap();
        for vacancy in &vacancies {
            assert!(!vacancy.title.contains("नतिजा"), "{}", vacancy.title);
            assert!(!vacancy.title.contains("नामावली"), "{}", vacancy.title);
            assert!(vacancy.published_on.is_some());
            assert!(vacancy.url.starts_with("https://www.nrb.org.np/"));
        }
    }

    #[test]
    fn nepal_bank_with_its_dates() {
        let vacancies = parse(NEPAL_BANK, JobSource::NepalBank).unwrap();
        let open = &vacancies[0];
        assert_eq!(
            open.title,
            "Vacancy Announcement for Open Competition 2082-83"
        );
        // 13 February 2026.
        assert_eq!(open.published_on, Some(NepaliDate::new(2082, 11, 1)));
        assert!(open.url.to_ascii_lowercase().ends_with(".pdf"));
    }

    #[test]
    fn rbb_adverts_among_exam_centres_and_lists() {
        let vacancies = parse(RBB, JobSource::Rbb).unwrap();
        assert!(
            vacancies
                .iter()
                .any(|v| v.title == "Vacancy: Open Competition (2082/083)")
        );
        for vacancy in &vacancies {
            assert!(!vacancy.title.starts_with("Exam"), "{}", vacancy.title);
            assert!(!vacancy.title.starts_with("Accept"), "{}", vacancy.title);
            assert!(!vacancy.url.contains(' '));
        }
    }

    #[test]
    fn tu_advertisements() {
        let vacancies = parse(TUSC, JobSource::Tusc).unwrap();
        let first = &vacancies[0];
        assert!(first.title.contains("उप प्राध्यापक"));
        assert_eq!(first.id, "tusc:9146");
        // 8 September 2025.
        assert_eq!(first.published_on, Some(NepaliDate::new(2082, 5, 23)));
    }

    #[test]
    fn a_level_advert() {
        assert!(is_level_advert("Level 9, Law (Senior Manager-Law)"));
        assert!(!is_level_advert("Level-5 and Level-4 pre-test"));
    }

    #[test]
    fn a_redesigned_page_is_an_error() {
        for source in [
            JobSource::Nrb,
            JobSource::NepalBank,
            JobSource::Rbb,
            JobSource::Tusc,
        ] {
            assert!(
                parse("<html><body>new look</body></html>", source).is_err(),
                "{source:?}"
            );
        }
    }
}
