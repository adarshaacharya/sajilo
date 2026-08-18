//! The Sajilo server: keeps every public source warm on a schedule and serves
//! the last good value cheaply.
//!
//! The shape of this crate follows one rule — **the request path never fetches
//! upstream.** Refreshing is the scheduler's job alone, so the traffic Sajilo
//! sends to nine small Nepali services depends on the cadence table and not at
//! all on how many people are running the app.

pub mod cache;
pub mod config;
pub mod http;
pub mod refresh;
pub mod state;

pub use cache::Cache;
pub use config::Config;
pub use state::AppState;
