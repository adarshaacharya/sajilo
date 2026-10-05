//! Data the app can be told about after it ships: jokes, kill switches,
//! source overrides, calendar corrections.
//!
//! Every pack is bundled from `data/config/` and is what the app runs on
//! until something better is installed. A remote copy replaces it only
//! after it parses and passes the same [`Pack::validate`] the publisher ran
//! in CI, so a bad pack can never leave the app worse off than the binary
//! it shipped with. Trust (signatures, hashes, ordering) lives in
//! `sajilo-config`; this module only knows shapes and bounds.

pub mod calendar;
pub mod check;
pub mod directory;
pub mod flags;
pub mod jokes;
pub mod kalimati;
pub mod sources;

use std::sync::{Arc, OnceLock, RwLock};

use serde::de::DeserializeOwned;
use thiserror::Error;

#[derive(Debug, Clone, PartialEq, Eq, Error)]
pub enum PackError {
    #[error("{pack}: not valid JSON for this schema: {message}")]
    Shape { pack: &'static str, message: String },
    #[error("{pack}: {message}")]
    Invalid { pack: &'static str, message: String },
}

/// One kind of remotely changeable data.
pub trait Pack: DeserializeOwned + Send + Sync + 'static {
    /// The name it is published and stored under.
    const NAME: &'static str;
    /// The shape this build reads. A breaking change publishes a new number
    /// alongside the old, so an older app keeps the copy it understands.
    const SCHEMA: u32;
    /// The copy compiled in from `data/config/`.
    fn bundled_json() -> &'static str;
    /// Bounds that hold even for a correctly signed pack. A message names
    /// the first thing wrong.
    fn validate(&self) -> Result<(), String>;
    /// Where the installed copy lives.
    fn slot() -> &'static Slot<Self>;

    /// Parses and validates, without installing.
    fn parse(json: &str) -> Result<Self, PackError> {
        let pack: Self = serde_json::from_str(json).map_err(|error| PackError::Shape {
            pack: Self::NAME,
            message: error.to_string(),
        })?;
        pack.validate().map_err(|message| PackError::Invalid {
            pack: Self::NAME,
            message,
        })?;
        Ok(pack)
    }

    /// The bundled copy, parsed once. The bundled-packs test keeps every one
    /// of these valid, so this cannot fail in a released build.
    fn bundled() -> Arc<Self> {
        Self::slot().bundled()
    }

    /// The copy in use: the installed remote one, or the bundled one.
    fn active() -> Arc<Self> {
        Self::slot().get()
    }

    /// Parses, validates and makes `json` the active copy.
    fn install(json: &str) -> Result<(), PackError> {
        let pack = Self::parse(json)?;
        Self::slot().set(pack);
        Ok(())
    }

    /// Back to the bundled copy.
    fn reset() {
        Self::slot().reset();
    }
}

/// The active copy of one pack, behind a lock only writers wait on for
/// longer than a pointer copy.
pub struct Slot<T> {
    bundled: OnceLock<Arc<T>>,
    active: OnceLock<RwLock<Option<Arc<T>>>>,
}

impl<T: Pack> Slot<T> {
    pub const fn new() -> Self {
        Self {
            bundled: OnceLock::new(),
            active: OnceLock::new(),
        }
    }

    fn bundled(&self) -> Arc<T> {
        self.bundled
            .get_or_init(|| {
                Arc::new(
                    T::parse(T::bundled_json())
                        .unwrap_or_else(|error| panic!("bundled pack is invalid: {error}")),
                )
            })
            .clone()
    }

    fn lock(&self) -> &RwLock<Option<Arc<T>>> {
        self.active.get_or_init(|| RwLock::new(None))
    }

    fn get(&self) -> Arc<T> {
        let installed = self
            .lock()
            .read()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
            .clone();
        installed.unwrap_or_else(|| self.bundled())
    }

    fn set(&self, pack: T) {
        *self
            .lock()
            .write()
            .unwrap_or_else(std::sync::PoisonError::into_inner) = Some(Arc::new(pack));
    }

    fn reset(&self) {
        *self
            .lock()
            .write()
            .unwrap_or_else(std::sync::PoisonError::into_inner) = None;
    }
}

impl<T: Pack> Default for Slot<T> {
    fn default() -> Self {
        Self::new()
    }
}
