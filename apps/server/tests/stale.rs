//! The one rule this server exists to hold: **a failed refresh never blanks a
//! feed.** A value, once fetched, stays until something better replaces it.

use std::sync::Arc;
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::time::Duration;

use chrono::{DateTime, Utc};
use sajilo_api::bundle::ModuleKey;
use sajilo_server::refresh::{BoxFuture, FeedSource, backoff};
use sajilo_server::{Cache, Config, refresh};
use serde_json::{Value, json};

/// Succeeds until `broken` is set, then fails — the shape of a source that goes
/// down mid-session.
#[derive(Default)]
struct FlakyFeeds {
    broken: AtomicBool,
    calls: AtomicUsize,
}

impl FeedSource for FlakyFeeds {
    fn fetch(
        &self,
        module: ModuleKey,
        _now: DateTime<Utc>,
    ) -> BoxFuture<'_, Result<Value, String>> {
        self.calls.fetch_add(1, Ordering::SeqCst);
        let broken = self.broken.load(Ordering::SeqCst);
        let key = module.key();
        Box::pin(async move {
            if broken {
                Err(format!("{key} is down"))
            } else {
                Ok(json!({ "module": key, "value": "good" }))
            }
        })
    }
}

#[tokio::test]
async fn a_failed_refresh_keeps_the_previous_value_and_its_timestamp() {
    let feeds = FlakyFeeds::default();
    let cache = Cache::new();
    let config = Config::default();

    refresh::refresh_once(ModuleKey::Forex, 0, &feeds, &cache, &config).await;
    let good = cache
        .entry(ModuleKey::Forex)
        .expect("the first fetch stored");

    feeds.broken.store(true, Ordering::SeqCst);
    for _ in 0..5 {
        refresh::refresh_once(ModuleKey::Forex, 0, &feeds, &cache, &config).await;
    }

    let after = cache.entry(ModuleKey::Forex).expect("the value survives");
    assert_eq!(after.payload, good.payload, "the value must not change");
    assert_eq!(
        after.fetched_at, good.fetched_at,
        "the timestamp must keep pointing at the last real fetch, not the failure"
    );
    assert_eq!(cache.consecutive_failures(ModuleKey::Forex), 5);
}

/// The failure count is what `/v1/health` and the backoff both read, so it must
/// clear the moment the source returns.
#[tokio::test]
async fn recovery_clears_the_failure_count() {
    let feeds = FlakyFeeds::default();
    let cache = Cache::new();
    let config = Config::default();

    feeds.broken.store(true, Ordering::SeqCst);
    for _ in 0..3 {
        refresh::refresh_once(ModuleKey::News, 0, &feeds, &cache, &config).await;
    }
    assert_eq!(cache.consecutive_failures(ModuleKey::News), 3);
    // Never fetched successfully, so there is genuinely nothing to serve.
    assert!(cache.entry(ModuleKey::News).is_none());

    feeds.broken.store(false, Ordering::SeqCst);
    refresh::refresh_once(ModuleKey::News, 0, &feeds, &cache, &config).await;

    assert_eq!(cache.consecutive_failures(ModuleKey::News), 0);
    assert!(cache.entry(ModuleKey::News).is_some());
}

/// Every source is a small public service run by someone else. Retrying a
/// failing feed on a tight loop is the difference between reading a source and
/// hammering it.
#[test]
fn the_backoff_grows_and_is_capped() {
    assert_eq!(backoff::delay(0), Duration::ZERO);

    let first = backoff::delay(1);
    let second = backoff::delay(2);
    let third = backoff::delay(3);
    assert!(first > Duration::ZERO);
    assert!(second > first, "it must grow");
    assert!(third > second);

    // A long outage must not overflow into a tiny delay.
    let capped = backoff::delay(u32::MAX);
    assert!(capped >= third);
    assert_eq!(capped, backoff::delay(64), "both are at the cap");
    assert!(capped <= Duration::from_secs(30 * 60));
}

/// Eight feeds whose intervals share a factor must not all fire in the same
/// second.
#[test]
fn the_jitter_spreads_the_feeds_apart() {
    let interval = Duration::from_secs(6 * 3600);
    let delays: Vec<Duration> = (0..8).map(|i| backoff::jitter(interval, i)).collect();

    assert!(delays.iter().all(|d| *d >= interval), "never fires early");
    assert!(
        delays.iter().all(|d| *d <= interval + interval / 10),
        "and never drifts more than 10%"
    );
    let unique: std::collections::HashSet<_> = delays.iter().collect();
    assert!(unique.len() > 1, "the feeds must not share one instant");

    // A short interval has no room to spread and must not divide by zero.
    assert_eq!(
        backoff::jitter(Duration::from_secs(5), 3),
        Duration::from_secs(5)
    );
}

