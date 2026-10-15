//! Vacancy notices from sites on GIWMS, the template the government gives its
//! offices: the Teacher Service Commission and several provincial Public
//! Service Commissions. Each publishes its advertisements as a category page
//! whose table has a row per notice: number, title, published date
//! (`असोज २९, २०८३, बिहिबार ७:१३`), the PDF, and a link to the notice.
//!
//! These are notices, not data: the deadline lives inside the PDF, so a
//! vacancy from here carries its title, published date and link, and the
//! screen says to see the notice for the deadline.

use futures_util::future::join_all;
use sajilo_api::jobs::{JobSource, JobVacancy};
use sajilo_core::{NepaliDate, NepaliMonth};
use scraper::{Html, Selector};

use crate::error::{ProviderError, Result};
use crate::http::HttpClient;

/// The newest notices are what matter; two pages is about two months.
const PAGES: u32 = 2;

/// Where each source lists its vacancy notices.
pub fn listing_url(source: JobSource) -> Option<&'static str> {
    Some(match source {
        JobSource::Tsc => "https://tsc.gov.np/category/74",
        JobSource::PpscKoshi => "https://psc.koshi.gov.np/category/advertisement/",
        JobSource::PpscMadhesh => "https://ppsc.madhesh.gov.np/category/advertisement/",
        JobSource::PpscBagmati => {
            "https://ppsc.bagamati.gov.np/category/advertisement--a-s--a--khulla--and-inclusive"
        }
        JobSource::PpscKarnali => {
            "https://ppsc.karnali.gov.np/category/information-of-advertising/"
        }
        _ => return None,
    })
}

fn source_name(source: JobSource) -> &'static str {
    match source {
        JobSource::Tsc => "Shikshak Sewa Aayog",
        JobSource::PpscKoshi => "Koshi Lok Sewa Aayog",
        JobSource::PpscMadhesh => "Madhesh Lok Sewa Aayog",
        JobSource::PpscBagmati => "Bagmati Lok Sewa Aayog",
        JobSource::PpscKarnali => "Karnali Lok Sewa Aayog",
        _ => "Lok Sewa Aayog",
    }
}

pub async fn fetch(client: &HttpClient, source: JobSource) -> Result<Vec<JobVacancy>> {
    let name = source_name(source);
    let listing =
        listing_url(source).ok_or_else(|| ProviderError::parse(name, "not a GIWMS source"))?;
    let pages = join_all((1..=PAGES).map(|page| async move {
        let url = if page == 1 {
            listing.to_owned()
        } else {
            format!("{listing}?page={page}")
        };
        client.get_text(name, &url).await
    }))
    .await;

    let mut vacancies = Vec::new();
    for (index, page) in pages.into_iter().enumerate() {
        match page {
            Ok(body) => vacancies.extend(parse(&body, source)?),
            // Without the first page there is nothing to show; a later page
            // missing only means a shorter list.
            Err(error) if index == 0 => return Err(error),
            Err(_) => {}
        }
    }
    vacancies.dedup_by(|a, b| a.id == b.id);
    Ok(vacancies)
}

