//! Keeps the remote config current: fetch, verify, install, remember.
//!
//! The app always runs on *something*: the packs compiled in, replaced by
//! the last verified remote copy as soon as it is restored from disk at
//! launch. A check fetches one small signed manifest — usually answered with
//! a `304` — and downloads only the packs whose hash changed. Every failure
//! (offline, bad signature, wrong hash, too big, invalid content) keeps what
//! is already installed and is recorded for the System tab; none of them
//! can leave the app worse off than the build it shipped as.
//!
//! The files are static and served free from Cloudflare (`apps/config`), so
//! there is no API to protect: copying them gets anyone a list of jokes.

use std::collections::BTreeMap;
use std::future::Future;

use chrono::{DateTime, Utc};
use sajilo_api::remote_config::{PackSource, PackStatus, RemoteConfigStatus};
use sajilo_config::{Manifest, PackInfo, TrustError};
use sajilo_providers::http::Conditional;
use sajilo_providers::{HttpClient, ProviderError};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, Wry};
use tokio::sync::Mutex;

use crate::db;

/// Where the signed files live: a static-assets-only Worker, free and
/// unmetered on Cloudflare's free plan.
const CONFIG_HOST: &str = "https://config.sajilo.fyi/";
const STORE_KEY: &str = "remoteConfig.v1";
const SOURCE_NAME: &str = "Sajilo config";
/// How often the manifest is checked, give or take a fifth so a release
/// doesn't line every client up on the same minute. Hourly: an unchanged
/// manifest is a ~200-byte 304 from a free static host, and a holiday the
/// government announces today should reach people within the hour.
const CHECK_EVERY_SECS: i64 = 60 * 60;
/// After a failed check, try again sooner.
const RETRY_AFTER_FAILURE_SECS: i64 = 15 * 60;
pub const CHANGED_EVENT: &str = "sajilo://config-changed";

/// What survives a restart.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
struct Stored {
    rev: Option<u64>,
    etag: Option<String>,
    packs: BTreeMap<String, StoredPack>,
    checked_at: Option<DateTime<Utc>>,
    next_check_at: Option<DateTime<Utc>>,
    error: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
struct StoredPack {
    schema: u32,
    sha256: String,
    json: String,
}

/// One check at a time: the scheduler and a "check now" must not race.
#[derive(Default)]
pub struct RemoteConfig {
    lock: Mutex<()>,
    client: HttpClient,
}

fn host() -> String {
    // A debug build can point at `wrangler dev` to test a publish locally.
    // Signatures are checked either way.
    if cfg!(debug_assertions)
        && let Ok(host) = std::env::var("SAJILO_CONFIG_HOST")
    {
        return if host.ends_with('/') {
            host
        } else {
            format!("{host}/")
        };
    }
    CONFIG_HOST.to_owned()
}

fn load(app: &AppHandle<Wry>) -> Stored {
    db::get_json(app, STORE_KEY)
        .ok()
        .flatten()
        .and_then(|value| serde_json::from_value(value).ok())
        .unwrap_or_default()
}

fn save(app: &AppHandle<Wry>, stored: &Stored) {
    if let Ok(value) = serde_json::to_value(stored) {
        let _ = db::set_json(app, STORE_KEY, &value);
    }
}

/// Installs every stored pack this build still reads. Called at launch,
/// before any screen asks for a joke or a holiday.
pub fn restore(app: &AppHandle<Wry>) {
    let stored = load(app);
    install_stored(&stored);
}

fn install_stored(stored: &Stored) {
    for (name, pack) in &stored.packs {
        let Some(info) = sajilo_config::pack(name) else {
            continue;
        };
        if info.schema != pack.schema {
            continue;
        }
        // Verified when it was stored; validated again because this build's
        // bounds may be stricter than the one that stored it.
        if let Err(error) = (info.install)(&pack.json) {
            eprintln!("sajilo: stored config pack {name} no longer installs: {error}");
        }
    }
}

/// What one check needs from the network, so the logic can be tested with
/// files instead of a server.
pub trait Fetch {
    fn manifest(
        &self,
        url: String,
        etag: Option<String>,
    ) -> impl Future<Output = Result<Conditional, String>> + Send;
    fn pack(&self, url: String) -> impl Future<Output = Result<Vec<u8>, String>> + Send;
}

impl Fetch for HttpClient {
    async fn manifest(&self, url: String, etag: Option<String>) -> Result<Conditional, String> {
        self.get_conditional(
            SOURCE_NAME,
            &url,
            etag.as_deref(),
            sajilo_config::MANIFEST_MAX_BYTES,
        )
        .await
        .map_err(|error: ProviderError| error.to_string())
    }

