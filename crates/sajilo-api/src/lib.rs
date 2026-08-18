//! The wire contract shared by the server and the desktop app.
//!
//! Every type here is a *transport* model, kept separate from the domain types
//! in `sajilo-core` so an upstream field rename cannot reach into the calendar
//! engine. Each derives `TS` under the `typescript` feature, so
//! `cargo test --features typescript` regenerates the frontend's `api.ts` and a
//! renamed field breaks the TypeScript build instead of failing at runtime.

/// Emits the derive set every DTO shares, so a new module cannot accidentally
/// ship a type that is missing `camelCase` or the TypeScript binding.
#[macro_export]
macro_rules! dto {
    ($($item:item)*) => {
        $(
            #[derive(Debug, Clone, PartialEq, ::serde::Serialize, ::serde::Deserialize)]
            #[serde(rename_all = "camelCase")]
            #[cfg_attr(
                feature = "typescript",
                derive(::ts_rs::TS),
                ts(export, export_to = "api/")
            )]
            $item
        )*
    };
}

/// The same, for the fieldless enums that act as identifiers — module keys,
/// currencies, signs. They are passed around by value everywhere, so `Copy`
/// and `Hash` are what callers expect of them.
#[macro_export]
macro_rules! dto_enum {
    ($($item:item)*) => {
        $(
            #[derive(
                Debug, Clone, Copy, PartialEq, Eq, Hash,
                ::serde::Serialize, ::serde::Deserialize
            )]
            #[serde(rename_all = "camelCase")]
            #[cfg_attr(
                feature = "typescript",
                derive(::ts_rs::TS),
                ts(export, export_to = "api/")
            )]
            $item
        )*
    };
}

pub mod bazar;
pub mod bundle;
pub mod forex;
pub mod load_state;
pub mod meta;
pub mod news;
pub mod radio;
pub mod rashifal;
pub mod weather;

pub use bundle::{BundleRequest, BundleResponse, ModuleKey};
pub use load_state::{Freshness, LoadState};
