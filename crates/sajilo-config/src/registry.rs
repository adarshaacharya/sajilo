//! Every pack this build reads, by name.

use sajilo_api::announcement::AnnouncementsPack;
use sajilo_core::config::calendar::CalendarPack;
use sajilo_core::config::directory::DirectoryPack;
use sajilo_core::config::flags::FlagsPack;
use sajilo_core::config::jokes::JokesPack;
use sajilo_core::config::kalimati::KalimatiPack;
use sajilo_core::config::sources::SourcesPack;
use sajilo_core::config::{Pack, PackError};

pub struct PackInfo {
    pub name: &'static str,
    pub schema: u32,
    /// Parses and validates without installing.
    pub check: fn(&str) -> Result<(), PackError>,
    /// Parses, validates and makes it the active copy.
    pub install: fn(&str) -> Result<(), PackError>,
    /// Back to the bundled copy.
    pub reset: fn(),
    pub bundled: fn() -> &'static str,
    /// The active copy as JSON, for a screen that reads it through a command.
    pub active_json: fn() -> serde_json::Value,
}

const fn info<T: Pack + serde::Serialize>() -> PackInfo {
    PackInfo {
        name: T::NAME,
        schema: T::SCHEMA,
        check: |json| T::parse(json).map(drop),
        install: T::install,
        reset: T::reset,
        bundled: T::bundled_json,
        active_json: || serde_json::to_value(&*T::active()).unwrap_or_default(),
    }
}

static PACKS: [PackInfo; 7] = [
    info::<AnnouncementsPack>(),
    info::<CalendarPack>(),
    info::<DirectoryPack>(),
    info::<FlagsPack>(),
    info::<JokesPack>(),
    info::<KalimatiPack>(),
    info::<SourcesPack>(),
];

pub fn packs() -> &'static [PackInfo] {
    &PACKS
}

pub fn pack(name: &str) -> Option<&'static PackInfo> {
    PACKS.iter().find(|info| info.name == name)
}