    async fn pack(&self, url: String) -> Result<Vec<u8>, String> {
        match self
            .get_conditional(SOURCE_NAME, &url, None, sajilo_config::PACK_MAX_BYTES)
            .await
        {
            Ok(Conditional::Body { bytes, .. }) => Ok(bytes),
            Ok(Conditional::NotModified) => Err("a pack answered 304".to_owned()),
            Err(error) => Err(error.to_string()),
        }
    }
}

/// What a check did.
#[derive(Debug, Default, PartialEq, Eq)]
pub struct Outcome {
    /// Packs newly installed.
    pub installed: Vec<&'static str>,
    pub error: Option<String>,
}

/// One check against `host`, updating `stored`. Installs packs as it goes;
/// the caller persists `stored` afterwards.
async fn check(
    fetch: &impl Fetch,
    host: &str,
    stored: &mut Stored,
    app_version: &str,
    keys: &[&str],
    now: DateTime<Utc>,
) -> Outcome {
    stored.checked_at = Some(now);
    let mut outcome = Outcome::default();
    let manifest_url = format!("{host}{}", sajilo_config::MANIFEST_PATH);
    let body = match fetch.manifest(manifest_url, stored.etag.clone()).await {
        Ok(Conditional::NotModified) => {
            stored.error = None;
            return outcome;
        }
        Ok(Conditional::Body { bytes, etag }) => (bytes, etag),
        Err(error) => {
            outcome.error = Some(error);
            return outcome;
        }
    };
    let (bytes, etag) = body;
    let manifest: Manifest = match sajilo_config::open(&bytes, keys)
        .and_then(|manifest| sajilo_config::check_rev(&manifest, stored.rev).map(|()| manifest))
    {
        Ok(manifest) => manifest,
        Err(error) => {
            outcome.error = Some(error.to_string());
            return outcome;
        }
    };

    let base = format!(
        "{host}{}",
        sajilo_config::MANIFEST_PATH
            .rsplit_once('/')
            .map_or("", |(dir, _)| dir)
    );
    let mut failures = Vec::new();
    for (info, entry) in sajilo_config::select(&manifest, app_version) {
        let unchanged = stored
            .packs
            .get(info.name)
            .is_some_and(|pack| pack.sha256 == entry.sha256 && pack.schema == entry.schema);
        if unchanged {
            continue;
        }
        match fetch_pack(fetch, &base, info, entry).await {
            Ok(json) => {
                stored.packs.insert(
                    info.name.to_owned(),
                    StoredPack {
                        schema: entry.schema,
                        sha256: entry.sha256.clone(),
                        json,
                    },
                );
                outcome.installed.push(info.name);
            }
            Err(error) => failures.push(error),
        }
    }

    stored.rev = Some(manifest.rev);
    if failures.is_empty() {
        // Only a complete apply earns the ETag: after a partial one, the
        // next check must download the manifest again to retry the rest.
        stored.etag = etag;
        stored.error = None;
    } else {
        stored.etag = None;
        outcome.error = Some(failures.join("; "));
    }
    outcome
}

async fn fetch_pack(
    fetch: &impl Fetch,
    base: &str,
    info: &'static PackInfo,
    entry: &sajilo_config::PackEntry,
) -> Result<String, String> {
    let bytes = fetch.pack(format!("{base}/{}", entry.path)).await?;
    sajilo_config::check_pack(info.name, entry, &bytes).map_err(|e: TrustError| e.to_string())?;
    let json = String::from_utf8(bytes).map_err(|_| format!("{}: not UTF-8", info.name))?;
    (info.install)(&json).map_err(|error| error.to_string())?;
    Ok(json)
}

fn jitter(now: DateTime<Utc>, secs: i64) -> i64 {
    // ±20%, from the clock: enough to spread clients, no RNG needed.
    let spread = secs / 5;
    let offset = i64::from(now.timestamp_subsec_nanos()) % (2 * spread + 1) - spread;
    secs + offset
}

/// Checks for new config if one is due (or `force`), installs what changed,
/// and tells the screens.
pub async fn refresh(app: &AppHandle<Wry>, force: bool) {
    let state = app.state::<RemoteConfig>();
    let _guard = state.lock.lock().await;
    let now = Utc::now();
    let mut stored = load(app);
    if !force && stored.next_check_at.is_some_and(|next| now < next) {
        return;
    }
    let version = app.package_info().version.to_string();
    let outcome = check(
        &state.client,
        &host(),
        &mut stored,
        &version,
        sajilo_config::keys::PUBLIC_KEYS,
        now,
    )
    .await;
    if let Some(error) = &outcome.error {
        eprintln!("sajilo: config check: {error}");
    }
    let wait = if outcome.error.is_some() {
        RETRY_AFTER_FAILURE_SECS
    } else {
        jitter(now, CHECK_EVERY_SECS)
    };
    stored.next_check_at = Some(now + chrono::Duration::seconds(wait));
    stored.error.clone_from(&outcome.error);
    save(app, &stored);
    if !outcome.installed.is_empty() {
        let _ = app.emit(CHANGED_EVENT, &outcome.installed);
    }
}

fn status(stored: &Stored) -> RemoteConfigStatus {
    RemoteConfigStatus {
        rev: stored.rev,
        checked_at: stored.checked_at,
        error: stored.error.clone(),
        packs: sajilo_config::packs()
            .iter()
            .map(|info| PackStatus {
                name: info.name.to_owned(),
                source: if stored
                    .packs
                    .get(info.name)
                    .is_some_and(|pack| pack.schema == info.schema)
                {
                    PackSource::Remote
                } else {
                    PackSource::Bundled
                },
            })
            .collect(),
    }
}

#[tauri::command]
pub fn remote_config_status(app: AppHandle<Wry>) -> RemoteConfigStatus {
    status(&load(&app))
}

/// Checks now, whatever the schedule says.
#[tauri::command]
pub async fn check_remote_config(app: AppHandle<Wry>) -> RemoteConfigStatus {
    refresh(&app, true).await;
    status(&load(&app))
}

#[tauri::command]
pub fn config_directory() -> sajilo_api::remote_config::DirectoryResponse {
    use sajilo_core::config::Pack;
    sajilo_api::remote_config::DirectoryResponse {
        directory: (*sajilo_core::config::directory::DirectoryPack::active()).clone(),
    }
}

#[cfg(test)]
mod tests {
    //! Built from a real publish: `config-publish build` signed with the
    //! fixture key, so these exercise the same bytes a client downloads.

