//! Validates, builds and signs the remote config.
//!
//! ```text
//! sajilo-config-publish check [--config DIR]  validate data/config/*.json
//! sajilo-config-publish build --out DIR --rev N [--config DIR]
//!                                             write DIR/v1/manifest.json and
//!                                             DIR/v1/packs/*, signed
//! sajilo-config-publish keygen --out DIR      a new key pair
//! ```
//!
//! `build` reads the secret key from `SAJILO_CONFIG_SIGNING_KEY` (the text
//! of a minisign secret key file) and its password from
//! `SAJILO_CONFIG_SIGNING_KEY_PASSWORD`. Both live only in the GitHub
//! Environment `config-publish`, which only `main` can deploy from.
//!
//! The validation is `sajilo-config`'s, the same code the app runs before
//! it installs a pack.

use std::collections::BTreeMap;
use std::io::Cursor;
use std::path::{Path, PathBuf};
use std::process::ExitCode;

use base64::Engine;
use base64::engine::general_purpose::STANDARD as BASE64;
use sajilo_config::{Envelope, FORMAT, Manifest, PACK_MAX_BYTES, PackEntry, sha256_hex};

const HEADERS: &str = "\
/v1/manifest.json
  Cache-Control: public, max-age=300
  Access-Control-Allow-Origin: *
