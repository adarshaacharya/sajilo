//! Merged headlines from eleven Nepali and English publishers. Ported from
//! `NewsItem.swift`.

use chrono::{DateTime, Utc};

use crate::load_state::Freshness;

dto_enum! {
    /// The feeds Sajilo reads.
    ///
    /// Most are official publisher RSS endpoints returning
    /// `application/rss+xml`. Two are not shaped that way: Kantipur publishes
    /// no feed at all, but its own front end is served by a keyless public JSON
    /// endpoint, so it is read from that rather than scraped; and The Himalayan
    /// Times publishes no combined feed, only one per section, so several are
    /// read and merged back into a single source. Hamro Patro remains absent —
    /// there is nothing there but HTML, and parsing that is the technique that
    /// silently cost this app 349 days of bundled festival data.
    pub enum NewsSource {
        OnlineKhabar,
        OnlineKhabarEnglish,
        AnnapurnaPost,
        Ratopati,
        Bizkhabar,
        KathmanduPost,
        Khabarhub,
        RisingNepal,
        RatopatiEnglish,
        Kantipur,
        HimalayanTimes,
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
    pub const ALL: [Self; 11] = [
        Self::OnlineKhabar,
        Self::OnlineKhabarEnglish,
        Self::AnnapurnaPost,
        Self::Ratopati,
        Self::Bizkhabar,
        Self::KathmanduPost,
        Self::Khabarhub,
        Self::RisingNepal,
        Self::RatopatiEnglish,
        Self::Kantipur,
        Self::HimalayanTimes,
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
            Self::RisingNepal => "The Rising Nepal",
            Self::RatopatiEnglish => "Ratopati English",
            Self::Kantipur => "Kantipur",
            Self::HimalayanTimes => "The Himalayan Times",
        }
    }

    /// The RSS endpoints a source publishes.
    ///
    /// Most papers put everything in one feed. The Himalayan Times does not: it
    /// has no combined feed at all, only 107 per-section ones, so its desks are
    /// listed here and merged back into a single source. Kantipur is empty —
    /// it publishes no feed and is read from its JSON list endpoint instead,
    /// see `sajilo_providers::kantipur`.
    pub fn rss_feeds(self) -> &'static [&'static str] {
        match self {
            Self::OnlineKhabar => &["https://www.onlinekhabar.com/feed"],
            Self::OnlineKhabarEnglish => &["https://english.onlinekhabar.com/feed"],
            Self::AnnapurnaPost => &["https://annapurnapost.com/rss/"],
            Self::Ratopati => &["https://www.ratopati.com/feed"],
            Self::Bizkhabar => &["https://www.bizkhabar.com/feed"],
            Self::KathmanduPost => &["https://kathmandupost.com/rss"],
            Self::Khabarhub => &["https://english.khabarhub.com/feed"],
            Self::RisingNepal => &["https://risingnepaldaily.com/rss"],
            Self::RatopatiEnglish => &["https://english.ratopati.com/feed"],
            Self::Kantipur => &[],
            // Nepal, Kathmandu, Sports and Business. The paper's International
            // feed (`/rssFeed/5`) answers 200 with an empty channel, so it is
            // deliberately not listed — an always-empty feed would report the
            // whole paper as failed on every refresh.
            Self::HimalayanTimes => &[
                "https://www.thehimalayantimes.com/rssFeed/15",
                "https://www.thehimalayantimes.com/rssFeed/14",
                "https://www.thehimalayantimes.com/rssFeed/3",
                "https://www.thehimalayantimes.com/rssFeed/11",
            ],
        }
    }

    pub fn is_english(self) -> bool {
        matches!(
            self,
            Self::OnlineKhabarEnglish
                | Self::KathmanduPost
                | Self::Khabarhub
                | Self::RisingNepal
                | Self::RatopatiEnglish
                | Self::HimalayanTimes
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