    use std::collections::HashMap;
    use std::io::Cursor;
    use std::sync::Mutex as StdMutex;

    use base64::Engine;
    use base64::engine::general_purpose::STANDARD as BASE64;
    use sajilo_config::{Envelope, FORMAT, PackEntry, sha256_hex};
    use sajilo_core::config::Pack;
    use sajilo_core::config::jokes::JokesPack;

    use super::*;

    const HOST: &str = "https://config.test/";

    /// The packs are process-wide; tests that install must not interleave.
    static SERIAL: StdMutex<()> = StdMutex::new(());

    #[derive(Default)]
    struct Host {
        files: HashMap<String, Vec<u8>>,
        etag: Option<String>,
        manifest_hits: StdMutex<u32>,
        pack_hits: StdMutex<u32>,
    }

    impl Fetch for Host {
        async fn manifest(&self, url: String, etag: Option<String>) -> Result<Conditional, String> {
            *self.manifest_hits.lock().unwrap() += 1;
            if etag.is_some() && etag == self.etag {
                return Ok(Conditional::NotModified);
            }
            let bytes = self.files.get(&url).cloned().ok_or("offline")?;
            Ok(Conditional::Body {
                bytes,
                etag: self.etag.clone(),
            })
        }

        async fn pack(&self, url: String) -> Result<Vec<u8>, String> {
            *self.pack_hits.lock().unwrap() += 1;
            self.files
                .get(&url)
                .cloned()
                .ok_or_else(|| "404".to_owned())
        }
    }

