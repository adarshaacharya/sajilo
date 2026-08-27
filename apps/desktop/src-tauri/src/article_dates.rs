//! Fills in publish times for headlines whose feed omitted them. Ported from
//! `ArticleDateStore.swift`.
//!
//! A publish date never changes, so a story page is worth fetching exactly
//! once. Everything here exists to hold to that: results are cached by link
//! and survive relaunch, a link that has already been tried is never
//! retried, and each pass fetches at most [`BATCH_LIMIT`] pages. Steady state
//! is therefore the number of genuinely new stories, not the size of the feed.

use std::collections::{HashMap, HashSet};
use std::future::Future;

use crate::{db, prefs::ARTICLE_DATES_KEY};
use chrono::{DateTime, Utc};
use futures_util::future::join_all;
use sajilo_api::news::{NewsDigest, NewsItem, NewsSource};
use sajilo_providers::{HttpClient, annapurna_dates, rss};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Wry};

/// Ceiling per refresh. The undated feed carries twenty items, so the first
/// run resolves them over a couple of passes rather than opening twenty
/// connections at once, and later runs only ever see new links.
const BATCH_LIMIT: usize = 8;
/// Concurrent fetches. Deliberately small: this is someone's newsroom, not a
/// CDN, and the result is not urgent.
const CONCURRENCY: usize = 3;
/// Enough for weeks of a feed that holds twenty at a time.
const CAPACITY: usize = 400;

/// Link → resolved publish time. A `None` entry records "asked, and the page
/// had no date", distinct from "never asked", so a story that simply lacks
/// one is not re-fetched on every refresh.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
struct Cache {
    #[serde(default)]
    dates: HashMap<String, Option<i64>>,
    #[serde(default)]
    order: Vec<String>,
}

/// Returns the digest with dates filled in where they could be recovered,
/// resolving unknown Annapurna Post links against the network and persisting
/// the result.
pub async fn augment(app: &AppHandle<Wry>, client: &HttpClient, digest: NewsDigest) -> NewsDigest {
    let mut cache = load(app);
    let result = augment_with(&mut cache, digest, |link| async move {
        annapurna_dates::resolve(client, &link).await
    })
    .await;
    save(app, &cache);
    result
}

/// The pure orchestration — which links are unknown, how many to fetch, how
/// results merge back into the digest and the cache — with the resolver
/// injected, so it is testable without a network or an `AppHandle`.
///
/// Only Annapurna Post items already missing a date are considered — the only
/// source whose feed omits one — and only the first `BATCH_LIMIT` unknown
/// links are fetched, so a slow or unreachable newsroom costs one bounded
/// delay, never a stall proportional to the feed.
async fn augment_with<R, Fut>(cache: &mut Cache, digest: NewsDigest, resolve: R) -> NewsDigest
where
    R: Fn(String) -> Fut,
    Fut: Future<Output = Option<DateTime<Utc>>>,
{
    let unknown: Vec<String> = {
        let mut seen = HashSet::new();
        digest
            .items
            .iter()
            .filter(|item| {
                item.source == NewsSource::AnnapurnaPost
                    && item.published.is_none()
                    && !cache.dates.contains_key(&item.link)
            })
            .map(|item| item.link.clone())
            .filter(|link| seen.insert(link.clone()))
            .take(BATCH_LIMIT)
            .collect()
    };

    if !unknown.is_empty() {
        resolve_batch(&unknown, &resolve, cache).await;
        trim(cache);
    }

    let items: Vec<NewsItem> = digest
        .items
        .into_iter()
        .map(|item| {
            if item.published.is_some() {
                return item;
            }
            let Some(Some(secs)) = cache.dates.get(&item.link) else {
                return item;
            };
            let Some(resolved) = DateTime::<Utc>::from_timestamp(*secs, 0) else {
                return item;
            };
            NewsItem {
                published: Some(resolved),
                ..item
            }
        })
        .collect();

    NewsDigest {
        // Re-ordered with the recovered dates in hand, so a story that just
        // gained a timestamp moves to where it belongs.
        items: rss::newest_first(items),
        failed_sources: digest.failed_sources,
        freshness: digest.freshness,
    }
}

