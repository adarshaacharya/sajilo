//! Merged headlines from ten Nepali and English publishers. Ported from
//! `NewsItem.swift`.

use chrono::{DateTime, Utc};

use crate::load_state::Freshness;

dto_enum! {
    /// The feeds Sajilo reads.
    ///
    /// All but one are official publisher RSS endpoints returning
    /// `application/rss+xml`. Kantipur is the exception: it publishes no feed,
    /// but its own front end is served by a keyless public JSON endpoint, so it
    /// is read from that rather than scraped.
    ///
    /// Three papers are deliberately absent. Hamro Patro offers nothing but
    /// HTML, and parsing that is the technique that silently cost this app 349
    /// days of bundled festival data. The Himalayan Times published perfectly
    /// good per-section feeds until it put the whole site behind a Sucuri
    /// JavaScript challenge: every request now answers `307` into a page that
    /// says scripting is required. A browser solves it, an HTTP client cannot,
    /// and defeating a bot check to read a newspaper is not something this app
    /// does. It was removed rather than left to fail on every refresh — an
    /// error line that is always there is one nobody reads when it matters.
    ///
    /// The Rising Nepal went the same way in August 2026, for a duller reason:
    /// its host answers ICMP but refuses every TCP connection on 80 and 443,
    /// from inside Nepal and abroad alike, while `gorkhapatraonline.com` — the
    /// same publisher, the neighbouring address in the same /24 — serves fine.
    /// Nothing was announced and Gorkhapatra still links to
    /// `risingnepaldaily.com`, so there is no new feed to follow. Note that
    /// `risingnep.com` is not one: that domain lapsed and now serves gambling
    /// spam under the paper's old title. Gorkhapatra, its Nepali sibling from
    /// the same publisher, is read in its place and answers fine.
    pub enum NewsSource {
        OnlineKhabar,
        OnlineKhabarEnglish,
        AnnapurnaPost,
        Ratopati,
        Bizkhabar,
        KathmanduPost,
        Khabarhub,
        RatopatiEnglish,
        Kantipur,
        Gorkhapatra,
    }

    /// How precisely `published` is known.
    ///
    /// The Kathmandu Post dates a story only to the day. Rendering that as a
    /// relative time would tell a reader a story from this afternoon is "22
    /// hours old" — a specific, confident, wrong number. Carrying the precision
    /// lets the row say "Today" instead of inventing an hour.
    pub enum DatePrecision {
        Exact,
        Day,
    }
}

dto! {
    /// A single headline.
    ///
    /// Deliberately just a title, a link, and where it came from. The feeds
    /// carry more — OnlineKhabar ships `content:encoded` with the whole article
    /// body — and none of it is read. Syndicating a feed is not a licence to
    /// republish what it contains.
    pub struct NewsItem {
        pub title: String,
        pub link: String,
        pub source: NewsSource,
        pub source_name: String,
        /// Absent in some feeds — Annapurna Post publishes no `pubDate` at all
        /// — so nothing may depend on it being there.
        pub published: Option<DateTime<Utc>>,
        pub precision: DatePrecision,
    }

    /// One entry in the source picker.
    ///
    /// Sent rather than duplicated in TypeScript so the publisher names and the
    /// language split have exactly one definition — this file.
    pub struct NewsSourceInfo {
        pub id: NewsSource,
        pub name: String,
        pub english: bool,
    }

    pub struct NewsDigest {
        pub items: Vec<NewsItem>,
        /// Sources that failed this round, so partial results can say so rather
        /// than quietly presenting themselves as the whole picture.
        #[serde(default)]
        pub failed_sources: Vec<String>,
        pub freshness: Freshness,
    }
}

impl NewsSourceInfo {
    /// Every source, in `NewsSource::ALL` order.
    pub fn catalog() -> Vec<Self> {
        NewsSource::ALL
            .into_iter()
            .map(|source| Self {
                id: source,
                name: source.display_name().to_owned(),
                english: source.is_english(),
            })
            .collect()
    }
}

impl NewsSource {
    pub const ALL: [Self; 10] = [
        Self::OnlineKhabar,
        Self::OnlineKhabarEnglish,
        Self::AnnapurnaPost,
        Self::Ratopati,
        Self::Bizkhabar,
        Self::KathmanduPost,
        Self::Khabarhub,
        Self::RatopatiEnglish,
        Self::Kantipur,
        Self::Gorkhapatra,
    ];

    pub fn display_name(self) -> &'static str {
        match self {
            Self::OnlineKhabar => "OnlineKhabar",
            Self::OnlineKhabarEnglish => "OnlineKhabar English",
            Self::AnnapurnaPost => "Annapurna Post",
            Self::Ratopati => "Ratopati",
            Self::Bizkhabar => "Bizkhabar",
            Self::KathmanduPost => "The Kathmandu Post",
            Self::Khabarhub => "Khabarhub",
            Self::RatopatiEnglish => "Ratopati English",
            Self::Kantipur => "Kantipur",
            Self::Gorkhapatra => "Gorkhapatra",
        }
    }

    /// The RSS endpoints a source publishes.
    ///
    /// A slice rather than one URL: a paper split across per-section feeds is
    /// still one source to a reader. Kantipur is empty — it publishes no feed
    /// and is read from its JSON list endpoint instead, see
    /// `sajilo_providers::kantipur`.
    pub fn rss_feeds(self) -> &'static [&'static str] {
        match self {
            Self::OnlineKhabar => &["https://www.onlinekhabar.com/feed"],
            Self::OnlineKhabarEnglish => &["https://english.onlinekhabar.com/feed"],
            Self::AnnapurnaPost => &["https://annapurnapost.com/rss/"],
            Self::Ratopati => &["https://www.ratopati.com/feed"],
            Self::Bizkhabar => &["https://www.bizkhabar.com/feed"],
            Self::KathmanduPost => &["https://kathmandupost.com/rss"],
            // Trailing slash: without it the site answers 301 to exactly this
            // URL, costing a round trip on every refresh.
            Self::Khabarhub => &["https://english.khabarhub.com/feed/"],
            Self::RatopatiEnglish => &["https://english.ratopati.com/feed"],
            Self::Kantipur => &[],
            // Undiscoverable: the homepage advertises no `<link
            // rel="alternate">` and `/feed` and `/rss.xml` both answer 404.
            // Only `/rss` serves, and it names itself in an `atom:link
            // rel="self"`, so it is the feed the paper means to publish.
            Self::Gorkhapatra => &["https://gorkhapatraonline.com/rss"],
        }
    }

    pub fn is_english(self) -> bool {
        matches!(
            self,
            Self::OnlineKhabarEnglish
                | Self::KathmanduPost
                | Self::Khabarhub
                | Self::RatopatiEnglish
        )
    }

    /// The Kathmandu Post ships no `pubDate`, but every one of its links spells
    /// the date out — `/national/2026/08/16/landslides-…`. That is the same
    /// precision the paper itself reports, so it is read from the URL rather
    /// than fetched: no extra request, and nothing invented.
    pub fn dates_from_link_path(self) -> bool {
        self == Self::KathmanduPost
    }
}
