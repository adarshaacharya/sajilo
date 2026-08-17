//! Nepal radio directory. Ported from `RadioStation.swift`.

use crate::load_state::Freshness;

dto! {
    /// One station in Ratopati's Nepal radio directory.
    pub struct RadioStation {
        pub slug: String,
        pub name: String,
        pub frequency: Option<String>,
        pub logo_url: Option<String>,
        /// The direct stream URL the webview plays. Absent when the directory
        /// lists a station it has no playable source for.
        pub stream_url: Option<String>,
    }

    pub struct RadioDirectory {
        pub stations: Vec<RadioStation>,
        pub freshness: Freshness,
    }
}
