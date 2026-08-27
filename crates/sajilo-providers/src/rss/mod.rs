//! The publisher and official-update news merge. Ported from
//! `RSSNewsProvider.swift`.
//!
//! Nine of the ten are RSS. Kantipur is not — it is decoded by
//! [`crate::kantipur`] from the JSON endpoint its own site runs on — and is
//! merged here on equal terms with the feeds.
//!
//! A source may list more than one feed, so a paper that splits its output by
//! section still reads as one name in the list.

pub mod parser;

use std::collections::HashSet;

use chrono::{DateTime, Utc};
use sajilo_api::load_state::Freshness;
use sajilo_api::news::{DatePrecision, NewsDigest, NewsItem, NewsSource};

use crate::error::Result;
use crate::http::HttpClient;
use crate::{government_updates, kantipur};

pub const SOURCE_NAME: &str = "RSS news";

/// How many headlines the merged list carries.
pub const DEFAULT_LIMIT: usize = 60;

/// Fetches every source, keeps whatever came back, and names what did not.
///
/// A source that fails costs its own headlines and nothing else — the digest
/// reports it in `failed_sources` so a partial result can say so rather than
/// quietly presenting itself as the whole picture.
pub async fn fetch(client: &HttpClient, now: DateTime<Utc>, limit: usize) -> Result<NewsDigest> {
    let mut feeds = Vec::new();
    let mut failed = Vec::new();

    for source in NewsSource::ALL {
        // JSON sources have no RSS feed; they are fetched below and join the
        // merge as peer lists.
        if source.rss_feeds().is_empty() {
            continue;
        }

        let mut desks = Vec::new();
        for url in source.rss_feeds() {
            if let Ok(body) = client.get_text(SOURCE_NAME, url).await {
                let items = parser::parse(&body, source, parser::DEFAULT_LIMIT);
                if !items.is_empty() {
                    desks.push(items);
                }
            }
        }

        // A paper split across section feeds is one source to a reader, so its
        // desks are round-robined into a single list before the papers are.
        // Concatenating instead would bury Sports under fifty Nepal stories.
        let items = interleave(&desks, parser::DEFAULT_LIMIT);
        if items.is_empty() {
            failed.push(source.display_name().to_owned());
        } else {
            feeds.push(items);
        }
    }

    match kantipur::fetch(client, parser::DEFAULT_LIMIT).await {
        Ok(items) if !items.is_empty() => feeds.push(items),
        _ => failed.push(NewsSource::Kantipur.display_name().to_owned()),
    }

    match government_updates::fetch(client, parser::DEFAULT_LIMIT).await {
        Ok(items) if !items.is_empty() => feeds.push(items),
        _ => failed.push(NewsSource::NepalGovernment.display_name().to_owned()),
    }

    Ok(NewsDigest {
        items: newest_first(interleave(&feeds, limit)),
        failed_sources: failed,
        freshness: Freshness::new(now),
    })
}

/// Takes one headline from each source in turn.
///
/// Not a date sort: Annapurna Post publishes no `pubDate` at all, so sorting by
/// time would bury it permanently. Round-robin also stops a single prolific
/// feed — OnlineKhabar returns 55 items to Bizkhabar's 10 — from filling the
/// entire list.
pub fn interleave(feeds: &[Vec<NewsItem>], limit: usize) -> Vec<NewsItem> {
    let mut merged: Vec<NewsItem> = Vec::new();
    let mut seen: HashSet<String> = HashSet::new();
    let mut index = 0;

    while merged.len() < limit && feeds.iter().any(|feed| index < feed.len()) {
        for feed in feeds {
            let Some(item) = feed.get(index) else {
                continue;
            };
            // The same wire story is syndicated to more than one of these
            // sites, so the link is what identifies it.
            if !seen.insert(item.link.clone()) {
                continue;
            }
            merged.push(item.clone());
            if merged.len() >= limit {
                break;
            }
        }
        index += 1;
    }
    merged
}

/// Sorts the exactly-timed headlines newest-first *in place*, leaving every
/// other item in the slot `interleave` gave it.
///
/// Only an exact timestamp takes part. Sorting on anything less sends whole
/// publishers to the bottom, twice over: Annapurna Post dates nothing at all,
/// and The Kathmandu Post dates only to the day — its stories carry midnight,
/// so every one of them would lose to every story filed today with a real
/// clock. Both papers vanished below the fold that way.
///
/// Readers get newest-first across everything that can honestly be ranked, and
/// a publisher is not punished for the shape of its feed.
pub fn newest_first(items: Vec<NewsItem>) -> Vec<NewsItem> {
    let mut rankable: Vec<usize> = items
        .iter()
        .enumerate()
        .filter(|(_, item)| is_rankable(item))
        .map(|(index, _)| index)
        .collect();

    // Stable, so ties keep their interleaved order and a refresh cannot shuffle
    // equally-timed headlines.
    rankable.sort_by(|&left, &right| {
        items[right]
            .published
            .cmp(&items[left].published)
            .then(left.cmp(&right))
    });

    let mut sorted = rankable.iter().map(|&index| items[index].clone());
    items
        .iter()
        .map(|item| {
            if is_rankable(item) {
                sorted.next().unwrap_or_else(|| item.clone())
            } else {
                item.clone()
            }
        })
        .collect()
}

fn is_rankable(item: &NewsItem) -> bool {
    item.published.is_some() && item.precision == DatePrecision::Exact
}