async fn resolve_batch<R, Fut>(links: &[String], resolve: &R, cache: &mut Cache)
where
    R: Fn(String) -> Fut,
    Fut: Future<Output = Option<DateTime<Utc>>>,
{
    for chunk in links.chunks(CONCURRENCY) {
        let resolved = join_all(chunk.iter().map(|link| {
            let link = link.clone();
            async { (link.clone(), resolve(link).await) }
        }))
        .await;

        for (link, date) in resolved {
            if cache.dates.contains_key(&link) {
                continue;
            }
            cache
                .dates
                .insert(link.clone(), date.map(|d| d.timestamp()));
            cache.order.push(link);
        }
    }
}

fn trim(cache: &mut Cache) {
    if cache.order.len() <= CAPACITY {
        return;
    }
    let excess = cache.order.len() - CAPACITY;
    for link in cache.order.drain(..excess) {
        cache.dates.remove(&link);
    }
}

fn load(app: &AppHandle<Wry>) -> Cache {
    db::get_json(app, ARTICLE_DATES_KEY)
        .ok()
        .flatten()
        .and_then(|value| serde_json::from_value(value).ok())
        .unwrap_or_default()
}

fn save(app: &AppHandle<Wry>, cache: &Cache) {
    if let Ok(value) = serde_json::to_value(cache) {
        let _ = db::set_json(app, ARTICLE_DATES_KEY, &value);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use sajilo_api::load_state::Freshness;
    use std::cell::Cell;
    use std::rc::Rc;

    fn item(title: &str, published: Option<DateTime<Utc>>) -> NewsItem {
        NewsItem {
            id: None,
            title: title.to_owned(),
            link: format!("https://annapurnapost.com/story/{title}"),
            source: NewsSource::AnnapurnaPost,
            source_name: "Annapurna Post".to_owned(),
            published,
            precision: sajilo_api::news::DatePrecision::Exact,
            content: None,
            department: None,
            tags: Vec::new(),
            attachments: Vec::new(),
        }
    }

    fn digest(items: Vec<NewsItem>) -> NewsDigest {
        NewsDigest {
            items,
            failed_sources: Vec::new(),
            freshness: Freshness::new(Utc::now()),
        }
    }

    /// A resolver stub that counts its calls and always answers with `date`.
    macro_rules! counting_resolver {
        ($calls:ident, $date:expr) => {{
            let counter = $calls.clone();
            move |_link: String| {
                counter.set(counter.get() + 1);
                let date = $date;
                async move { date }
            }
        }};
    }

    #[tokio::test(flavor = "current_thread")]
    async fn fills_in_missing_dates_and_leaves_existing_ones_alone() {
        let resolved_at = DateTime::from_timestamp(1_000, 0).unwrap();
        let calls = Rc::new(Cell::new(0));
        let resolver = counting_resolver!(calls, Some(resolved_at));
        let mut cache = Cache::default();

        let dated = item(
            "has-date",
            Some(DateTime::from_timestamp(5_000, 0).unwrap()),
        );
        let undated = item("no-date", None);
        let result = augment_with(&mut cache, digest(vec![dated, undated]), resolver).await;

        assert_eq!(
            result
                .items
                .iter()
                .find(|i| i.title == "no-date")
                .unwrap()
                .published,
            Some(resolved_at)
        );
        assert_eq!(
            calls.get(),
            1,
            "an item that already has a date is never fetched"
        );
    }

    /// The whole justification for fetching article pages: a publish date
    /// never changes, so a link is fetched once and never again.
    #[tokio::test(flavor = "current_thread")]
    async fn never_fetches_the_same_story_twice() {
        let resolved_at = DateTime::from_timestamp(1_000, 0).unwrap();
        let calls = Rc::new(Cell::new(0));
        let resolver = counting_resolver!(calls, Some(resolved_at));
        let mut cache = Cache::default();

        for _ in 0..3 {
            let _ = augment_with(&mut cache, digest(vec![item("a", None)]), &resolver).await;
        }

        assert_eq!(calls.get(), 1);
    }

    /// A story whose page carries no date must also be remembered, or every
    /// refresh re-fetches it forever.
    #[tokio::test(flavor = "current_thread")]
    async fn remembers_that_a_story_has_no_date() {
        let calls = Rc::new(Cell::new(0));
        let resolver = counting_resolver!(calls, None);
        let mut cache = Cache::default();

        let _ = augment_with(&mut cache, digest(vec![item("a", None)]), &resolver).await;
        let _ = augment_with(&mut cache, digest(vec![item("a", None)]), &resolver).await;

        assert_eq!(calls.get(), 1);
    }

    #[tokio::test(flavor = "current_thread")]
    async fn cached_dates_survive_a_reload() {
        let resolved_at = DateTime::from_timestamp(1_000, 0).unwrap();
        let mut cache = Cache::default();
        {
            let calls = Rc::new(Cell::new(0));
            let resolver = counting_resolver!(calls, Some(resolved_at));
            let _ = augment_with(&mut cache, digest(vec![item("a", None)]), resolver).await;
        }

        // A fresh resolver stands in for a relaunch: the cache alone must answer.
        let calls = Rc::new(Cell::new(0));
        let resolver = counting_resolver!(calls, DateTime::from_timestamp(9_999, 0));
        let result = augment_with(&mut cache, digest(vec![item("a", None)]), resolver).await;

        assert_eq!(calls.get(), 0);
        assert_eq!(result.items.first().unwrap().published, Some(resolved_at));
    }

    /// One refresh must never open a connection per feed item.
    #[tokio::test(flavor = "current_thread")]
    async fn fetches_at_most_one_batch_per_pass() {
        let calls = Rc::new(Cell::new(0));
        let resolver = counting_resolver!(calls, Some(DateTime::from_timestamp(1_000, 0).unwrap()));
        let mut cache = Cache::default();
        let many: Vec<NewsItem> = (0..40).map(|i| item(&format!("story-{i}"), None)).collect();

        let _ = augment_with(&mut cache, digest(many), resolver).await;

        assert_eq!(calls.get() as usize, BATCH_LIMIT);
    }

    /// A newsroom that is slow or down must cost nothing beyond the missing
    /// timestamps — the headlines still arrive.
    #[tokio::test(flavor = "current_thread")]
    async fn headlines_survive_a_failed_resolver() {
        let calls = Rc::new(Cell::new(0));
        let resolver = counting_resolver!(calls, None);
        let mut cache = Cache::default();

        let result = augment_with(
            &mut cache,
            digest(vec![item("a", None), item("b", None)]),
            resolver,
        )
        .await;

        assert_eq!(result.items.len(), 2);
        assert!(result.items.iter().all(|i| i.published.is_none()));
    }

    /// A story that gains a date moves into place among the dated ones.
    #[tokio::test(flavor = "current_thread")]
    async fn reorders_once_dates_are_recovered() {
        let calls = Rc::new(Cell::new(0));
        let resolver = counting_resolver!(calls, Some(DateTime::from_timestamp(9_000, 0).unwrap()));
        let mut cache = Cache::default();

        let older = item("older", Some(DateTime::from_timestamp(1_000, 0).unwrap()));
        let recovered = item("recovered", None);
        let result = augment_with(&mut cache, digest(vec![older, recovered]), resolver).await;

        assert_eq!(
            result
                .items
                .iter()
                .map(|i| i.title.as_str())
                .collect::<Vec<_>>(),
            vec!["recovered", "older"]
        );
    }

    /// A source other than Annapurna Post missing a date is left alone — the
    /// resolver only knows how to read Annapurna's article pages.
    #[tokio::test(flavor = "current_thread")]
    async fn ignores_other_sources() {
        let calls = Rc::new(Cell::new(0));
        let resolver = counting_resolver!(calls, Some(DateTime::from_timestamp(1_000, 0).unwrap()));
        let mut cache = Cache::default();
        let mut other = item("a", None);
        other.source = NewsSource::Ratopati;

        let result = augment_with(&mut cache, digest(vec![other]), resolver).await;

        assert_eq!(calls.get(), 0);
        assert!(result.items[0].published.is_none());
    }
}
