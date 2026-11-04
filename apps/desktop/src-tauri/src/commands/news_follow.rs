//! Following a newsroom: a notification for each new story, a summary of
//! the new ones every few hours, or its top stories once a day.
//!
//! What counts as new is decided against a ledger of links already seen per
//! followed source. Following starts from what is there now, so a fresh
//! follow never sends the backlog. The notifications themselves are planned
//! like every other reminder: from cached data, with a stable id, so the
//! scheduler's `LastFired` record keeps each one to a single delivery and the
//! quiet hours, pause and card style all apply as they do elsewhere.

use std::collections::{BTreeMap, HashSet};
use std::time::Duration;

use chrono::{DateTime, Days, FixedOffset, NaiveDate, TimeZone, Timelike, Utc};
use sajilo_api::news::{NewsDigest, NewsFollowMode, NewsFollows, NewsItem, NewsSourceInfo};
use sajilo_core::focus::Language;
use sajilo_core::notify::{PlannedNotification, ReminderKind, still_deliverable};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Wry};

use crate::{db, prefs};

const FOLLOWS_KEY: &str = "news.follows";
const LEDGER_KEY: &str = "news.followLedger";
/// Enough links to cover a source's whole feed several times over; older ones
/// have long left the feed and can't come back as new.
const SEEN_LIMIT: usize = 300;
/// Headlines in a daily or every-few-hours summary.
const DAILY_TOP: usize = 3;
/// While a newsroom is followed for its new stories, news is fetched this
/// often rather than with the hourly refresh of everything else.
const EACH_CHECK: Duration = Duration::from_secs(15 * 60);
const GOVERNMENT: &str = "nepalGovernment";

/// One followed source's memory: what it has already shown, and the new
/// stories found but not yet past the late window.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SourceLedger {
    seen: Vec<String>,
    fresh: Vec<Fresh>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Fresh {
    title: String,
    found_at: DateTime<Utc>,
}

type Ledger = BTreeMap<String, SourceLedger>;

fn read<T: serde::de::DeserializeOwned + Default>(app: &AppHandle<Wry>, key: &str) -> T {
    db::get_json(app, key)
        .ok()
        .flatten()
        .and_then(|value| serde_json::from_value(value).ok())
        .unwrap_or_default()
}

fn write<T: Serialize>(app: &AppHandle<Wry>, key: &str, value: &T) -> Result<(), String> {
    let value = serde_json::to_value(value).map_err(|e| e.to_string())?;
    db::set_json(app, key, &value).map_err(|e| e.clone())
}

fn follows(app: &AppHandle<Wry>) -> NewsFollows {
    read(app, FOLLOWS_KEY)
}

/// Whether a mode needs to know which stories are new: every mode but the
/// daily one, which shows the top stories of the moment.
fn tracks_new(mode: NewsFollowMode) -> bool {
    mode != NewsFollowMode::Daily
}

/// What a source is called in its notifications.
fn display_name(source: &str, names: &BTreeMap<String, String>, language: Language) -> String {
    if source == NewsFollows::ALL {
        return match language {
            Language::Ne => "समाचार".to_owned(),
            Language::En => "News".to_owned(),
        };
    }
    names
        .get(source)
        .cloned()
        .unwrap_or_else(|| source.to_owned())
}

/// The source an item belongs to, as the picker names it.
fn source_of(item: &NewsItem) -> String {
    item.source_key
        .clone()
        .unwrap_or_else(|| item.source.key().to_owned())
}

/// A source's items, newest first as the digest has them. "All" is every
/// newsroom; government notices have their own row on the News screen.
fn items_of<'a>(digest: &'a NewsDigest, source: &str) -> Vec<&'a NewsItem> {
    digest
        .items
        .iter()
        .filter(|item| {
            let key = source_of(item);
            if source == NewsFollows::ALL {
                key != GOVERNMENT
            } else {
                key == source
            }
        })
        .collect()
}

