//! Merged headlines from Nepali and English publishers plus official Nepal
//! Government updates. Ported from `NewsItem.swift`.

use chrono::{DateTime, Utc};

use crate::load_state::Freshness;

dto_enum! {
    /// The feeds Sajilo reads.
    ///
    /// Most are publisher RSS endpoints returning `application/rss+xml`.
    /// Kantipur and Nepal Government are the exceptions: both expose the
    /// keyless JSON endpoints their own front ends use, so Sajilo reads those
    /// rather than scraping rendered HTML.
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
        NepalGovernment,
        OnlineKhabar,
        OnlineKhabarEnglish,
        AnnapurnaPost,
        Ratopati,
        Bizkhabar,
        ArthaSansar,
        TechPana,
        HamroKhelkud,
        KathmanduPost,
        Khabarhub,
        RatopatiEnglish,
        Kantipur,
        Gorkhapatra,
        /// A newsroom from the `news-sources` config pack; the headline's
        /// `source_key` says which.
        Custom,
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
    /// A file attached to an official government update.
    pub struct NewsAttachment {
        pub id: String,
        pub filename: String,
        pub mime_type: String,
        pub size: u32,
        pub url: String,
    }

    /// A single headline.
    ///
    /// Publisher entries deliberately retain only a title, a link, and where
    /// they came from. Official government notices additionally retain their
    /// public body and attachments so Sajilo can provide a usable detail view.
    pub struct NewsItem {
        // Stable only for sources that publish one. Government updates use
        // this to open their complete cached text inside Sajilo.
        #[serde(default)]
        pub id: Option<String>,
        pub title: String,
        pub link: String,
        pub source: NewsSource,
        /// The pack id of a [`NewsSource::Custom`] source; `None` for the
        /// built-in ones, which `source` already names.
        #[serde(default)]
        pub source_key: Option<String>,
        pub source_name: String,
        // Absent in some feeds — Annapurna Post publishes no `pubDate` at all
        // — so nothing may depend on it being there.
        pub published: Option<DateTime<Utc>>,
        pub precision: DatePrecision,
        // Full text is retained only for official government updates. News
        // publishers remain headline-and-link only.
        #[serde(default)]
        pub content: Option<String>,
        #[serde(default)]
        pub department: Option<String>,
        #[serde(default)]
        pub tags: Vec<String>,
        #[serde(default)]
        pub attachments: Vec<NewsAttachment>,
    }

    /// One entry in the source picker.
    ///
    /// Sent rather than duplicated in TypeScript so the publisher names and the
    /// language split have exactly one definition — this file.
    pub struct NewsSourceInfo {
        /// A built-in source's `NewsSource` name, or a pack source's id —
        /// what a headline's `source_key ?? source` is compared with.
        pub id: String,
        pub name: String,
        pub english: bool,
        pub official: bool,
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
    /// Every source: the built-in ones in `NewsSource::ALL` order, then the
    /// active `news-sources` pack's.
    pub fn catalog() -> Vec<Self> {
        use sajilo_core::config::Pack;
        NewsSource::ALL
            .into_iter()
            .map(|source| Self {
                id: source.key().to_owned(),
                name: source.display_name().to_owned(),
                english: source.is_english(),
                official: source.is_official(),
            })
            .chain(NewsSourcesPack::active().sources.iter().map(|source| Self {
                id: source.id.clone(),
                name: source.name.clone(),
                english: source.english,
                official: false,
            }))
            .collect()
    }
}

dto! {
    /// A newsroom added by config: any site with an RSS or Atom feed.
    pub struct PackNewsSource {
        /// Stable once published: a reader's chosen filter is saved by it.
        pub id: String,
        pub name: String,
        pub feeds: Vec<String>,
        #[serde(default)]
        pub english: bool,
    }

    /// Newsrooms added without a release: `data/config/news-sources.json`.
    pub struct NewsSourcesPack {
        #[serde(default)]
        pub sources: Vec<PackNewsSource>,
    }
}

/// Every source is fetched on each refresh; this keeps a refresh quick.
const MAX_PACK_SOURCES: usize = 20;
const MAX_FEEDS: usize = 4;

impl sajilo_core::config::Pack for NewsSourcesPack {
    const NAME: &'static str = "news-sources";
    const SCHEMA: u32 = 1;

    fn bundled_json() -> &'static str {
        include_str!("../../../data/config/news-sources.json")
    }

    fn validate(&self) -> Result<(), String> {
        use sajilo_core::config::check;
        if self.sources.len() > MAX_PACK_SOURCES {
            return Err(format!("more than {MAX_PACK_SOURCES} sources"));
        }
        let mut ids = std::collections::BTreeSet::new();
        for source in &self.sources {
            let id = &source.id;
            let slug = !id.is_empty()
                && id.len() <= 40
                && id
                    .chars()
                    .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-');
            if !slug {
                return Err(format!("{id}: id must be a lowercase slug"));
            }
            if NewsSource::ALL.iter().any(|built_in| built_in.key() == id)
                || id == "all"
                || id == "custom"
            {
                return Err(format!("{id}: id is taken"));
            }
            if !ids.insert(id.as_str()) {
                return Err(format!("{id} appears twice"));
            }
            check::text(&format!("{id}.name"), &source.name, 60)?;
            if source.feeds.is_empty() || source.feeds.len() > MAX_FEEDS {
                return Err(format!("{id}: 1 to {MAX_FEEDS} feeds"));
            }
            for feed in &source.feeds {
                check::https_url(&format!("{id}.feeds"), feed)?;
            }
        }
        Ok(())
    }

    fn slot() -> &'static sajilo_core::config::Slot<Self> {
        static SLOT: sajilo_core::config::Slot<NewsSourcesPack> = sajilo_core::config::Slot::new();
        &SLOT
    }
}

