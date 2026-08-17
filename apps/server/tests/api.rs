//! The server's contract with its clients. No test here touches the network:
//! the scheduler's only route upstream is `FeedSource`, and these swap in a
//! counting fake.

use std::sync::Arc;
use std::sync::atomic::{AtomicUsize, Ordering};

use axum::body::Body;
use axum::http::{Request, StatusCode, header};
use chrono::{DateTime, Duration, Utc};
use sajilo_api::bundle::ModuleKey;
use sajilo_server::refresh::{BoxFuture, FeedSource};
use sajilo_server::{AppState, Cache, Config, http, refresh};
use serde_json::{Value, json};
use tower::ServiceExt;

/// Counts every upstream fetch, so a test can assert the request path never
/// causes one.
#[derive(Default)]
struct CountingFeeds {
    calls: AtomicUsize,
    fail: bool,
}

impl CountingFeeds {
    fn calls(&self) -> usize {
        self.calls.load(Ordering::SeqCst)
    }
}

impl FeedSource for CountingFeeds {
    fn fetch(
        &self,
        module: ModuleKey,
        _now: DateTime<Utc>,
    ) -> BoxFuture<'_, Result<Value, String>> {
        self.calls.fetch_add(1, Ordering::SeqCst);
        let fail = self.fail;
        let key = module.key();
        Box::pin(async move {
            if fail {
                Err(format!("{key} is down"))
            } else {
                Ok(json!({ "module": key }))
            }
        })
    }
}

fn app(cache: Arc<Cache>) -> axum::Router {
    http::router(Arc::new(AppState {
        cache,
        config: Arc::new(Config::default()),
    }))
}

async fn get(app: &axum::Router, uri: &str) -> (StatusCode, Option<String>, Value) {
    request(app, uri, None).await
}

async fn request(
    app: &axum::Router,
    uri: &str,
    if_none_match: Option<&str>,
) -> (StatusCode, Option<String>, Value) {
    let mut builder = Request::builder().uri(uri);
    if let Some(etag) = if_none_match {
        builder = builder.header(header::IF_NONE_MATCH, etag);
    }
    let response = app
        .clone()
        .oneshot(builder.body(Body::empty()).unwrap())
        .await
        .unwrap();

    let status = response.status();
    let etag = response
        .headers()
        .get(header::ETAG)
        .and_then(|v| v.to_str().ok())
        .map(str::to_owned);
    let bytes = axum::body::to_bytes(response.into_body(), usize::MAX)
        .await
        .unwrap();
    let body = serde_json::from_slice(&bytes).unwrap_or(Value::Null);
    (status, etag, body)
}

fn warm_cache() -> Arc<Cache> {
    let cache = Arc::new(Cache::new());
    for module in ModuleKey::ALL {
        cache.store(module, &json!({ "module": module.key() }), Utc::now());
    }
    cache
}

/// M3's headline acceptance criterion: upstream traffic is a function of the
/// cadence table and nothing else.
#[tokio::test]
async fn a_client_request_never_triggers_an_upstream_fetch() {
    let feeds = Arc::new(CountingFeeds::default());
    let cache = warm_cache();
    let app = app(cache.clone());

    let before = feeds.calls();
    for _ in 0..25 {
        let (status, _, _) = get(&app, "/v1/bundle").await;
        assert_eq!(status, StatusCode::OK);
        get(&app, "/v1/forex").await;
        get(&app, "/v1/health").await;
    }
    assert_eq!(feeds.calls(), before, "serving must not fetch");
}

#[tokio::test]
async fn the_scheduler_is_the_only_thing_that_fetches() {
    let feeds = Arc::new(CountingFeeds::default());
    let cache = Arc::new(Cache::new());
    let config = Config::default();

    refresh::refresh_once(ModuleKey::Forex, 0, feeds.as_ref(), &cache, &config).await;
    assert_eq!(feeds.calls(), 1);
    assert!(cache.entry(ModuleKey::Forex).is_some());
}

#[tokio::test]
async fn a_repeat_request_with_if_none_match_returns_304() {
    let app = app(warm_cache());

    let (status, etag, _) = get(&app, "/v1/bundle").await;
    assert_eq!(status, StatusCode::OK);
    let etag = etag.expect("responses carry an ETag");

    let (status, _, _) = request(&app, "/v1/bundle", Some(&etag)).await;
    assert_eq!(status, StatusCode::NOT_MODIFIED);

    // A different tag still gets the payload.
    let (status, _, _) = request(&app, "/v1/bundle", Some("\"something-else\"")).await;
    assert_eq!(status, StatusCode::OK);
}