/// Folds a fetch into one source's ledger. A source seen for the first time
/// only takes note of what is there; after that, every link it hasn't seen is
/// a new story. Returns whether anything new was found.
fn advance(
    ledger: &mut SourceLedger,
    first_time: bool,
    items: &[(&str, &str)],
    now: DateTime<Utc>,
) -> bool {
    let seen: HashSet<&str> = ledger.seen.iter().map(String::as_str).collect();
    let new: Vec<(&str, &str)> = items
        .iter()
        .copied()
        .filter(|(link, _)| !seen.contains(link))
        .collect();
    if !first_time {
        ledger.fresh.extend(new.iter().map(|(_, title)| Fresh {
            title: (*title).to_owned(),
            found_at: now,
        }));
    }
    let mut next: Vec<String> = new.iter().map(|(link, _)| (*link).to_owned()).collect();
    next.append(&mut ledger.seen);
    next.truncate(SEEN_LIMIT);
    ledger.seen = next;
    ledger
        .fresh
        .retain(|fresh| still_deliverable(fresh.found_at, now));
    !first_time && !new.is_empty()
}

/// Takes note of the cached digest for every source followed for its new
/// stories. Called after each news fetch.
pub fn record(app: &AppHandle<Wry>) {
    let follows = follows(app);
    let each: Vec<&String> = follows
        .sources
        .iter()
        .filter(|(_, mode)| tracks_new(**mode))
        .map(|(source, _)| source)
        .collect();
    if each.is_empty() {
        return;
    }
    let Some((digest, _)) = super::news::cached(app) else {
        return;
    };
    let mut ledger: Ledger = read(app, LEDGER_KEY);
    let now = Utc::now();
    let mut found = false;
    for source in each {
        let items: Vec<(&str, &str)> = items_of(&digest, source)
            .into_iter()
            .map(|item| (item.link.as_str(), item.title.as_str()))
            .collect();
        // A source whose feed came back empty this time says nothing about
        // what is new; it is left as it was.
        if items.is_empty() {
            continue;
        }
        let first_time = !ledger.contains_key(source);
        found |= advance(
            ledger.entry(source.clone()).or_default(),
            first_time,
            &items,
            now,
        );
    }
    let _ = write(app, LEDGER_KEY, &ledger);
    if found {
        super::notify::reschedule();
    }
}

/// Keeps news current while a newsroom is followed for its new stories: a
/// story should be heard about within a quarter of an hour, not the hour
/// everything else waits.
pub fn spawn(app: AppHandle<Wry>) {
    tauri::async_runtime::spawn(async move {
        loop {
            tokio::time::sleep(EACH_CHECK).await;
            let wanted = follows(&app).sources.values().any(|mode| tracks_new(*mode));
            if wanted && crate::background_refresh::enabled(&app, prefs::NEWS_ENABLED) {
                // Records as it returns.
                super::news::get_news(app.clone(), Some(false)).await;
            }
        }
    });
}

#[tauri::command]
pub fn news_follows(app: AppHandle<Wry>) -> NewsFollows {
    follows(&app)
}

/// Follows `source` in `mode`, or stops following it with `None`.
#[tauri::command]
pub fn set_news_follow(
    app: AppHandle<Wry>,
    source: String,
    mode: Option<NewsFollowMode>,
) -> Result<NewsFollows, String> {
    let known = source == NewsFollows::ALL
        || NewsSourceInfo::catalog()
            .iter()
            .any(|info| info.id == source);
    if !known {
        return Err(format!("unknown news source {source}"));
    }
    let mut follows = follows(&app);
    // Whatever it was followed as before, the story-by-story memory starts
    // again: a source followed again later begins from what is there then.
    let mut ledger: Ledger = read(&app, LEDGER_KEY);
    ledger.remove(&source);
    write(&app, LEDGER_KEY, &ledger)?;
    match mode {
        Some(mode) => follows.sources.insert(source, mode),
        None => follows.sources.remove(&source),
    };
    write(&app, FOLLOWS_KEY, &follows)?;
    record(&app);
    super::notify::reschedule();
    Ok(follows)
}