impl NewsSource {
    pub const ALL: [Self; 14] = [
        Self::NepalGovernment,
        Self::OnlineKhabar,
        Self::OnlineKhabarEnglish,
        Self::AnnapurnaPost,
        Self::Ratopati,
        Self::Bizkhabar,
        Self::ArthaSansar,
        Self::TechPana,
        Self::HamroKhelkud,
        Self::KathmanduPost,
        Self::Khabarhub,
        Self::RatopatiEnglish,
        Self::Kantipur,
        Self::Gorkhapatra,
    ];

    /// The name it serialises as: `"onlineKhabar"`.
    pub fn key(self) -> &'static str {
        match self {
            Self::NepalGovernment => "nepalGovernment",
            Self::OnlineKhabar => "onlineKhabar",
            Self::OnlineKhabarEnglish => "onlineKhabarEnglish",
            Self::AnnapurnaPost => "annapurnaPost",
            Self::Ratopati => "ratopati",
            Self::Bizkhabar => "bizkhabar",
            Self::ArthaSansar => "arthaSansar",
            Self::TechPana => "techPana",
            Self::HamroKhelkud => "hamroKhelkud",
            Self::KathmanduPost => "kathmanduPost",
            Self::Khabarhub => "khabarhub",
            Self::RatopatiEnglish => "ratopatiEnglish",
            Self::Kantipur => "kantipur",
            Self::Gorkhapatra => "gorkhapatra",
            Self::Custom => "custom",
        }
    }

    pub fn display_name(self) -> &'static str {
        match self {
            Self::NepalGovernment => "Nepal Government",
            Self::OnlineKhabar => "OnlineKhabar",
            Self::OnlineKhabarEnglish => "OnlineKhabar English",
            Self::AnnapurnaPost => "Annapurna Post",
            Self::Ratopati => "Ratopati",
            Self::Bizkhabar => "Bizkhabar",
            Self::ArthaSansar => "Artha Sansar",
            Self::TechPana => "TechPana",
            Self::HamroKhelkud => "Hamro Khelkud",
            Self::KathmanduPost => "The Kathmandu Post",
            Self::Khabarhub => "Khabarhub",
            Self::RatopatiEnglish => "Ratopati English",
            Self::Kantipur => "Kantipur",
            Self::Gorkhapatra => "Gorkhapatra",
            Self::Custom => "News",
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
            Self::NepalGovernment => &[],
            Self::OnlineKhabar => &["https://www.onlinekhabar.com/feed"],
            Self::OnlineKhabarEnglish => &["https://english.onlinekhabar.com/feed"],
            Self::AnnapurnaPost => &["https://annapurnapost.com/rss/"],
            Self::Ratopati => &["https://www.ratopati.com/feed"],
            Self::Bizkhabar => &["https://www.bizkhabar.com/feed"],
            Self::ArthaSansar => &["https://arthasansar.com/feed/"],
            Self::TechPana => &["https://techpana.com/feed/"],
            Self::HamroKhelkud => &["https://www.hamrokhelkud.com/feed/"],
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
            // Its feeds are in the pack, per source.
            Self::Custom => &[],
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

    pub fn is_official(self) -> bool {
        self == Self::NepalGovernment
    }

    /// The Kathmandu Post ships no `pubDate`, but every one of its links spells
    /// the date out — `/national/2026/08/16/landslides-…`. That is the same
    /// precision the paper itself reports, so it is read from the URL rather
    /// than fetched: no extra request, and nothing invented.
    pub fn dates_from_link_path(self) -> bool {
        self == Self::KathmanduPost
    }
}
