//! Pure Nepali calendar, numerals and unit logic.
//!
//! This crate performs no I/O and depends on no async runtime, HTTP client or
//! Tauri type, so it compiles unchanged into the server, the desktop binary and
//! a plain `cargo test`.

pub mod calendar;
pub mod error;
pub mod nepal_time;
pub mod numerals;
pub mod planner;
pub mod tools;

pub use calendar::nepali_date::{NepaliDate, NepaliMonth};
pub use error::{ConversionError, Result};
