//! Whether a published config manifest can be trusted, and which of its
//! packs this build should take.
//!
//! The publisher signs one small manifest that names every pack by SHA-256.
//! A client checks the signature once against a key compiled into it, then
//! checks each pack it downloads against its hash. A manifest older than
//! the one already applied is refused, so a replayed copy cannot roll a
//! client back. Nothing here touches the network or the disk: the desktop
//! app fetches and stores; this crate only decides.

pub mod keys;
mod registry;

use std::collections::BTreeMap;

use base64::Engine;
use base64::engine::general_purpose::STANDARD as BASE64;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use thiserror::Error;

pub use registry::{PackInfo, pack, packs};

/// The manifest layout this build reads.
pub const FORMAT: u32 = 1;
/// Refused before parsing: a manifest is a few hundred bytes.
pub const MANIFEST_MAX_BYTES: usize = 16 * 1024;
/// Refused before hashing: the largest pack today is ~60 KB.
pub const PACK_MAX_BYTES: usize = 256 * 1024;
/// Where the manifest sits under the config host.
pub const MANIFEST_PATH: &str = "v1/manifest.json";

#[derive(Debug, Clone, PartialEq, Eq, Error)]
pub enum TrustError {
    #[error("{what} is {size} bytes, more than {max}")]
    TooLarge {
        what: String,
        size: usize,
        max: usize,
    },
    #[error("the manifest envelope is malformed: {0}")]
    Envelope(String),
    #[error("the manifest signature does not match any trusted key")]
    Signature,
    #[error("the manifest is format {0}; this build reads {FORMAT}")]
    Format(u32),
    #[error("the manifest is malformed: {0}")]
    Manifest(String),
    #[error("manifest rev {got} is older than the applied rev {applied}")]
    Rollback { got: u64, applied: u64 },
    #[error("{0} does not match the hash the manifest names")]
    Hash(String),
}

/// What is actually published: the manifest's bytes and a minisign
/// signature over exactly those bytes. Signing bytes, not a JSON value,
/// sidesteps any argument about canonical JSON.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Envelope {
    /// The manifest JSON, base64.
    pub payload: String,
    /// A minisign signature, in the text form `minisign -S` writes.
    pub signature: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Manifest {
    pub format: u32,
    /// Only ever goes up: the publisher sets it to the commit time.
    pub rev: u64,
    /// Every published copy of each pack, one per schema still served.
    pub packs: BTreeMap<String, Vec<PackEntry>>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PackEntry {
    pub schema: u32,
    /// Lowercase hex.
    pub sha256: String,
    pub size: usize,
    /// Relative to the manifest's directory, e.g. `packs/jokes.1.3f9a1c2e7b40.json`.
    pub path: String,
    /// Oldest app version that takes this copy, inclusive.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub min_app: Option<String>,
    /// Newest app version that takes this copy, inclusive.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub max_app: Option<String>,
}

pub fn sha256_hex(bytes: &[u8]) -> String {
    use std::fmt::Write;
    Sha256::digest(bytes)
        .iter()
        .fold(String::with_capacity(64), |mut hex, byte| {
            let _ = write!(hex, "{byte:02x}");
            hex
        })
}

fn too_large(what: &str, size: usize, max: usize) -> Result<(), TrustError> {
    if size > max {
        return Err(TrustError::TooLarge {
            what: what.to_owned(),
            size,
            max,
        });
    }
    Ok(())
}

/// Opens a published envelope: size, signature against any of `keys`
/// (minisign public keys, base64), then the manifest inside.
pub fn open(envelope: &[u8], keys: &[&str]) -> Result<Manifest, TrustError> {
    too_large("the manifest", envelope.len(), MANIFEST_MAX_BYTES)?;
    let envelope: Envelope = serde_json::from_slice(envelope)
        .map_err(|error| TrustError::Envelope(error.to_string()))?;
    let payload = BASE64
        .decode(envelope.payload.as_bytes())
        .map_err(|error| TrustError::Envelope(error.to_string()))?;
    let signature = minisign_verify::Signature::decode(&envelope.signature)
        .map_err(|error| TrustError::Envelope(error.to_string()))?;
    let trusted = keys.iter().any(|key| {
        minisign_verify::PublicKey::from_base64(key)
            .is_ok_and(|key| key.verify(&payload, &signature, false).is_ok())
    });
    if !trusted {
        return Err(TrustError::Signature);
    }
    let manifest: Manifest = serde_json::from_slice(&payload)
        .map_err(|error| TrustError::Manifest(error.to_string()))?;
    if manifest.format != FORMAT {
        return Err(TrustError::Format(manifest.format));
    }
    for (name, entries) in &manifest.packs {
        for entry in entries {
            let safe_path = entry.path.starts_with("packs/")
                && !entry.path.contains("..")
                && entry
                    .path
                    .chars()
                    .all(|c| c.is_ascii_alphanumeric() || matches!(c, '/' | '.' | '-' | '_'));
            if !safe_path {
                return Err(TrustError::Manifest(format!(
                    "{name}: unsafe path {}",
                    entry.path
                )));
            }
            if entry.sha256.len() != 64 || !entry.sha256.chars().all(|c| c.is_ascii_hexdigit()) {
                return Err(TrustError::Manifest(format!("{name}: bad sha256")));
            }
        }
    }
    Ok(manifest)
}

/// Refuses a manifest older than the one already applied. An equal rev is
/// the same publish seen again.
pub fn check_rev(manifest: &Manifest, applied: Option<u64>) -> Result<(), TrustError> {
    match applied {
        Some(applied) if manifest.rev < applied => Err(TrustError::Rollback {
            got: manifest.rev,
            applied,
        }),
        _ => Ok(()),
    }
}

/// A downloaded pack is the one the manifest names.
pub fn check_pack(name: &str, entry: &PackEntry, bytes: &[u8]) -> Result<(), TrustError> {
    too_large(name, bytes.len(), PACK_MAX_BYTES)?;
    if bytes.len() != entry.size || sha256_hex(bytes) != entry.sha256.to_ascii_lowercase() {
        return Err(TrustError::Hash(name.to_owned()));
    }
    Ok(())
}

fn in_range(app: (u64, u64, u64), entry: &PackEntry) -> bool {
    let bound =
        |text: &Option<String>| text.as_deref().map(sajilo_api::announcement::parse_version);
    let above_min = match bound(&entry.min_app) {
        None => true,
        Some(None) => false,
        Some(Some(min)) => app >= min,
    };
    let below_max = match bound(&entry.max_app) {
        None => true,
        Some(None) => false,
        Some(Some(max)) => app <= max,
    };
    above_min && below_max
}

/// The copy of each known pack this build should take: its schema, and an
/// app-version range that includes `app_version`. Packs this build doesn't
/// know are ignored, so a newer manifest can add packs freely.
pub fn select<'m>(
    manifest: &'m Manifest,
    app_version: &str,
) -> Vec<(&'static PackInfo, &'m PackEntry)> {
    let Some(app) = sajilo_api::announcement::parse_version(app_version) else {
        return Vec::new();
    };
    packs()
        .iter()
        .filter_map(|info| {
            let entry = manifest
                .packs
                .get(info.name)?
                .iter()
                .find(|entry| entry.schema == info.schema && in_range(app, entry))?;
            Some((info, entry))
        })
        .collect()
}