#[tauri::command]
pub fn set_news_daily_hour(app: AppHandle<Wry>, hour: u8) -> Result<NewsFollows, String> {
    if hour > 23 {
        return Err(format!("no hour {hour}"));
    }
    let mut follows = follows(&app);
    follows.daily_hour = hour;
    write(&app, FOLLOWS_KEY, &follows)?;
    super::notify::reschedule();
    Ok(follows)
}

#[tauri::command]
pub fn set_news_every_hours(app: AppHandle<Wry>, hours: u8) -> Result<NewsFollows, String> {
    if !NewsFollows::EVERY_HOURS.contains(&hours) {
        return Err(format!("not a summary spacing: {hours} hours"));
    }
    let mut follows = follows(&app);
    follows.every_hours = hours;
    write(&app, FOLLOWS_KEY, &follows)?;
    super::notify::reschedule();
    Ok(follows)
}

/// What the scheduler may deliver for followed newsrooms.
pub fn pending_notifications(app: &AppHandle<Wry>, now: DateTime<Utc>) -> Vec<PlannedNotification> {
    let follows = follows(app);
    if follows.sources.is_empty() {
        return Vec::new();
    }
    let names: BTreeMap<String, String> = NewsSourceInfo::catalog()
        .into_iter()
        .map(|info| (info.id, info.name))
        .collect();
    let ledger: Ledger = read(app, LEDGER_KEY);
    let digest = super::news::cached(app).map(|(digest, _)| digest);
    let language = prefs::language(app);
    let offset = super::notify::local_offset();
    let today = now.with_timezone(&offset).date_naive();
    let fire_on = |day: NaiveDate| {
        let at = day.and_hms_opt(u32::from(follows.daily_hour.min(23)), 0, 0)?;
        offset
            .from_local_datetime(&at)
            .single()
            .map(|local| local.with_timezone(&Utc))
    };

    let mut planned = Vec::new();
    for (source, mode) in &follows.sources {
        let name = display_name(source, &names, language);
        match mode {
            NewsFollowMode::Each => {
                if let Some(entry) = ledger.get(source) {
                    planned.extend(plan_each(source, &name, entry, language, now));
                }
            }
            NewsFollowMode::Hours => {
                if let Some(entry) = ledger.get(source) {
                    planned.extend(plan_hours(
                        source,
                        &name,
                        entry,
                        follows.every_hours,
                        offset,
                        language,
                        now,
                    ));
                }
            }
            NewsFollowMode::Daily => {
                let Some(digest) = &digest else { continue };
                let top: Vec<&str> = items_of(digest, source)
                    .into_iter()
                    .take(DAILY_TOP)
                    .map(|item| item.title.as_str())
                    .collect();
                if top.is_empty() {
                    continue;
                }
                // Today's and tomorrow's, so the scheduler knows when to wake;
                // the headlines are re-read from the cache each time it plans.
                for day in [Some(today), today.checked_add_days(Days::new(1))]
                    .into_iter()
                    .flatten()
                {
                    let Some(fire_at) = fire_on(day) else {
                        continue;
                    };
                    if !still_deliverable(fire_at, now) {
                        continue;
                    }
                    planned.push(PlannedNotification {
                        id: format!("sajilo.news.daily.{source}.{day}"),
                        kind: ReminderKind::News,
                        title: daily_title(source, &name, language),
                        body: top.join(" · "),
                        fire_at,
                    });
                }
            }
        }
    }
    planned
}

/// One notification per batch of stories found together.
fn plan_each(
    source: &str,
    name: &str,
    entry: &SourceLedger,
    language: Language,
    now: DateTime<Utc>,
) -> Vec<PlannedNotification> {
    let mut batches: BTreeMap<DateTime<Utc>, Vec<&Fresh>> = BTreeMap::new();
    for fresh in entry
        .fresh
        .iter()
        .filter(|fresh| still_deliverable(fresh.found_at, now))
    {
        batches.entry(fresh.found_at).or_default().push(fresh);
    }
    batches
        .into_iter()
        .filter_map(|(found_at, stories)| {
            let first = stories.first()?;
            let title = match (stories.len(), language) {
                (1, _) => name.to_owned(),
                (n, Language::Ne) => format!("{name} · {} नयाँ समाचार", nepali_digits(n)),
                (n, Language::En) => format!("{name} · {n} new stories"),
            };
            Some(PlannedNotification {
                id: format!("sajilo.news.each.{source}.{}", found_at.timestamp()),
                kind: ReminderKind::News,
                title,
                body: first.title.clone(),
                fire_at: found_at,
            })
        })
        .collect()
}

