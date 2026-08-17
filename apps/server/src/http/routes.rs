//! Every route serves the cache and nothing else. No handler here fetches.

use std::sync::Arc;

use axum::extract::{Path, Query, State};
use axum::http::{HeaderMap, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::routing::get;
use axum::{Json, Router};
use chrono::Utc;
use sajilo_api::bundle::{BundleResponse, ModuleKey};
use sajilo_api::load_state::LoadState;
use sajilo_api::meta::Meta;
use serde::Deserialize;
use serde_json::Value;

use crate::http::etag::json_with_etag;
use crate::state::AppState;

pub fn router(state: Arc<AppState>) -> Router {
    Router::new()
        .route("/v1/bundle", get(bundle))
        .route("/v1/radio/stations", get(radio_stations))
        .route("/v1/meta", get(meta))
        .route("/v1/health", get(health))
        // Unversioned and payload-free, for a load balancer that only wants to
        // know whether the process is up.
        .route("/healthz", get(|| async { "ok" }))
        .route("/v1/{module}", get(module_endpoint))
        .with_state(state)
}

#[derive(Debug, Default, Deserialize)]
struct BundleParams {
    /// Comma-separated module keys. Absent means every module.
    modules: Option<String>,
}

/// The module's cached value as a `LoadState`, which is what makes "we have
/// yesterday's number" a different thing from "we have nothing".
fn load_state(state: &AppState, module: ModuleKey) -> LoadState<Value> {
    let Some(entry) = state.cache.entry(module) else {
        // Never fetched successfully. Not an error — the scheduler may simply
        // not have reached its first cycle.
        return LoadState::Unavailable;
    };
    LoadState::from_cache(
        entry.payload,
        entry.fetched_at,
        state.config.max_age(module),
        Utc::now(),
    )
}

async fn bundle(
    State(state): State<Arc<AppState>>,
    Query(params): Query<BundleParams>,
    headers: HeaderMap,
) -> Response {
    let requested: Vec<ModuleKey> = match params.modules.as_deref() {
        None => ModuleKey::ALL.to_vec(),
        Some(raw) => raw
            .split(',')
            .map(str::trim)
            .filter(|key| !key.is_empty())
            .filter_map(ModuleKey::from_key)
            .collect(),
    };

    // An explicit list that names nothing recognisable is a client bug worth
    // reporting, not an empty bundle that looks like every feed is down.
    if requested.is_empty() {
        return (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({
                "error": "no recognised module in `modules`",
                "known": ModuleKey::ALL.map(ModuleKey::key),
            })),
        )
            .into_response();
    }

    let mut response = BundleResponse::default();
    for module in requested {
        let value = load_state(&state, module);
        // Each module is decoded back into its own type so the client sees the
        // real DTO shape rather than a bag of JSON.
        match module {
            ModuleKey::Weather => response.weather = Some(decode(value)),
            ModuleKey::Forex => response.forex = Some(decode(value)),
            ModuleKey::News => response.news = Some(decode(value)),
            ModuleKey::Metals => response.metals = Some(decode(value)),
            ModuleKey::Fuel => response.fuel = Some(decode(value)),
            ModuleKey::Vegetables => response.vegetables = Some(decode(value)),
            ModuleKey::Rashifal => response.rashifal = Some(decode(value)),
            ModuleKey::Radio => response.radio = Some(decode(value)),
        }
    }

    json_with_etag(&headers, &response)
}

/// A stored payload that no longer fits its DTO means the shape changed under a
/// snapshot written by an older build. Reporting that as `Failed` is honest;
/// serving half a struct is not.
fn decode<T: serde::de::DeserializeOwned>(state: LoadState<Value>) -> LoadState<T> {
    match state {
        LoadState::Fresh(value) => match serde_json::from_value(value) {
            Ok(decoded) => LoadState::Fresh(decoded),
            Err(error) => LoadState::Failed(error.to_string()),
        },
        LoadState::Stale(value) => match serde_json::from_value(value) {
            Ok(decoded) => LoadState::Stale(decoded),
            Err(error) => LoadState::Failed(error.to_string()),
        },
        LoadState::Loading => LoadState::Loading,
        LoadState::Unavailable => LoadState::Unavailable,
        LoadState::Failed(message) => LoadState::Failed(message),
    }
}

/// `/v1/forex`, `/v1/weather`, … — one module, for a client that wants only one.
async fn module_endpoint(
    State(state): State<Arc<AppState>>,
    Path(module): Path<String>,
    headers: HeaderMap,
) -> Response {
    let Some(module) = ModuleKey::from_key(&module) else {
        return StatusCode::NOT_FOUND.into_response();
    };
    json_with_etag(&headers, &load_state(&state, module))
}

/// Named separately from `/v1/radio` because the client asks for the station
/// list specifically, and the streams are played direct rather than proxied.
async fn radio_stations(State(state): State<Arc<AppState>>, headers: HeaderMap) -> Response {
    json_with_etag(&headers, &load_state(&state, ModuleKey::Radio))
}

async fn meta(State(state): State<Arc<AppState>>, headers: HeaderMap) -> Response {
    json_with_etag(
        &headers,
        &Meta {
            min_client_version: state.config.min_client_version.clone(),
            notice: state.config.notice.clone(),
        },
    )
}

/// Deliberately un-cached: a monitor asking whether a feed is stuck must not be
/// handed a 304 describing how things were an hour ago.
async fn health(State(state): State<Arc<AppState>>) -> Response {
    Json(state.cache.health()).into_response()
}
