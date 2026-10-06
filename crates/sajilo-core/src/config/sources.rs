//! Where remote feeds fetch from: `data/config/sources.json`.
//!
//! The defaults stay next to the code that parses each source; this pack
//! only overrides. A moved feed is a `rewrite` from its old URL prefix to
//! its new one, applied to every request the shared HTTP client makes, so
//! no call site needs to know a pack exists.

use std::borrow::Cow;
use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};

use super::check::https_url;
use super::{Pack, Slot};

const MAX_REWRITES: usize = 64;

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default)]
pub struct SourcesPack {
    /// Old URL prefix → new URL prefix.
    pub rewrites: BTreeMap<String, String>,
}

impl SourcesPack {
    /// `url` with the longest matching rewrite applied.
    pub fn rewrite<'a>(&self, url: &'a str) -> Cow<'a, str> {
        self.rewrites
            .iter()
            .filter(|(from, _)| url.starts_with(from.as_str()))
            .max_by_key(|(from, _)| from.len())
            .map_or(Cow::Borrowed(url), |(from, to)| {
                Cow::Owned(format!("{to}{}", &url[from.len()..]))
            })
    }
}

/// `url` as the active pack rewrites it.
pub fn rewrite(url: &str) -> Cow<'_, str> {
    match SourcesPack::active().rewrite(url) {
        Cow::Borrowed(_) => Cow::Borrowed(url),
        Cow::Owned(owned) => Cow::Owned(owned),
    }
}

impl Pack for SourcesPack {
    const NAME: &'static str = "sources";
    const SCHEMA: u32 = 1;

    fn bundled_json() -> &'static str {
        include_str!("../../../../data/config/sources.json")
    }

    fn validate(&self) -> Result<(), String> {
        if self.rewrites.len() > MAX_REWRITES {
            return Err(format!("more than {MAX_REWRITES} rewrites"));
        }
        for (from, to) in &self.rewrites {
            https_url("rewrites key", from)?;
            https_url(&format!("rewrites[{from}]"), to)?;
        }
        Ok(())
    }

    fn slot() -> &'static Slot<Self> {
        static SLOT: Slot<SourcesPack> = Slot::new();
        &SLOT
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn longest_prefix_wins() {
        let pack = SourcesPack {
            rewrites: [
                ("https://a.com/".to_owned(), "https://b.com/".to_owned()),
                (
                    "https://a.com/feed".to_owned(),
                    "https://c.com/rss".to_owned(),
                ),
            ]
            .into(),
        };
        assert_eq!(
            pack.rewrite("https://a.com/feed?x=1"),
            "https://c.com/rss?x=1"
        );
        assert_eq!(pack.rewrite("https://a.com/other"), "https://b.com/other");
        assert_eq!(pack.rewrite("https://z.com/"), "https://z.com/");
    }

    #[test]
    fn refuses_unsafe_rewrites() {
        for json in [
            r#"{"rewrites":{"https://a.com/":"http://b.com/"}}"#,
            r#"{"rewrites":{"https://a.com/":"https://127.0.0.1/"}}"#,
        ] {
            assert!(SourcesPack::parse(json).is_err(), "{json}");
        }
    }
}
