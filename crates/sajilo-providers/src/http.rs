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

/// Intermediate certificates some Nepali sites forget to send.
///
/// A server should send its certificate and the intermediate that signed it.
/// Some send only their own, and browsers paper over that by fetching the
/// missing piece; this client, like most programs, refuses instead. Each
/// certificate here is a public intermediate, downloaded from its authority's
/// own address and signed by a root that Sajilo already trusts (Mozilla's
/// list), so adding it only fills a gap a server left; it trusts no one new.
///
/// - Sectigo DV R36, under Sectigo Root R46: Global IME Capital.
/// - GlobalSign RSA OV SSL CA 2018, under GlobalSign Root R3: Nepal Telecom.
const MISSING_INTERMEDIATES: [&str; 2] = [
    include_str!("../certs/sectigo-public-server-authentication-ca-dv-r36.pem"),
    include_str!("../certs/globalsign-rsa-ov-ssl-ca-2018.pem"),
];

/// The answer to a conditional GET.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Conditional {
    /// `304`: what the caller already holds is current.
    NotModified,
    /// The body, and the `ETag` to send next time.
    Body {
        bytes: Vec<u8>,
        etag: Option<String>,
    },
}

#[derive(Clone)]
pub struct HttpClient {
    inner: reqwest::Client,
}

impl HttpClient {
    pub fn new() -> Self {
        let mut builder = reqwest::Client::builder();
        for pem in MISSING_INTERMEDIATES {
            let certificate = reqwest::Certificate::from_pem(pem.as_bytes())
                .expect("bundled intermediates are valid PEM");
            builder = builder.add_root_certificate(certificate);
        }
        let inner = builder
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
        // A source that moved is pointed at its new home by the sources pack,
        // without a release. Bounded to https public hosts by its validation.
        let url = sajilo_core::config::sources::rewrite(url);
        let mut request = self.inner.get(url.as_ref());
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

    /// Posts a form and reads the answer as text: for the few public lookups
    /// that are a plain HTML form, such as the electricity bill check.
    pub async fn post_form_text(
        &self,
        source_name: &'static str,
        url: &str,
        fields: &[(&str, &str)],
    ) -> Result<String> {
        let url = sajilo_core::config::sources::rewrite(url);
        let transport = |error: reqwest::Error| ProviderError::Transport {
            source_name,
            message: error.to_string(),
        };
        let response = self
            .inner
            .post(url.as_ref())
            .form(fields)
            .send()
            .await
            .map_err(transport)?;
        let status = response.status();
        if !status.is_success() {
            return Err(ProviderError::Status {
                source_name,
                status: status.as_u16(),
            });
        }
        response.text().await.map_err(transport)
    }

    /// Posts JSON and reads the answer as text, whatever its status: some
    /// lookups answer "not found" with a 4xx and a JSON message, and that is
    /// an answer, not a failure. The caller reads the body either way.
    pub async fn post_json_any_status(
        &self,
        source_name: &'static str,
        url: &str,
        body: &serde_json::Value,
    ) -> Result<(u16, String)> {
        let url = sajilo_core::config::sources::rewrite(url);
        let transport = |error: reqwest::Error| ProviderError::Transport {
            source_name,
            message: error.to_string(),
        };
        let response = self
            .inner
            .post(url.as_ref())
            .header(reqwest::header::ACCEPT, "application/json")
            .json(body)
            .send()
            .await
            .map_err(transport)?;
        let status = response.status().as_u16();
        Ok((status, response.text().await.map_err(transport)?))
    }

    /// A GET whose answer is read whatever its status, for the same reason.
    pub async fn get_any_status(
        &self,
        source_name: &'static str,
        url: &str,
        headers: &[(&str, &str)],
    ) -> Result<(u16, String)> {
        let url = sajilo_core::config::sources::rewrite(url);
        let transport = |error: reqwest::Error| ProviderError::Transport {
            source_name,
            message: error.to_string(),
        };
        let mut request = self.inner.get(url.as_ref());
        for (name, value) in headers {
            request = request.header(*name, *value);
        }
        let response = request.send().await.map_err(transport)?;
        let status = response.status().as_u16();
        Ok((status, response.text().await.map_err(transport)?))
    }

    /// A GET that sends `If-None-Match` and reads at most `max_bytes`. For
    /// Sajilo's own static files — the config manifest and packs — so not
    /// subject to the sources pack's rewrites: a bad rewrite must never be
    /// able to cut a client off from the fix.
    pub async fn get_conditional(
        &self,
        source_name: &'static str,
        url: &str,
        etag: Option<&str>,
        max_bytes: usize,
    ) -> Result<Conditional> {
        let transport = |error: reqwest::Error| ProviderError::Transport {
            source_name,
            message: error.to_string(),
        };
        let mut request = self.inner.get(url);
        if let Some(etag) = etag {
            request = request.header(reqwest::header::IF_NONE_MATCH, etag);
        }
        let mut response = request.send().await.map_err(transport)?;
        let status = response.status();
        if status == reqwest::StatusCode::NOT_MODIFIED {
            return Ok(Conditional::NotModified);
        }
        if !status.is_success() {
            return Err(ProviderError::Status {
                source_name,
                status: status.as_u16(),
            });
        }
        let too_large =
            || ProviderError::parse(source_name, format!("larger than {max_bytes} bytes"));
        if response
            .content_length()
            .is_some_and(|length| length > max_bytes as u64)
        {
            return Err(too_large());
        }
        let etag = response
            .headers()
            .get(reqwest::header::ETAG)
            .and_then(|value| value.to_str().ok())
            .map(str::to_owned);
        let mut bytes = Vec::new();
        while let Some(chunk) = response.chunk().await.map_err(transport)? {
            if bytes.len() + chunk.len() > max_bytes {
                return Err(too_large());
            }
            bytes.extend_from_slice(&chunk);
        }
        Ok(Conditional::Body { bytes, etag })
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_bundled_intermediate_is_a_certificate() {
        for pem in MISSING_INTERMEDIATES {
            assert!(pem.starts_with("-----BEGIN CERTIFICATE-----"));
            assert!(reqwest::Certificate::from_pem(pem.as_bytes()).is_ok());
        }
        // And the client that bundles them builds.
        let _ = HttpClient::new();
    }
}