/// A cache may mark the entry weak on its way through, and the header may carry
/// a list.
#[tokio::test]
async fn the_etag_comparison_tolerates_weak_and_listed_tags() {
    let app = app(warm_cache());
    let (_, etag, _) = get(&app, "/v1/meta").await;
    let etag = etag.unwrap();

    for candidate in [
        format!("W/{etag}"),
        format!("\"other\", {etag}"),
        "*".to_owned(),
    ] {
        let (status, _, _) = request(&app, "/v1/meta", Some(&candidate)).await;
        assert_eq!(status, StatusCode::NOT_MODIFIED, "{candidate}");
    }
}

#[tokio::test]
async fn the_bundle_returns_only_the_requested_modules() {
    let app = app(warm_cache());

    let (status, _, body) = get(&app, "/v1/bundle?modules=forex,news").await;
    assert_eq!(status, StatusCode::OK);
    assert!(!body["forex"].is_null());
    assert!(!body["news"].is_null());
    // Not asked for, so absent — distinct from asked-for-and-unavailable.
    assert!(body["weather"].is_null());
    assert!(body["radio"].is_null());

    let (_, _, all) = get(&app, "/v1/bundle").await;
    for module in ModuleKey::ALL {
        assert!(!all[module.key()].is_null(), "{} missing", module.key());
    }
}

/// An explicit list naming nothing recognisable is a client bug worth
/// reporting, not an empty bundle that looks like every feed is down.
#[tokio::test]
async fn an_unrecognised_module_list_is_rejected() {
    let app = app(warm_cache());
    let (status, _, body) = get(&app, "/v1/bundle?modules=stocks,horoscope").await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
    assert!(body["known"].is_array());
}

/// Never fetched is `unavailable`, never a blank card.
#[tokio::test]
async fn an_unfetched_module_reports_unavailable() {
    let app = app(Arc::new(Cache::new()));
    let (status, _, body) = get(&app, "/v1/bundle?modules=forex").await;

    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["forex"]["status"], "unavailable");
}

/// Past twice its refresh interval a value is labelled, not withdrawn.
#[tokio::test]
async fn an_old_value_is_served_as_stale() {
    let cache = Arc::new(Cache::new());
    let config = Config::default();
    let old = Utc::now() - Duration::seconds(config.max_age(ModuleKey::Forex) + 60);
    cache.store(ModuleKey::Forex, &json!({ "module": "forex" }), old);

    let app = app(cache);
    let (_, _, body) = get(&app, "/v1/forex").await;
    assert_eq!(body["status"], "stale");
    assert!(!body["value"].is_null(), "stale still carries the value");
}

#[tokio::test]
async fn meta_reports_the_minimum_client_version() {
    let app = app(warm_cache());
    let (status, _, body) = get(&app, "/v1/meta").await;
    assert_eq!(status, StatusCode::OK);
    assert!(
        !body["minClientVersion"]
            .as_str()
            .unwrap_or_default()
            .is_empty()
    );
}

#[tokio::test]
async fn health_reports_every_feed() {
    let cache = warm_cache();
    cache.record_failure(ModuleKey::News, "upstream down");

    let app = app(cache);
    let (status, _, body) = get(&app, "/v1/health").await;
    assert_eq!(status, StatusCode::OK);

    let feeds = body["feeds"].as_array().expect("feeds is a list");
    assert_eq!(feeds.len(), ModuleKey::ALL.len());

    let news = feeds
        .iter()
        .find(|feed| feed["module"] == "news")
        .expect("news is reported");
    assert_eq!(news["consecutiveFailures"], 1);
    assert!(
        !news["lastSuccess"].is_null(),
        "the earlier success is kept"
    );
}

#[tokio::test]
async fn unknown_routes_are_not_found() {
    let app = app(warm_cache());
    let (status, _, _) = get(&app, "/v1/stocks").await;
    assert_eq!(status, StatusCode::NOT_FOUND);
}

#[tokio::test]
async fn healthz_is_payload_free() {
    let app = app(warm_cache());
    let response = app
        .oneshot(
            Request::builder()
                .uri("/healthz")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
}
