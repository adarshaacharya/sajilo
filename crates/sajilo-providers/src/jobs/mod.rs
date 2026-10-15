//! Government and public-sector vacancies. One module per kind of site:
//! `psc` for Lok Sewa's JSON API, `giwms` for the government's shared website
//! template that the Teacher Service Commission and several provincial
//! commissions run on.

pub mod giwms;
pub mod psc;
pub mod public;
pub mod sites;

use sajilo_api::jobs::{JobSource, JobVacancy};
use sajilo_core::NepaliDate;

use crate::error::Result;
use crate::http::HttpClient;

/// Every vacancy one source currently lists.
pub async fn fetch(client: &HttpClient, source: JobSource) -> Result<Vec<JobVacancy>> {
    match source {
        JobSource::Psc => psc::fetch(client).await,
        JobSource::PpscGandaki
        | JobSource::PpscLumbini
        | JobSource::PpscSudurpashchim
        | JobSource::NepalPolice
        | JobSource::Apf => sites::fetch(client, source).await,
        JobSource::Nrb | JobSource::NepalBank | JobSource::Rbb | JobSource::Tusc => {
            public::fetch(client, source).await
        }
        other => giwms::fetch(client, other).await,
    }
}

/// A vacancy known only from its notice: title, link and published date.
pub(crate) fn notice(
    source: JobSource,
    key: &str,
    title: String,
    url: String,
    published_on: Option<NepaliDate>,
) -> JobVacancy {
    JobVacancy {
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
    }
}

/// A Bikram Sambat date as these sources write it: `2083-06-20`, `2083/6/20`,
/// or in Devanagari digits. `None` for anything that isn't a real BS date.
pub fn parse_bs_date(text: &str) -> Option<NepaliDate> {
    let ascii = sajilo_core::numerals::to_ascii_digits(text.trim());
    let mut parts = ascii
        .split(['-', '/', '.'])
        .map(|part| part.trim().parse::<u32>().ok());
    let (year, month, day) = (parts.next()??, parts.next()??, parts.next()??);
    if parts.next().is_some() || !(2000..=2200).contains(&year) {
        return None;
    }
    let length = sajilo_core::calendar::bikram_sambat::days_in_month(year as i32, month)?;
    (day >= 1 && day as i32 <= length).then(|| NepaliDate::new(year as i32, month, day))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bs_dates_as_sources_write_them() {
        assert_eq!(
            parse_bs_date("2083-06-20"),
            Some(NepaliDate::new(2083, 6, 20))
        );
        assert_eq!(
            parse_bs_date("२०८३/७/१७"),
            Some(NepaliDate::new(2083, 7, 17))
        );
        assert_eq!(
            parse_bs_date(" 2083.4.26 "),
            Some(NepaliDate::new(2083, 4, 26))
        );
    }

    #[test]
    fn not_a_date() {
        assert_eq!(parse_bs_date(""), None);
        assert_eq!(parse_bs_date("2083-13-01"), None);
        assert_eq!(parse_bs_date("2083-01-40"), None);
        assert_eq!(parse_bs_date("17177-17177/2083-84"), None);
    }
}