/// One listing page's vacancy notices, newest first as the site lists them.
pub fn parse(body: &str, source: JobSource) -> Result<Vec<JobVacancy>> {
    let name = source_name(source);
    let site = listing_url(source)
        .and_then(origin)
        .ok_or_else(|| ProviderError::parse(name, "not a GIWMS source"))?;
    let document = Html::parse_document(body);
    let table = selector("table tbody");
    let row = selector("tr");
    let cell = selector("td");
    let link = selector("a[href]");

    let Some(table) = document.select(&table).next() else {
        return Err(ProviderError::parse(name, "no listing table"));
    };

    let vacancies = table
        .select(&row)
        .filter_map(|row| {
            let cells: Vec<_> = row.select(&cell).collect();
            let title = text(cells.get(1)?);
            if !is_vacancy(&title) {
                return None;
            }
            let published_on = cells.get(2).and_then(|c| parse_published(&text(c)));
            // The notice's own page, else its PDF.
            let hrefs: Vec<String> = row
                .select(&link)
                .filter_map(|a| a.value().attr("href"))
                .map(|href| href.trim().to_owned())
                .collect();
            let page = hrefs.iter().find(|h| h.contains("/content/"));
            let url = match page.or_else(|| hrefs.first()) {
                Some(href) if href.starts_with("http") => href.clone(),
                Some(href) => format!("{site}{href}"),
                None => listing_url(source)?.to_owned(),
            };
            let key = page
                .and_then(|h| h.split('/').find(|part| part.parse::<u32>().is_ok()))
                .map_or_else(|| url.clone(), str::to_owned);
            Some(JobVacancy {
                id: format!("{}:{key}", source.key()),
                source,
                title,
                office: None,
                level: None,
                openings: None,
                advertisement_code: None,
                deadline: None,
                double_fee_deadline: None,
                published_on,
                applicants: None,
                url,
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
    Ok(vacancies)
}

/// Whether a notice in an advertisement list announces a vacancy anyone can
/// apply for, rather than postponing one, extending a form's deadline or
/// saying there is none. Those are real notices, but not jobs to apply for.
/// Nor is a promotion (बढुवा) open only to staff already in the service,
/// unless the same advertisement also has open (खुला) posts.
pub fn is_vacancy(title: &str) -> bool {
    if title.contains("बढुवा") && !title.contains("खुला") {
        return false;
    }
    const ABOUT_A_VACANCY: [&str; 9] = [
        "विज्ञापन",
        "प्रतियोगिता",
        "दरखास्त",
        "पदपूर्ति",
        "आवेदन",
        "भर्ना",
        "आवश्यकता",
        "Vacancy",
        "vacancy",
    ];
    const NOT_ONE: [&str; 21] = [
        "स्थगन",
        "स्थगित",
        "नभएको",
        "नतिजा",
        "म्याद थप",
        "थपघट",
        "रद्द",
        "संशोधन",
        "फाराम",
        "फारम",
        "परीक्षा केन्द्र",
        "अन्तर्वार्ता",
        "Interview",
        "Bids",
        "अद्यावधिक",
        "नामावली",
        "Accept List",
        "Result",
        "Exam",
        "Syllabus",
        "पाठ्यक्रम",
    ];
    ABOUT_A_VACANCY.iter().any(|word| title.contains(word))
        && !NOT_ONE.iter().any(|word| title.contains(word))
}

/// `असोज २९, २०८३, बिहिबार ७:१३` → 2083-06-29.
pub fn parse_published(text: &str) -> Option<NepaliDate> {
    let ascii = sajilo_core::numerals::to_ascii_digits(text);
    let mut parts = ascii.split(',').map(str::trim);
    let mut month_day = parts.next()?.split_whitespace();
    let month = month_number(month_day.next()?)?;
    let day: u32 = month_day.next()?.parse().ok()?;
    let year: i32 = parts.next()?.parse().ok()?;
    let length = sajilo_core::calendar::bikram_sambat::days_in_month(year, month)?;
    (day >= 1 && day as i32 <= length).then(|| NepaliDate::new(year, month, day))
}

/// A month as these sites spell it, including the Sanskrit and older forms.
fn month_number(name: &str) -> Option<u32> {
    let name = match name {
        "वैशाख" => "बैशाख",
        "जेष्ठ" | "जेठ्" => "जेठ",
        "आषाढ" | "असाढ" => "असार",
        "श्रावण" => "साउन",
        "भाद्र" | "भाद्रपद" => "भदौ",
        "आश्विन" | "असोझ" => "असोज",
        "कात्तिक" | "कार्त्तिक" => "कार्तिक",
        "मङ्सिर" | "मार्ग" | "मार्गशीर्ष" => "मंसिर",
        "पौष" | "पुस" => "पुष",
        "फाल्गुन" => "फागुन",
        "चैत्र" => "चैत",
        other => other,
    };
    NepaliMonth::from_nepali_name(name).map(NepaliMonth::number)
}

fn origin(url: &str) -> Option<String> {
    let rest = url.strip_prefix("https://")?;
    let host = rest.split('/').next()?;
    Some(format!("https://{host}"))
}

fn selector(css: &str) -> Selector {
    Selector::parse(css).expect("static selector")
}

fn text(element: &scraper::ElementRef<'_>) -> String {
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

    const TSC: &str = include_str!("../../../../fixtures/giwms/tsc.html");
    const MADHESH: &str = include_str!("../../../../fixtures/giwms/ppsc-madhesh.html");
    const BAGMATI: &str = include_str!("../../../../fixtures/giwms/ppsc-bagmati.html");
    const KARNALI: &str = include_str!("../../../../fixtures/giwms/ppsc-karnali.html");
    const KOSHI: &str = include_str!("../../../../fixtures/giwms/ppsc-koshi.html");

    #[test]
    fn published_dates_as_the_template_writes_them() {
        assert_eq!(
            parse_published("असोज २९, २०८३, बिहिबार ७:१३"),
            Some(NepaliDate::new(2083, 6, 29))
        );
        assert_eq!(
            parse_published("चैत २३, २०८२, मंगलबार ०:०"),
            Some(NepaliDate::new(2082, 12, 23))
        );
        assert_eq!(
            parse_published("कात्तिक ३, २०८३"),
            Some(NepaliDate::new(2083, 7, 3))
        );
        assert_eq!(parse_published("not a date"), None);
    }

    #[test]
    fn vacancies_but_not_postponements_or_extensions() {
        assert!(is_vacancy(
            "निम्नमाध्यमिक तह, तृतीय श्रेणी, शिक्षक पदको खुला प्रतियोगितात्मक परीक्षाको विज्ञापन 2082"
        ));
        assert!(!is_vacancy("अधिकृतस्तर नवौँ तहको विज्ञापन स्थगन सम्बन्धी सूचना"));
        assert!(!is_vacancy("विज्ञापन प्रकाशन नभएको सूचना।"));
        assert!(!is_vacancy(
            "आन्तरिक प्रतियोगितात्मक परीक्षाको आधारमा गरिने (२५ प्रतिशत) शिक्षक बढुवाको विज्ञापन-२०८२"
        ));
        assert!(is_vacancy(
            "स्थानीय सेवाका पाँचौँ तहका पदहरूको बढुवा तथा खुला, अन्तर तह र आन्तरिक अन्तर समूह प्रतियोगितात्मक परीक्षाको विज्ञापन।"
        ));
        assert!(!is_vacancy(
            "निम्नमाध्यमिक तह, तृतीय श्रेणी, शिक्षक पदको खुला प्रतियोगितात्मक लिखित परीक्षाका लागि आवेदन फाराम भर्ने म्याद थपसम्बन्धी सूचना ।"
        ));
    }

    #[test]
    fn teacher_service_commission() {
        let vacancies = parse(TSC, JobSource::Tsc).unwrap();
        let ad = vacancies
            .iter()
            .find(|v| v.title.contains("खुला प्रतियोगितात्मक परीक्षाको विज्ञापन 2082"))
            .expect("the 2082 lower-secondary advertisement");
        assert_eq!(ad.published_on, Some(NepaliDate::new(2082, 12, 23)));
        assert_eq!(ad.id, "tsc:4172");
        assert!(ad.url.starts_with("https://tsc.gov.np/content/4172/"));
        assert!(vacancies.iter().all(|v| !v.title.contains("म्याद थप")));
    }

    #[test]
    fn every_provincial_commission_on_the_template() {
        for (body, source) in [
            (MADHESH, JobSource::PpscMadhesh),
            (BAGMATI, JobSource::PpscBagmati),
            (KARNALI, JobSource::PpscKarnali),
            (KOSHI, JobSource::PpscKoshi),
        ] {
            let vacancies = parse(body, source).unwrap();
            assert!(!vacancies.is_empty(), "{source:?}");
            for vacancy in &vacancies {
                assert!(vacancy.published_on.is_some(), "{}", vacancy.title);
                assert!(vacancy.url.starts_with("https://"), "{}", vacancy.url);
                assert!(vacancy.id.starts_with(source.key()));
            }
        }
    }

    #[test]
    fn madhesh_links_to_the_notice_page() {
        let vacancies = parse(MADHESH, JobSource::PpscMadhesh).unwrap();
        assert_eq!(vacancies[0].id, "ppsc-madhesh:379");
        assert_eq!(
            vacancies[0].url,
            "https://ppsc.madhesh.gov.np/content/379/notification-regarding-advertisement-of-7th-8th-level--non-technical-technical-/"
        );
    }

    #[test]
    fn a_page_without_the_table_is_an_error() {
        assert!(parse("<html><body>Maintenance</body></html>", JobSource::Tsc).is_err());
    }
}