    fn test_key() -> (minisign::SecretKey, String) {
        static KEY: std::sync::OnceLock<(minisign::SecretKey, String)> = std::sync::OnceLock::new();
        KEY.get_or_init(|| {
            let text = std::fs::read_to_string(concat!(
                env!("CARGO_MANIFEST_DIR"),
                "/../../../fixtures/config/test-key/sajilo-config.key"
            ))
            .unwrap();
            let secret = minisign::SecretKeyBox::from_string(&text)
                .unwrap()
                .into_secret_key(Some("sajilo-test".to_owned()))
                .unwrap();
            let public = minisign::PublicKey::from_secret_key(&secret)
                .unwrap()
                .to_base64();
            (secret, public)
        })
        .clone()
    }

    /// A publish of `packs` at `rev`, as files on a host.
    fn publish(rev: u64, packs: &[(&str, &str)]) -> Host {
        let mut files = HashMap::new();
        let mut manifest = Manifest {
            format: FORMAT,
            rev,
            packs: BTreeMap::new(),
        };
        for (name, json) in packs {
            let sha256 = sha256_hex(json.as_bytes());
            let path = format!("packs/{name}.1.{}.json", &sha256[..12]);
            files.insert(format!("{HOST}v1/{path}"), json.as_bytes().to_vec());
            manifest.packs.insert(
                (*name).to_owned(),
                vec![PackEntry {
                    schema: 1,
                    sha256,
                    size: json.len(),
                    path,
                    min_app: None,
                    max_app: None,
                }],
            );
        }
        let payload = serde_json::to_vec(&manifest).unwrap();
        let (secret, _) = test_key();
        let signature = minisign::sign(None, &secret, Cursor::new(&payload), None, None).unwrap();
        let envelope = Envelope {
            payload: BASE64.encode(&payload),
            signature: signature.into_string(),
        };
        files.insert(
            format!("{HOST}v1/manifest.json"),
            serde_json::to_vec(&envelope).unwrap(),
        );
        Host {
            files,
            etag: Some(format!("\"rev-{rev}\"")),
            ..Host::default()
        }
    }

    fn jokes_with_eyes(first: &str) -> String {
        let mut pack: serde_json::Value = serde_json::from_str(JokesPack::bundled_json()).unwrap();
        pack["decks"]["eyes"][0]["en"] = first.into();
        pack.to_string()
    }

    fn run<T>(future: impl Future<Output = T>) -> T {
        tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap()
            .block_on(future)
    }

    fn first_eyes_line() -> String {
        JokesPack::active().deck("eyes")[0].en.clone()
    }

    #[test]
    fn a_publish_installs_and_a_repeat_check_is_a_304() {
        let _serial = SERIAL
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        let (_, public) = test_key();
        let jokes = jokes_with_eyes("Look away, remotely.");
        let host = publish(5, &[("jokes", &jokes)]);
        let mut stored = Stored::default();

        let outcome = run(check(
            &host,
            HOST,
            &mut stored,
            "0.1.40",
            &[&public],
            Utc::now(),
        ));
        assert_eq!(
            outcome,
            Outcome {
                installed: vec!["jokes"],
                error: None
            }
        );
        assert_eq!(first_eyes_line(), "Look away, remotely.");
        assert_eq!(stored.rev, Some(5));
        assert_eq!(stored.etag.as_deref(), Some("\"rev-5\""));

        // Same publish again: one 304, no pack downloads.
        let outcome = run(check(
            &host,
            HOST,
            &mut stored,
            "0.1.40",
            &[&public],
            Utc::now(),
        ));
        assert_eq!(outcome, Outcome::default());
        assert_eq!(*host.pack_hits.lock().unwrap(), 1);

        // A restart restores it from the store, before any network.
        JokesPack::reset();
        install_stored(&stored);
        assert_eq!(first_eyes_line(), "Look away, remotely.");
        JokesPack::reset();
    }

