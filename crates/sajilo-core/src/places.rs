//! The places weather can be shown for: every district headquarters plus the
//! larger towns, bundled so the picker works offline and never lists nothing.
//!
//! `data/places/nepal.json` holds names written by hand in English and Nepali,
//! with coordinates from GeoNames checked against each place's own district.

use std::sync::OnceLock;

use serde::{Deserialize, Serialize};

/// Where the app points when nothing has been chosen, and what an id this build
/// does not know (from a newer backup, say) falls back to.
pub const DEFAULT_PLACE: &str = "kathmandu";

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(
    feature = "typescript",
    derive(ts_rs::TS),
    ts(export, export_to = "api/")
)]
pub struct Place {
    /// Stable, lowercase, e.g. `dhangadhi`. Kept once published: it is what a
    /// pin and a cache entry are stored under.
    pub id: String,
    pub name: String,
    pub name_ne: String,
    pub district: String,
    pub district_ne: String,
    pub province: String,
    pub province_ne: String,
    pub latitude: f64,
    pub longitude: f64,
    /// Metres, from the same terrain model the forecast is downscaled with.
    pub elevation: f64,
}

/// Every place, in the order the data file lists them: by province, east to west.
pub fn all() -> &'static [Place] {
    static PLACES: OnceLock<Vec<Place>> = OnceLock::new();
    PLACES.get_or_init(|| {
        serde_json::from_str(include_str!("../../../data/places/nepal.json"))
            .expect("data/places/nepal.json is checked by the places tests")
    })
}

pub fn find(id: &str) -> Option<&'static Place> {
    all().iter().find(|place| place.id == id)
}

/// The place for an id, or Kathmandu for one this build does not know.
pub fn find_or_default(id: &str) -> &'static Place {
    find(id).unwrap_or_else(|| find(DEFAULT_PLACE).expect("Kathmandu is in the list"))
}

#[cfg(test)]
mod tests {
    use std::collections::HashSet;

    use super::*;

    #[test]
    fn every_district_has_a_place() {
        let districts: HashSet<&str> = all().iter().map(|place| place.district.as_str()).collect();
        assert_eq!(districts.len(), 77);
    }

    #[test]
    fn ids_are_unique_and_url_safe() {
        let mut seen = HashSet::new();
        for place in all() {
            assert!(seen.insert(place.id.as_str()), "duplicate id {}", place.id);
            assert!(
                place.id.chars().all(|c| c.is_ascii_lowercase() || c == '-'),
                "{}",
                place.id
            );
        }
    }

    #[test]
    fn every_place_is_inside_nepal_and_named_in_both_languages() {
        for place in all() {
            assert!((26.3..=30.5).contains(&place.latitude), "{}", place.id);
            assert!((80.0..=88.3).contains(&place.longitude), "{}", place.id);
            assert!(
                !place.name_ne.is_empty() && !place.district_ne.is_empty(),
                "{}",
                place.id
            );
        }
    }

    #[test]
    fn the_three_cities_saved_before_the_list_still_resolve() {
        for id in ["kathmandu", "pokhara", "lalitpur"] {
            assert_eq!(find(id).map(|place| place.id.as_str()), Some(id));
        }
    }

    #[test]
    fn an_unknown_id_falls_back_to_kathmandu() {
        assert_eq!(find_or_default("atlantis").id, "kathmandu");
    }
}
