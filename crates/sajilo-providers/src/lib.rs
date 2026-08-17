//! Upstream fetchers and parsers for every public source Sajilo reads.
//!
//! Fetching and parsing are deliberately separate: each provider exposes a
//! `parse` that takes the raw bytes it was given, so every parser test runs
//! against a recorded fixture and no test in this crate touches the network.
//! Live checks live in `.github/workflows/smoke.yml` and run on a schedule.

pub mod error;
pub mod fenegosida;
pub mod html;
pub mod http;
pub mod kalimati;
pub mod noc;
pub mod nrb;
pub mod open_meteo;
pub mod ratopati;
pub mod rss;

pub use error::{ProviderError, Result};
pub use http::HttpClient;