/// Where a story found at `found_at` is told: the end of its `every`-hour
/// slot, counted from local midnight so a 3-hour summary comes at 9, 12, 15.
fn slot_end(found_at: DateTime<Utc>, every: u8, offset: FixedOffset) -> Option<DateTime<Utc>> {
    let every = u32::from(every.clamp(1, 24));
    let local = found_at.with_timezone(&offset);
    let end_hour = (local.hour() / every + 1) * every;
    let midnight = offset
        .from_local_datetime(&local.date_naive().and_hms_opt(0, 0, 0)?)
        .single()?;
    Some((midnight + chrono::Duration::hours(i64::from(end_hour))).with_timezone(&Utc))
}

/// One summary per slot that found new stories, newest headlines first.
fn plan_hours(
    source: &str,
    name: &str,
    entry: &SourceLedger,
    every: u8,
    offset: FixedOffset,
    language: Language,
    now: DateTime<Utc>,
) -> Vec<PlannedNotification> {
    let mut slots: BTreeMap<DateTime<Utc>, Vec<&Fresh>> = BTreeMap::new();
    for fresh in &entry.fresh {
        if let Some(end) = slot_end(fresh.found_at, every, offset)
            && still_deliverable(end, now)
        {
            slots.entry(end).or_default().push(fresh);
        }
    }
    slots
        .into_iter()
        .map(|(end, stories)| {
            // Found later is newer; within one fetch the feed's own order is.
            let mut newest: Vec<&Fresh> = stories.clone();
            newest.sort_by_key(|fresh| std::cmp::Reverse(fresh.found_at));
            let title = match (stories.len(), language) {
                (1, _) => name.to_owned(),
                (n, Language::Ne) => format!("{name} · {} नयाँ समाचार", nepali_digits(n)),
                (n, Language::En) => format!("{name} · {n} new stories"),
            };
            PlannedNotification {
                id: format!("sajilo.news.hours.{source}.{}", end.timestamp()),
                kind: ReminderKind::News,
                title,
                body: newest
                    .iter()
                    .take(DAILY_TOP)
                    .map(|fresh| fresh.title.as_str())
                    .collect::<Vec<_>>()
                    .join(" · "),
                fire_at: end,
            }
        })
        .collect()
}

fn daily_title(source: &str, name: &str, language: Language) -> String {
    match (source == NewsFollows::ALL, language) {
        (true, Language::Ne) => "आजका मुख्य समाचार".to_owned(),
        (true, Language::En) => "Today's top stories".to_owned(),
        (false, Language::Ne) => format!("{name} · आजका मुख्य समाचार"),
        (false, Language::En) => format!("{name} · today's top stories"),
    }
}

