//! The last good value for every feed, plus its health.
//!
//! The invariant this file exists to hold: **a failed refresh never blanks a
//! feed.** A value, once fetched, stays until something better replaces it. It
//! may be labelled stale, but it is never silently withdrawn — an empty card is
//! the one outcome the product forbids.

use std::collections::BTreeMap;
use std::path::Path;
use std::sync::RwLock;

use chrono::{DateTime, Utc};
use sajilo_api::bundle::ModuleKey;
use sajilo_api::meta::{FeedHealth, Health};
use serde::{Deserialize, Serialize};

/// One feed's stored value. The payload stays as opaque JSON so the cache does
/// not need a variant per module, and so a snapshot written by an older build
/// still loads when a DTO gains a field.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Entry {
    pub payload: serde_json::Value,
    /// When this value was fetched — not when it was last served.
    pub fetched_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct FeedState {
    pub entry: Option<Entry>,
    #[serde(default)]
    pub consecutive_failures: u32,
    #[serde(default)]
    pub last_error: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct Snapshot {
    /// Keyed by the module's wire spelling, so the file stays readable and
    /// survives a reordering of the `ModuleKey` enum.
    #[serde(default)]
    pub feeds: BTreeMap<String, FeedState>,
}

#[derive(Debug, Default)]
pub struct Cache {
    inner: RwLock<Snapshot>,
}

impl Cache {
    pub fn new() -> Self {
        Self::default()
    }

    /// Loads a snapshot written by a previous run. A missing or corrupt file is
    /// not an error — it means a cold start, which the scheduler fixes within
    /// one cycle.
    pub fn warm_start(path: &Path) -> Self {
        let snapshot = std::fs::read_to_string(path)
            .ok()
            .and_then(|raw| serde_json::from_str::<Snapshot>(&raw).ok())
            .unwrap_or_default();
        if !snapshot.feeds.is_empty() {
            tracing::info!(feeds = snapshot.feeds.len(), "warm-started from snapshot");
        }
        Self {
            inner: RwLock::new(snapshot),
        }
    }

    pub fn persist(&self, path: &Path) -> std::io::Result<()> {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let snapshot = self.read();
        let json = serde_json::to_vec_pretty(&*snapshot)
            .map_err(|error| std::io::Error::other(error.to_string()))?;
        drop(snapshot);

        // Written beside the target and renamed, so a crash mid-write cannot
        // leave a truncated snapshot that fails to load on the next boot.
        let temporary = path.with_extension("json.tmp");
        std::fs::write(&temporary, json)?;
        std::fs::rename(&temporary, path)
    }

    fn read(&self) -> std::sync::RwLockReadGuard<'_, Snapshot> {
        // A poisoned lock means a writer panicked mid-update. The stored value
        // is still readable and still the best answer available, so serving it
        // beats taking the whole server down.
        self.inner
            .read()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
    }

    fn write(&self) -> std::sync::RwLockWriteGuard<'_, Snapshot> {
        self.inner
            .write()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
    }

    /// Whether anything has ever been stored. Used to avoid overwriting a good
    /// snapshot with a cold one.
    pub fn is_empty(&self) -> bool {
        self.read()
            .feeds
            .values()
            .all(|state| state.entry.is_none())
    }

    pub fn entry(&self, module: ModuleKey) -> Option<Entry> {
        self.read().feeds.get(module.key())?.entry.clone()
    }

    /// Records a successful fetch, clearing the failure count.
    pub fn store<T: Serialize>(&self, module: ModuleKey, value: &T, fetched_at: DateTime<Utc>) {
        let Ok(payload) = serde_json::to_value(value) else {
            // Failing to serialise is a bug, not an upstream problem — but it
            // must not discard the value already held.
            tracing::error!(module = module.key(), "could not serialise payload");
            return;
        };
        let mut snapshot = self.write();
        let state = snapshot.feeds.entry(module.key().to_owned()).or_default();
        state.entry = Some(Entry {
            payload,
            fetched_at,
        });
        state.consecutive_failures = 0;
        state.last_error = None;
    }

    /// Records a failed refresh. **The previous value and its timestamp are
    /// left untouched** — that is the whole point of this method existing
    /// separately from `store`.
    pub fn record_failure(&self, module: ModuleKey, error: impl Into<String>) {
        let mut snapshot = self.write();
        let state = snapshot.feeds.entry(module.key().to_owned()).or_default();
        state.consecutive_failures = state.consecutive_failures.saturating_add(1);
        state.last_error = Some(error.into());
    }

    pub fn consecutive_failures(&self, module: ModuleKey) -> u32 {
        self.read()
            .feeds
            .get(module.key())
            .map_or(0, |state| state.consecutive_failures)
    }

    /// Per-feed liveness for `/v1/health`.
    pub fn health(&self) -> Health {
        let snapshot = self.read();
        Health {
            feeds: ModuleKey::ALL
                .into_iter()
                .map(|module| {
                    let state = snapshot.feeds.get(module.key());
                    FeedHealth {
                        module: module.key().to_owned(),
                        last_success: state
                            .and_then(|state| state.entry.as_ref())
                            .map(|entry| entry.fetched_at),
                        consecutive_failures: state.map_or(0, |state| state.consecutive_failures),
                    }
                })
                .collect(),
        }
    }
}
