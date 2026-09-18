//! The client every provider shares. Ported from `RemoteFeed.swift`'s
//! `URLSession.sajilo`.

use std::time::Duration;

use crate::error::{ProviderError, Result};
use serde::Serialize;

/// Sajilo identifies itself and says where to complain. Every source here is a
/// public keyless endpoint being read by a desktop app; an anonymous scraper
/// gives an operator no way to reach us if we are being a nuisance.
pub const USER_AGENT: &str = concat!(
    "Sajilo/",
    env!("CARGO_PKG_VERSION"),
    " (+https://github.com/adarshaacharya/sajilo)"
);

/// A menu-bar popover cannot wait the 60 seconds a default client would. Being
/// offline should fail fast, because the cached value is a better answer than a
/// request held open indefinitely.
const REQUEST_TIMEOUT: Duration = Duration::from_secs(10);
const CONNECT_TIMEOUT: Duration = Duration::from_secs(5);

#[derive(Clone)]
pub struct HttpClient {
    inner: reqwest::Client,
}

impl HttpClient {
    pub fn new() -> Self {
        let inner = reqwest::Client::builder()
            .user_agent(USER_AGENT)
            .timeout(REQUEST_TIMEOUT)
            .connect_timeout(CONNECT_TIMEOUT)
            .build()
            .expect("the default TLS backend always builds");
        Self { inner }
    }

    /// Fetches a URL as text, mapping transport and status failures onto the
    /// named source so a caller can report which feed went dark.
    pub async fn get_text(&self, source_name: &'static str, url: &str) -> Result<String> {
        self.get_text_with_headers(source_name, url, &[]).await
    }

    /// The same, with extra request headers — for endpoints that answer their
    /// own page's script with JSON and a plain request with the page's HTML.
    pub async fn get_text_with_headers(
        &self,
        source_name: &'static str,
        url: &str,
        headers: &[(&str, &str)],
    ) -> Result<String> {
        let mut request = self.inner.get(url);
        for (name, value) in headers {
            request = request.header(*name, *value);
        }
        let response = request
            .send()
            .await
            .map_err(|error| ProviderError::Transport {
                source_name,
                message: error.to_string(),
            })?;

        let status = response.status();
        if !status.is_success() {
            return Err(ProviderError::Status {
                source_name,
                status: status.as_u16(),
            });
        }

        response
            .text()
            .await
            .map_err(|error| ProviderError::Transport {
                source_name,
                message: error.to_string(),
            })
    }

    /// Sends a small JSON payload to a first-party endpoint. Just like reads,
    /// transport and status failures retain the source name for a caller that
    /// wants to fail quietly without losing the reason in diagnostics.
    pub async fn post_json<T: Serialize + ?Sized>(
        &self,
        source_name: &'static str,
        url: &str,
        payload: &T,
    ) -> Result<()> {
        let response = self
            .inner
            .post(url)
            .json(payload)
            .send()
            .await
            .map_err(|error| ProviderError::Transport {
                source_name,
                message: error.to_string(),
            })?;

        let status = response.status();
        if !status.is_success() {
            return Err(ProviderError::Status {
                source_name,
                status: status.as_u16(),
            });
        }

        Ok(())
    }
}

impl Default for HttpClient {
    fn default() -> Self {
        Self::new()
    }
}