    #[test]
    fn a_manifest_signed_by_an_unknown_key_changes_nothing() {
        let _serial = SERIAL
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        JokesPack::reset();
        let before = first_eyes_line();
        let host = publish(5, &[("jokes", &jokes_with_eyes("Evil line."))]);
        let mut stored = Stored::default();
        let outcome = run(check(
            &host,
            HOST,
            &mut stored,
            "0.1.40",
            sajilo_config::keys::PUBLIC_KEYS,
            Utc::now(),
        ));
        assert!(outcome.error.unwrap().contains("signature"));
        assert_eq!(first_eyes_line(), before);
        assert_eq!(stored.rev, None);
        assert_eq!(*host.pack_hits.lock().unwrap(), 0);
    }

    #[test]
    fn an_older_publish_is_refused() {
        let _serial = SERIAL
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        let (_, public) = test_key();
        let mut stored = Stored {
            rev: Some(9),
            ..Stored::default()
        };
        let host = publish(5, &[("jokes", &jokes_with_eyes("Old line."))]);
        let outcome = run(check(
            &host,
            HOST,
            &mut stored,
            "0.1.40",
            &[&public],
            Utc::now(),
        ));
        assert!(outcome.error.unwrap().contains("older"));
        assert_eq!(stored.rev, Some(9));
        assert_ne!(first_eyes_line(), "Old line.");
    }

    #[test]
    fn a_tampered_pack_or_invalid_content_keeps_the_installed_copy() {
        let _serial = SERIAL
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        JokesPack::reset();
        let (_, public) = test_key();
        let before = first_eyes_line();

        // Swapped bytes behind a valid manifest.
        let mut host = publish(6, &[("jokes", &jokes_with_eyes("Fine line."))]);
        let pack_url = host
            .files
            .keys()
            .find(|url| url.contains("/packs/"))
            .unwrap()
            .clone();
        host.files
            .insert(pack_url, jokes_with_eyes("Swapped line.").into_bytes());
        let mut stored = Stored::default();
        let outcome = run(check(
            &host,
            HOST,
            &mut stored,
            "0.1.40",
            &[&public],
            Utc::now(),
        ));
        assert!(outcome.error.unwrap().contains("hash"));
        assert_eq!(first_eyes_line(), before);
        assert_eq!(stored.etag, None, "a partial apply retries next time");

        // Correctly signed and hashed, but out of bounds.
        let long = "x".repeat(200);
        let host = publish(7, &[("jokes", &jokes_with_eyes(&long))]);
        let outcome = run(check(
            &host,
            HOST,
            &mut stored,
            "0.1.40",
            &[&public],
            Utc::now(),
        ));
        assert!(outcome.error.is_some());
        assert_eq!(first_eyes_line(), before);
        assert!(!stored.packs.contains_key("jokes"));
    }

    #[test]
    fn offline_is_an_error_not_a_change() {
        let _serial = SERIAL
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        let (_, public) = test_key();
        let host = Host::default();
        let mut stored = Stored::default();
        let outcome = run(check(
            &host,
            HOST,
            &mut stored,
            "0.1.40",
            &[&public],
            Utc::now(),
        ));
        assert_eq!(outcome.error.as_deref(), Some("offline"));
        assert!(stored.checked_at.is_some());
        assert_eq!(
            status(&stored)
                .packs
                .iter()
                .filter(|p| p.source == PackSource::Remote)
                .count(),
            0
        );
    }

    #[test]
    fn jitter_stays_within_a_fifth() {
        for nanos in [0, 1, 999_999_999] {
            let now = DateTime::from_timestamp(1_759_651_200, nanos).unwrap();
            let wait = jitter(now, CHECK_EVERY_SECS);
            assert!((CHECK_EVERY_SECS * 4 / 5..=CHECK_EVERY_SECS * 6 / 5).contains(&wait));
        }
    }
}