fn nepali_digits(n: usize) -> String {
    n.to_string()
        .chars()
        .map(|c| {
            c.to_digit(10)
                .map_or(c, |d| char::from_u32(0x0966 + d).unwrap_or(c))
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn at(minutes: i64) -> DateTime<Utc> {
        Utc.timestamp_opt(1_800_000_000 + minutes * 60, 0).unwrap()
    }

    #[test]
    fn a_new_follow_starts_from_what_is_there() {
        let mut ledger = SourceLedger::default();
        let found = advance(&mut ledger, true, &[("a", "A"), ("b", "B")], at(0));
        assert!(!found);
        assert!(ledger.fresh.is_empty());
        assert_eq!(ledger.seen, ["a", "b"]);
    }

    #[test]
    fn only_unseen_links_are_new() {
        let mut ledger = SourceLedger::default();
        advance(&mut ledger, true, &[("a", "A"), ("b", "B")], at(0));
        let found = advance(&mut ledger, false, &[("c", "C"), ("a", "A")], at(15));
        assert!(found);
        assert_eq!(ledger.fresh.len(), 1);
        assert_eq!(ledger.fresh[0].title, "C");
        assert_eq!(ledger.seen, ["c", "a", "b"]);
        // The same fetch again finds nothing.
        assert!(!advance(
            &mut ledger,
            false,
            &[("c", "C"), ("a", "A")],
            at(30)
        ));
    }

    #[test]
    fn stories_past_the_late_window_are_let_go() {
        let mut ledger = SourceLedger::default();
        advance(&mut ledger, true, &[("a", "A")], at(0));
        advance(&mut ledger, false, &[("b", "B"), ("a", "A")], at(10));
        advance(
            &mut ledger,
            false,
            &[("b", "B"), ("a", "A")],
            at(10 + 7 * 60),
        );
        assert!(ledger.fresh.is_empty());
    }

    #[test]
    fn stories_found_together_are_one_notification() {
        let mut ledger = SourceLedger::default();
        advance(&mut ledger, true, &[("a", "A")], at(0));
        advance(
            &mut ledger,
            false,
            &[("c", "C"), ("b", "B"), ("a", "A")],
            at(15),
        );
        advance(&mut ledger, false, &[("d", "D"), ("c", "C")], at(30));
        let planned = plan_each("kantipur", "Kantipur", &ledger, Language::En, at(31));
        assert_eq!(planned.len(), 2);
        assert_eq!(planned[0].title, "Kantipur · 2 new stories");
        assert_eq!(planned[0].body, "C");
        assert_eq!(planned[1].title, "Kantipur");
        assert_eq!(planned[1].body, "D");
        assert_ne!(planned[0].id, planned[1].id);
    }

    #[test]
    fn new_stories_wait_for_the_end_of_their_slot() {
        let nepal = FixedOffset::east_opt(5 * 3600 + 45 * 60).unwrap();
        let local = |h: u32, m: u32| {
            nepal
                .with_ymd_and_hms(2026, 11, 4, h, m, 0)
                .unwrap()
                .with_timezone(&Utc)
        };
        let fresh = |title: &str, found_at| Fresh {
            title: title.to_owned(),
            found_at,
        };
        let ledger = SourceLedger {
            seen: Vec::new(),
            fresh: vec![
                fresh("A", local(9, 10)),
                fresh("B", local(10, 40)),
                fresh("C", local(12, 5)),
            ],
        };
        let planned = plan_hours(
            "all",
            "News",
            &ledger,
            3,
            nepal,
            Language::En,
            local(12, 10),
        );
        assert_eq!(planned.len(), 2);
        assert_eq!(planned[0].fire_at, local(12, 0));
        assert_eq!(planned[0].title, "News · 2 new stories");
        assert_eq!(planned[0].body, "B · A");
        assert_eq!(planned[1].fire_at, local(15, 0));
        assert_eq!(planned[1].body, "C");
    }

    #[test]
    fn a_slot_can_end_at_midnight() {
        let nepal = FixedOffset::east_opt(5 * 3600 + 45 * 60).unwrap();
        let found = nepal.with_ymd_and_hms(2026, 11, 4, 23, 30, 0).unwrap();
        let end = slot_end(found.with_timezone(&Utc), 6, nepal).unwrap();
        assert_eq!(
            end,
            nepal
                .with_ymd_and_hms(2026, 11, 5, 0, 0, 0)
                .unwrap()
                .with_timezone(&Utc)
        );
    }

    #[test]
    fn the_seen_list_stays_bounded() {
        let mut ledger = SourceLedger::default();
        let links: Vec<String> = (0..SEEN_LIMIT + 50).map(|n| n.to_string()).collect();
        let items: Vec<(&str, &str)> = links.iter().map(|l| (l.as_str(), "t")).collect();
        advance(&mut ledger, true, &items, at(0));
        assert_eq!(ledger.seen.len(), SEEN_LIMIT);
    }
}
