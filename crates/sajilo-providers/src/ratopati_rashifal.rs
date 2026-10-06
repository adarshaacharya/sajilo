//! Rashifal from Ratopati: the fallback when Hamro Patro is down.
//!
//! Ratopati publishes one page per sign, each carrying all four periods in
//! `#today`, `#weekly`, `#monthly` and `#yearly` blocks: an `<h6>` naming the
//! span (daily only) and the reading as one or more `<p>`. So a full set for
//! a period is twelve requests — acceptable for a fallback, never the
//! everyday path.

use chrono::{DateTime, Utc};
use sajilo_api::load_state::Freshness;
use sajilo_api::rashifal::{RashiSign, Rashifal, RashifalPeriod, RashifalSnapshot, RashifalSource};
use scraper::{Html, Selector};

use crate::error::{ProviderError, Result};
use crate::http::HttpClient;

pub const SOURCE_NAME: &str = "Ratopati rashifal";

const HOST: &str = "https://www.ratopati.com/rashifal";

/// A reading shorter than this is a placeholder, not a prediction.
const MINIMUM_PREDICTION_CHARS: usize = 60;

/// Ratopati's slug for each sign, as its own links spell them.
pub fn slug(sign: RashiSign) -> &'static str {
    match sign {
        RashiSign::Mesh => "mesh",
        RashiSign::Vrish => "brish",
        RashiSign::Mithun => "mithun",
        RashiSign::Karkat => "karkat",
        RashiSign::Simha => "singha",
        RashiSign::Kanya => "kanya",
        RashiSign::Tula => "tula",
        RashiSign::Vrishchik => "brischik",
        RashiSign::Dhanu => "dhanu",
        RashiSign::Makar => "makar",
        RashiSign::Kumbha => "kumbha",
        RashiSign::Meen => "meen",
    }
}

pub fn sign_url(sign: RashiSign) -> String {
    format!("{HOST}/{}", slug(sign))
}

fn block_id(period: RashifalPeriod) -> &'static str {
    match period {
        RashifalPeriod::Daily => "today",
        RashifalPeriod::Weekly => "weekly",
        RashifalPeriod::Monthly => "monthly",
        RashifalPeriod::Yearly => "yearly",
    }
}

/// One sign's reading for `period`, and the span's heading if it has one.
pub fn parse_sign(page: &str, period: RashifalPeriod) -> Option<(String, Option<String>)> {
    let document = Html::parse_document(page);
    let block = Selector::parse(&format!("#{}", block_id(period))).ok()?;
    let paragraph = Selector::parse("p").expect("static selector");
    let heading = Selector::parse("h6").expect("static selector");
    let block = document.select(&block).next()?;

    let tidy = |text: String| text.split_whitespace().collect::<Vec<_>>().join(" ");
    let prediction = block
        .select(&paragraph)
        .map(|p| tidy(p.text().collect()))
        .filter(|text| !text.is_empty())
        .collect::<Vec<_>>()
        .join("\n\n");
    if prediction.chars().count() < MINIMUM_PREDICTION_CHARS {
        return None;
    }
    let title = block
        .select(&heading)
        .next()
        .map(|h| tidy(h.text().collect()))
        .filter(|text| !text.is_empty());
    Some((prediction, title))
}

/// Every sign's reading for `period`: twelve pages. All twelve or an error,
/// like Hamro Patro's parser.
pub async fn fetch(
    client: &HttpClient,
    period: RashifalPeriod,
    now: DateTime<Utc>,
) -> Result<RashifalSnapshot> {
    let mut readings = Vec::new();
    let mut title = None;
    for sign in RashiSign::ALL {
        let page = client.get_text(SOURCE_NAME, &sign_url(sign)).await?;
        let (prediction, heading) = parse_sign(&page, period).ok_or_else(|| {
            ProviderError::parse(SOURCE_NAME, format!("{} has no reading", slug(sign)))
        })?;
        title = title.or(heading);
        readings.push(Rashifal::new(sign, prediction));
    }
    Ok(RashifalSnapshot {
        readings,
        period,
        title,
        source: RashifalSource::Ratopati,
        freshness: Freshness::new(now),
    })
}