/// A restart must not blank every feed for the length of one refresh cycle.
#[tokio::test]
async fn a_snapshot_survives_a_restart() {
    let directory = std::env::temp_dir().join(format!("sajilo-test-{}", std::process::id()));
    let path = directory.join("snapshot.json");
    let _ = std::fs::remove_dir_all(&directory);

    let feeds = FlakyFeeds::default();
    let config = Config::default();
    let before = Cache::new();
    refresh::refresh_once(ModuleKey::Fuel, 0, &feeds, &before, &config).await;
    before.persist(&path).expect("snapshot is written");

    let after = Cache::warm_start(&path);
    let restored = after.entry(ModuleKey::Fuel).expect("warm start restores");
    assert_eq!(
        restored.payload,
        before.entry(ModuleKey::Fuel).unwrap().payload
    );
    assert_eq!(
        restored.fetched_at,
        before.entry(ModuleKey::Fuel).unwrap().fetched_at,
        "a restored value keeps its original age, so it can still read as stale"
    );

    let _ = std::fs::remove_dir_all(&directory);
}

/// A missing or corrupt snapshot means a cold start, which the scheduler fixes
/// within one cycle — it is not a reason to refuse to boot.
#[tokio::test]
async fn a_corrupt_snapshot_is_a_cold_start_not_a_crash() {
    let directory = std::env::temp_dir().join(format!("sajilo-corrupt-{}", std::process::id()));
    std::fs::create_dir_all(&directory).unwrap();
    let path = directory.join("snapshot.json");
    std::fs::write(&path, b"{ not json").unwrap();

    let cache = Cache::warm_start(&path);
    assert!(cache.entry(ModuleKey::Forex).is_none());

    let missing = Cache::warm_start(&directory.join("absent.json"));
    assert!(missing.entry(ModuleKey::Forex).is_none());

    let _ = std::fs::remove_dir_all(&directory);
}

/// One feed going down must not disturb any other.
#[tokio::test]
async fn a_failing_feed_does_not_affect_its_neighbours() {
    let feeds = Arc::new(FlakyFeeds::default());
    let cache = Cache::new();
    let config = Config::default();

    for module in ModuleKey::ALL {
        refresh::refresh_once(module, 0, feeds.as_ref(), &cache, &config).await;
    }

    feeds.broken.store(true, Ordering::SeqCst);
    refresh::refresh_once(ModuleKey::News, 0, feeds.as_ref(), &cache, &config).await;

    assert_eq!(cache.consecutive_failures(ModuleKey::News), 1);
    for module in ModuleKey::ALL.into_iter().filter(|m| *m != ModuleKey::News) {
        assert_eq!(cache.consecutive_failures(module), 0, "{}", module.key());
        assert!(cache.entry(module).is_some(), "{}", module.key());
    }
}

/// A cold cache must never overwrite the good snapshot a previous run left
/// behind. Writing an empty file at boot — which is what an immediate first
/// interval tick used to do — destroys exactly the warm start it exists to
/// provide.
#[tokio::test]
async fn an_empty_cache_is_detectable_before_it_overwrites_a_good_snapshot() {
    let directory = std::env::temp_dir().join(format!("sajilo-empty-{}", std::process::id()));
    let path = directory.join("snapshot.json");
    let _ = std::fs::remove_dir_all(&directory);

    let cold = Cache::new();
    assert!(cold.is_empty(), "nothing has been fetched yet");

    // A warm one is not empty, and round-trips.
    let feeds = FlakyFeeds::default();
    let config = Config::default();
    let warm = Cache::new();
    refresh::refresh_once(ModuleKey::Fuel, 0, &feeds, &warm, &config).await;
    assert!(!warm.is_empty());
    warm.persist(&path).unwrap();

    // A cache that has only ever failed still counts as empty — there is no
    // value in it worth preserving over the good file on disk.
    let failed_only = Cache::new();
    failed_only.record_failure(ModuleKey::Fuel, "down");
    assert!(failed_only.is_empty());

    assert!(Cache::warm_start(&path).entry(ModuleKey::Fuel).is_some());
    let _ = std::fs::remove_dir_all(&directory);
}
