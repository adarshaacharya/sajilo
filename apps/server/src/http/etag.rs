//! Content-hash ETags.
//!
//! Most refreshes change nothing a client can see — fuel prices move a few
//! times a year. Hashing the response body means an unchanged bundle costs a
//! 304 and no payload, which matters for a popover that opens many times a day
//! on a phone tether.

use axum::http::{HeaderMap, StatusCode, header};
use axum::response::{IntoResponse, Response};

/// FNV-1a: a few lines, no dependency, and strong enough for change detection.
/// This is not a security boundary — an ETag only ever decides whether a client
/// already holds the same bytes.
fn hash(bytes: &[u8]) -> u64 {
    const OFFSET: u64 = 0xcbf2_9ce4_8422_2325;
    const PRIME: u64 = 0x100_0000_01b3;
    bytes.iter().fold(OFFSET, |hash, byte| {
        (hash ^ u64::from(*byte)).wrapping_mul(PRIME)
    })
}

pub fn etag_for(body: &[u8]) -> String {
    format!("\"{:016x}\"", hash(body))
}

/// Serialises `value`, and returns 304 when the client already holds it.
pub fn json_with_etag<T: serde::Serialize>(headers: &HeaderMap, value: &T) -> Response {
    let Ok(body) = serde_json::to_vec(value) else {
        return StatusCode::INTERNAL_SERVER_ERROR.into_response();
    };
    let etag = etag_for(&body);

    if let Some(requested) = headers
        .get(header::IF_NONE_MATCH)
        .and_then(|v| v.to_str().ok())
        && matches_etag(requested, &etag)
    {
        return (StatusCode::NOT_MODIFIED, [(header::ETAG, etag)]).into_response();
    }

    (
        StatusCode::OK,
        [
            (header::ETAG, etag),
            (header::CONTENT_TYPE, "application/json".to_owned()),
        ],
        body,
    )
        .into_response()
}

/// `If-None-Match` may carry a list, and a cache may have marked the entry weak
/// on its way through. Both are handled rather than compared byte for byte.
fn matches_etag(requested: &str, current: &str) -> bool {
    requested.split(',').any(|candidate| {
        let candidate = candidate.trim();
        candidate == "*" || strip_weak(candidate) == strip_weak(current)
    })
}

fn strip_weak(etag: &str) -> &str {
    etag.strip_prefix("W/").unwrap_or(etag)
}
