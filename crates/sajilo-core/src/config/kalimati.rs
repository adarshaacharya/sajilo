//! English names for Kalimati's Nepali produce names:
//! `data/config/kalimati.json`.
//!
//! The market adds items without notice. A name missing here only means an
//! English reader sees the Nepali; adding it to the pack fixes that without
//! a release.

use std::collections::BTreeSet;

use serde::{Deserialize, Serialize};

use super::check::text;
use super::{Pack, Slot};

const MAX_NAMES: usize = 500;
const MAX_NAME: usize = 60;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ProduceName {
    /// A Nepali name, or the part of one the board's rows contain.
    pub ne: String,
    pub en: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct KalimatiPack {
    pub names: Vec<ProduceName>,
}

/// The English name for a row of the board, if the pack has one.
///
/// Matched longest-first whatever order the pack lists them in, because the
/// names nest: "भेडे खुर्सानी" is capsicum while "खुर्सानी" is chilli.
pub fn english_name(name: &str) -> Option<String> {
    let pack = KalimatiPack::active();
    pack.names
        .iter()
        .filter(|entry| name.contains(entry.ne.as_str()))
        .max_by_key(|entry| entry.ne.chars().count())
        .map(|entry| entry.en.clone())
}

impl Pack for KalimatiPack {
    const NAME: &'static str = "kalimati";
    const SCHEMA: u32 = 1;

    fn bundled_json() -> &'static str {
        include_str!("../../../../data/config/kalimati.json")
    }

    fn validate(&self) -> Result<(), String> {
        if self.names.len() > MAX_NAMES {
            return Err(format!("more than {MAX_NAMES} names"));
        }
        let mut seen = BTreeSet::new();
        for (index, entry) in self.names.iter().enumerate() {
            text(&format!("names[{index}].ne"), &entry.ne, MAX_NAME)?;
            text(&format!("names[{index}].en"), &entry.en, MAX_NAME)?;
            if !seen.insert(entry.ne.as_str()) {
                return Err(format!("names has \"{}\" twice", entry.ne));
            }
        }
        Ok(())
    }

    fn slot() -> &'static Slot<Self> {
        static SLOT: Slot<KalimatiPack> = Slot::new();
        &SLOT
    }
}
