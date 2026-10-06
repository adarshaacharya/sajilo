//! The manifest checks a client makes before it installs anything.

use std::collections::BTreeMap;
use std::io::Cursor;

use base64::Engine;
use base64::engine::general_purpose::STANDARD as BASE64;
use sajilo_config::{
    Envelope, FORMAT, Manifest, PackEntry, TrustError, check_pack, check_rev, open, select,
    sha256_hex,
};

fn fixture(name: &str) -> String {
    std::fs::read_to_string(format!(
        "{}/../../fixtures/config/test-key/{name}",
        env!("CARGO_MANIFEST_DIR")
    ))
    .unwrap()
}

/// Decrypting the key runs scrypt; once per test binary is plenty.
fn test_key() -> (minisign::SecretKey, String) {
    static KEY: std::sync::OnceLock<(minisign::SecretKey, String)> = std::sync::OnceLock::new();
    KEY.get_or_init(load_test_key).clone()
}

fn load_test_key() -> (minisign::SecretKey, String) {
    let secret = minisign::SecretKeyBox::from_string(&fixture("sajilo-config.key"))
        .unwrap()
        .into_secret_key(Some("sajilo-test".to_owned()))
        .unwrap();
    let public = minisign::PublicKey::from_secret_key(&secret)
        .unwrap()
        .to_base64();
    (secret, public)
}

fn entry(name: &str, bytes: &[u8]) -> PackEntry {
    let sha256 = sha256_hex(bytes);
    PackEntry {
        schema: 1,
        path: format!("packs/{name}.1.{}.json", &sha256[..12]),
        sha256,
        size: bytes.len(),
        min_app: None,
        max_app: None,
    }
}

fn manifest(rev: u64) -> Manifest {
    Manifest {
        format: FORMAT,
        rev,
        packs: BTreeMap::from([("jokes".to_owned(), vec![entry("jokes", b"{}")])]),
    }
}

fn sign(payload: &[u8], key: &minisign::SecretKey) -> Vec<u8> {
    let signature = minisign::sign(None, key, Cursor::new(payload), None, None).unwrap();
    serde_json::to_vec(&Envelope {
        payload: BASE64.encode(payload),
        signature: signature.into_string(),
    })
    .unwrap()
}

fn signed(manifest: &Manifest) -> (Vec<u8>, String) {
    let (secret, public) = test_key();
    (
        sign(&serde_json::to_vec(manifest).unwrap(), &secret),
        public,
    )
}

#[test]
fn a_signed_manifest_opens() {
    let (envelope, public) = signed(&manifest(7));
    assert_eq!(open(&envelope, &[&public]).unwrap(), manifest(7));
}

#[test]
fn the_test_key_is_not_trusted_by_real_builds() {
    let (envelope, _) = signed(&manifest(7));
    assert_eq!(
        open(&envelope, sajilo_config::keys::PUBLIC_KEYS),
        Err(TrustError::Signature)
    );
}

#[test]
fn a_tampered_payload_is_refused() {
    let (envelope, public) = signed(&manifest(7));
    let mut parsed: Envelope = serde_json::from_slice(&envelope).unwrap();
    let mut evil = manifest(7);
    evil.rev = 9;
    parsed.payload = BASE64.encode(serde_json::to_vec(&evil).unwrap());
    let tampered = serde_json::to_vec(&parsed).unwrap();
    assert_eq!(open(&tampered, &[&public]), Err(TrustError::Signature));
}

#[test]
fn garbage_and_oversized_envelopes_are_refused() {
    let (_, public) = signed(&manifest(1));
    assert!(matches!(
        open(b"not json", &[&public]),
        Err(TrustError::Envelope(_))
    ));
    let huge = vec![b' '; sajilo_config::MANIFEST_MAX_BYTES + 1];
    assert!(matches!(
        open(&huge, &[&public]),
        Err(TrustError::TooLarge { .. })
    ));
}

#[test]
fn unsafe_paths_and_unknown_formats_are_refused() {
    let mut bad = manifest(1);
    bad.packs.get_mut("jokes").unwrap()[0].path = "packs/../../etc".to_owned();
    let (envelope, public) = signed(&bad);
    assert!(matches!(
        open(&envelope, &[&public]),
        Err(TrustError::Manifest(_))
    ));

    let mut future = manifest(1);
    future.format = FORMAT + 1;
    let (envelope, public) = signed(&future);
    assert_eq!(
        open(&envelope, &[&public]),
        Err(TrustError::Format(FORMAT + 1))
    );
}

#[test]
fn an_older_rev_is_a_rollback() {
    assert!(check_rev(&manifest(10), None).is_ok());
    assert!(check_rev(&manifest(10), Some(10)).is_ok());
    assert!(check_rev(&manifest(11), Some(10)).is_ok());
    assert_eq!(
        check_rev(&manifest(9), Some(10)),
        Err(TrustError::Rollback {
            got: 9,
            applied: 10
        })
    );
}

#[test]
fn a_pack_must_match_its_hash_and_size() {
    let good = br#"{"paused":{}}"#;
    let entry = entry("flags", good);
    assert!(check_pack("flags", &entry, good).is_ok());
    assert_eq!(
        check_pack("flags", &entry, br#"{"paused":{ }}"#),
        Err(TrustError::Hash("flags".to_owned()))
    );
}

#[test]
fn select_takes_this_builds_schema_inside_its_version_range() {
    let mut manifest = manifest(1);
    let jokes = manifest.packs.get_mut("jokes").unwrap();
    jokes[0].min_app = Some("0.2.0".to_owned());
    let mut v2 = entry("jokes", b"[]");
    v2.schema = 2;
    jokes.push(v2);
    manifest
        .packs
        .insert("unknown".to_owned(), vec![entry("unknown", b"{}")]);
    manifest
        .packs
        .insert("flags".to_owned(), vec![entry("flags", b"{}")]);

    let names = |app| -> Vec<&str> {
        select(&manifest, app)
            .into_iter()
            .map(|(info, _)| info.name)
            .collect()
    };
    assert_eq!(names("0.1.36"), ["flags"], "jokes needs 0.2.0");
    assert_eq!(names("0.2.0"), ["flags", "jokes"]);
    assert!(names("not a version").is_empty());
}

#[test]
fn every_bundled_pack_is_registered_and_valid() {
    let mut names: Vec<_> = sajilo_config::packs()
        .iter()
        .map(|info| info.name)
        .collect();
    let count = names.len();
    names.dedup();
    assert_eq!(names.len(), count);
    for info in sajilo_config::packs() {
        (info.check)((info.bundled)()).unwrap_or_else(|e| panic!("{e}"));
    }
}