/v1/packs/*
  Cache-Control: public, max-age=31536000, immutable
  Access-Control-Allow-Origin: *
";

fn repo_root() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("../..")
}

/// `data/config`, or `--config DIR` to check or build another set (a
/// local end-to-end test).
fn config_dir(args: &[String]) -> PathBuf {
    flag(args, "--config").map_or_else(|| repo_root().join("data/config"), PathBuf::from)
}

fn flag(args: &[String], name: &str) -> Option<String> {
    args.iter()
        .position(|arg| arg == name)
        .and_then(|index| args.get(index + 1).cloned())
}

/// Every pack file, checked. Errors name the file and the first problem.
fn check(dir: &Path) -> Result<BTreeMap<&'static str, Vec<u8>>, String> {
    let mut found = BTreeMap::new();
    let entries = std::fs::read_dir(dir).map_err(|e| format!("{}: {e}", dir.display()))?;
    for entry in entries {
        let path = entry.map_err(|e| e.to_string())?.path();
        if path.extension().and_then(|ext| ext.to_str()) != Some("json") {
            continue;
        }
        let stem = path
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or_default();
        let info = sajilo_config::pack(stem)
            .ok_or_else(|| format!("{}: no pack is called {stem}", path.display()))?;
        let bytes = std::fs::read(&path).map_err(|e| format!("{}: {e}", path.display()))?;
        if bytes.len() > PACK_MAX_BYTES {
            return Err(format!(
                "{}: larger than {PACK_MAX_BYTES} bytes",
                path.display()
            ));
        }
        let text = std::str::from_utf8(&bytes).map_err(|e| format!("{}: {e}", path.display()))?;
        (info.check)(text).map_err(|e| format!("{}: {e}", path.display()))?;
        found.insert(info.name, bytes);
    }
    for info in sajilo_config::packs() {
        if !found.contains_key(info.name) {
            return Err(format!("{}/{}.json is missing", dir.display(), info.name));
        }
    }
    Ok(found)
}

fn secret_key() -> Result<(minisign::SecretKey, Option<minisign::PublicKey>), String> {
    let text = std::env::var("SAJILO_CONFIG_SIGNING_KEY")
        .map_err(|_| "SAJILO_CONFIG_SIGNING_KEY is not set".to_owned())?;
    let password = std::env::var("SAJILO_CONFIG_SIGNING_KEY_PASSWORD").ok();
    let boxed = minisign::SecretKeyBox::from_string(&text).map_err(|e| e.to_string())?;
    let key = boxed
        // `None` would prompt on a terminal CI doesn't have.
        .into_secret_key(Some(password.unwrap_or_default()))
        .map_err(|e| format!("the signing key: {e}"))?;
    let public = minisign::PublicKey::from_secret_key(&key).ok();
    Ok((key, public))
}

fn build(dir: &Path, out: &Path, rev: u64) -> Result<(), String> {
    let packs = check(dir)?;
    let (key, public) = secret_key()?;
    let version_dir = out.join("v1");
    std::fs::create_dir_all(version_dir.join("packs")).map_err(|e| e.to_string())?;

    let mut manifest = Manifest {
        format: FORMAT,
        rev,
        packs: BTreeMap::new(),
    };
    for info in sajilo_config::packs() {
        let bytes = &packs[info.name];
        let sha256 = sha256_hex(bytes);
        let path = format!("packs/{}.{}.{}.json", info.name, info.schema, &sha256[..12]);
        std::fs::write(version_dir.join(&path), bytes).map_err(|e| e.to_string())?;
        manifest.packs.insert(
            info.name.to_owned(),
            vec![PackEntry {
                schema: info.schema,
                sha256,
                size: bytes.len(),
                path,
                min_app: None,
                max_app: None,
            }],
        );
    }

    let payload = serde_json::to_vec(&manifest).map_err(|e| e.to_string())?;
    let signature = minisign::sign(
        public.as_ref(),
        &key,
        Cursor::new(&payload),
        Some(&format!("sajilo config rev {rev}")),
        None,
    )
    .map_err(|e| format!("signing: {e}"))?;
    let envelope = Envelope {
        payload: BASE64.encode(&payload),
        signature: signature.into_string(),
    };
    let envelope = serde_json::to_vec(&envelope).map_err(|e| e.to_string())?;
    if envelope.len() > sajilo_config::MANIFEST_MAX_BYTES {
        return Err("the manifest is over its size cap".to_owned());
    }
    std::fs::write(version_dir.join("manifest.json"), &envelope).map_err(|e| e.to_string())?;
    std::fs::write(out.join("_headers"), HEADERS).map_err(|e| e.to_string())?;

    // The check the app will make, made here first.
    let keys: Vec<String> = public.map(|key| key.to_base64()).into_iter().collect();
    let refs: Vec<&str> = keys.iter().map(String::as_str).collect();
    sajilo_config::open(&envelope, &refs).map_err(|e| format!("self-check: {e}"))?;
    let trusted = sajilo_config::keys::PUBLIC_KEYS
        .iter()
        .any(|key| keys.iter().any(|ours| ours == key));
    if !trusted {
        eprintln!("warning: this key is not one of the app's PUBLIC_KEYS; clients will refuse it");
    }
    println!(
        "built rev {rev}: {} packs into {}",
        manifest.packs.len(),
        out.display()
    );
    Ok(())
}

fn keygen(out: &Path) -> Result<(), String> {
    // minisign's unencrypted keys carry no checksum and can't be read back,
    // so every key gets a password.
    let password = std::env::var("SAJILO_CONFIG_SIGNING_KEY_PASSWORD")
        .ok()
        .filter(|password| !password.is_empty())
        .ok_or_else(|| "set SAJILO_CONFIG_SIGNING_KEY_PASSWORD for the new key".to_owned())?;
    let pair =
        minisign::KeyPair::generate_encrypted_keypair(Some(password)).map_err(|e| e.to_string())?;
    std::fs::create_dir_all(out).map_err(|e| e.to_string())?;
    let secret = pair.sk.to_box(None).map_err(|e| e.to_string())?.to_string();
    let public = pair.pk.to_box().map_err(|e| e.to_string())?.to_string();
    std::fs::write(out.join("sajilo-config.key"), secret).map_err(|e| e.to_string())?;
    std::fs::write(out.join("sajilo-config.pub"), &public).map_err(|e| e.to_string())?;
    println!(
        "public key (add to crates/sajilo-config/src/keys.rs):\n{}",
        pair.pk.to_base64()
    );
    Ok(())
}

fn main() -> ExitCode {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let result = match args.first().map(String::as_str) {
        Some("check") => {
            check(&config_dir(&args)).map(|packs| println!("{} packs valid", packs.len()))
        }
        Some("build") => match (flag(&args, "--out"), flag(&args, "--rev")) {
            (Some(out), Some(rev)) => rev
                .parse()
                .map_err(|_| "--rev must be a number".to_owned())
                .and_then(|rev| build(&config_dir(&args), Path::new(&out), rev)),
            _ => Err("build needs --out DIR --rev N".to_owned()),
        },
        Some("keygen") => flag(&args, "--out")
            .ok_or_else(|| "keygen needs --out DIR".to_owned())
            .and_then(|out| keygen(Path::new(&out))),
        _ => Err(
            "usage: sajilo-config-publish check | build --out DIR --rev N | keygen --out DIR"
                .to_owned(),
        ),
    };
    match result {
        Ok(()) => ExitCode::SUCCESS,
        Err(error) => {
            eprintln!("error: {error}");
            ExitCode::FAILURE
        }
    }
}
