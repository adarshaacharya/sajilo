//! Emits `EVENT_FILES`: one `Option<&str>` of bundled JSON per (BS year, month),
//! so festival data is compiled in and needs no filesystem at runtime.

use std::fmt::Write as _;
use std::{env, fs, path::PathBuf};

const FIRST_YEAR: i32 = 2066;
const LAST_YEAR: i32 = 2083;

fn main() {
    let data = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../data/calendar-events");
    println!("cargo:rerun-if-changed={}", data.display());

    let mut out = String::from("static EVENT_FILES: [Option<&str>; 216] = [\n");
    for year in FIRST_YEAR..=LAST_YEAR {
        for month in 1..=12 {
            let path = data.join(year.to_string()).join(format!("{month}.json"));
            println!("cargo:rerun-if-changed={}", path.display());
            match path.canonicalize() {
                // include_str! resolves relative to the generated file, so the
                // path has to be absolute and symlink-free.
                Ok(path) if path.is_file() => {
                    let _ = writeln!(out, "    Some(include_str!(r\"{}\")),", path.display());
                }
                _ => out.push_str("    None,\n"),
            }
        }
    }
    out.push_str("];\n");

    let dest = PathBuf::from(env::var("OUT_DIR").unwrap()).join("events_data.rs");
    fs::write(&dest, out).expect("write generated event table");
}
