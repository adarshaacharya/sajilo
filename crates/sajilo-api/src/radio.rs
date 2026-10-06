//! Nepal radio directory. Ported from `RadioStation.swift`.

use crate::load_state::Freshness;

dto! {
    /// One station in Ratopati's Nepal radio directory.
    pub struct RadioStation {
        pub slug: String,
        pub name: String,
        pub frequency: Option<String>,
        pub logo_url: Option<String>,
        /// The direct stream URL the webview plays. Absent when the directory
        /// lists a station it has no playable source for.
        pub stream_url: Option<String>,
    }

    pub struct RadioDirectory {
        pub stations: Vec<RadioStation>,
        pub freshness: Freshness,
    }
}

dto! {
    /// Corrections to the live directory: `data/config/radio.json`.
    ///
    /// The directory is scraped from Ratopati and changes without notice.
    /// This adds stations it lacks, hides dead ones, and replaces a stream
    /// that moved, without a release.
    pub struct RadioPack {
        /// Shown alongside the directory's; one with a directory slug
        /// replaces that entry.
        #[serde(default)]
        pub add: Vec<RadioStation>,
        /// Slugs never shown.
        #[serde(default)]
        pub hide: Vec<String>,
        /// Slug → stream URL, used instead of the station page's.
        #[serde(default)]
        pub streams: std::collections::BTreeMap<String, String>,
    }
}

const MAX_RADIO_ENTRIES: usize = 300;

impl RadioPack {
    /// The directory with this pack's corrections applied.
    pub fn apply(&self, mut directory: RadioDirectory) -> RadioDirectory {
        let replaced: std::collections::BTreeSet<&str> = self
            .add
            .iter()
            .map(|station| station.slug.as_str())
            .collect();
        directory.stations.retain(|station| {
            !self.hide.contains(&station.slug) && !replaced.contains(station.slug.as_str())
        });
        directory.stations.extend(
            self.add
                .iter()
                .filter(|station| !self.hide.contains(&station.slug))
                .cloned(),
        );
        for station in &mut directory.stations {
            if let Some(url) = self.streams.get(&station.slug) {
                station.stream_url = Some(url.clone());
            }
        }
        directory
    }

    /// The stream to play for `slug`, if this pack names one.
    pub fn stream_for(&self, slug: &str) -> Option<String> {
        self.streams.get(slug).cloned().or_else(|| {
            self.add
                .iter()
                .find(|station| station.slug == slug)
                .and_then(|station| station.stream_url.clone())
        })
    }
}

impl sajilo_core::config::Pack for RadioPack {
    const NAME: &'static str = "radio";
    const SCHEMA: u32 = 1;

    fn bundled_json() -> &'static str {
        include_str!("../../../data/config/radio.json")
    }

    fn validate(&self) -> Result<(), String> {
        use sajilo_core::config::check;
        if self.add.len() + self.hide.len() + self.streams.len() > MAX_RADIO_ENTRIES {
            return Err(format!("more than {MAX_RADIO_ENTRIES} entries"));
        }
        let slug_ok = |slug: &str| {
            !slug.is_empty()
                && slug.len() <= 80
                && slug
                    .chars()
                    .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
        };
        let mut seen = std::collections::BTreeSet::new();
        for station in &self.add {
            let slug = &station.slug;
            if !slug_ok(slug) || !seen.insert(slug.as_str()) {
                return Err(format!("add: {slug} is not a unique slug"));
            }
            check::text(&format!("{slug}.name"), &station.name, 80)?;
            if let Some(frequency) = &station.frequency {
                check::optional_text(&format!("{slug}.frequency"), frequency, 20)?;
            }
            // The webview's CSP plays https streams only.
            let Some(stream) = &station.stream_url else {
                return Err(format!("{slug}: an added station needs a streamUrl"));
            };
            check::https_url(&format!("{slug}.streamUrl"), stream)?;
            if let Some(logo) = &station.logo_url {
                check::https_url(&format!("{slug}.logoUrl"), logo)?;
            }
        }
        for slug in &self.hide {
            if !slug_ok(slug) {
                return Err(format!("hide: {slug} is not a slug"));
            }
        }
        for (slug, url) in &self.streams {
            if !slug_ok(slug) {
                return Err(format!("streams: {slug} is not a slug"));
            }
            check::https_url(&format!("streams.{slug}"), url)?;
        }
        Ok(())
    }

    fn slot() -> &'static sajilo_core::config::Slot<Self> {
        static SLOT: sajilo_core::config::Slot<RadioPack> = sajilo_core::config::Slot::new();
        &SLOT
    }
}
