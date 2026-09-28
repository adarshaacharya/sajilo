//! The Nepal flag tray icon, one of the two Settings offers on Windows and
//! Linux (the other is Sajilo's own icon).
//!
//! It is the default. On Windows, which has no tray text and whose icon is a
//! fixed small square too small for a legible date, the full date stays in the
//! tooltip and the first tray-menu item.

use std::sync::OnceLock;

use tiny_skia::{Pixmap, Transform};

/// Tray icons are small and are drawn at device scale. 32px covers a 2×
/// display without the flag turning to mush.
const SIZE: u32 = 32;

static NEPAL_FLAG: OnceLock<Option<Vec<u8>>> = OnceLock::new();

/// The flag's own colours (crimson base, deep-blue border, white sun/moon) are
/// legally exact. It has a border on every side, so it never needs to fight
/// the taskbar for contrast.
///
/// Traced from the "Constitution of the Kingdom of Nepal, Article 5, Schedule
/// 1" geometric construction (`assets/nepal-flag.svg`, sourced from Wikimedia
/// Commons' reproduction of that same construction), rather than approximated
/// by hand — the flag's outline, its crescent moon, and its twelve-point sun
/// all come from one 24-step compass-and-straightedge procedure in the
/// constitution, not from arbitrary coordinates.
const FLAG_SVG: &[u8] = include_bytes!("../../assets/nepal-flag.svg");

/// A compact Nepal flag for the tray's tiny slot, rasterised once and
/// cached — the SVG never changes, so there is nothing to redo on later calls.
pub fn nepal_flag_icon() -> Option<Vec<u8>> {
    NEPAL_FLAG.get_or_init(|| nepal_flag_at(SIZE)).clone()
}

/// The flag centred in a transparent square `size` pixels across, as
/// straight (not premultiplied) RGBA, which is what trays take.
pub fn nepal_flag_at(size: u32) -> Option<Vec<u8>> {
    let tree = resvg::usvg::Tree::from_data(FLAG_SVG, &resvg::usvg::Options::default()).ok()?;
    let flag_size = tree.size();

    // The flag is taller than it is wide (its own irrational aspect ratio, per
    // the construction), so scale to the smaller of the two ratios and centre
    // the result — filling the square would crop the pennants' points.
    let scale = (size as f32 / flag_size.width()).min(size as f32 / flag_size.height());
    let offset_x = (size as f32 - flag_size.width() * scale) / 2.0;
    let offset_y = (size as f32 - flag_size.height() * scale) / 2.0;

    let mut pixmap = Pixmap::new(size, size)?;
    resvg::render(
        &tree,
        Transform::from_scale(scale, scale).post_translate(offset_x, offset_y),
        &mut pixmap.as_mut(),
    );
    Some(
        pixmap
            .pixels()
            .iter()
            .flat_map(|pixel| {
                let color = pixel.demultiply();
                [color.red(), color.green(), color.blue(), color.alpha()]
            })
            .collect(),
    )
}

/// The icon's edge length, so callers building a `tauri::image::Image` do not
/// hard-code it a second time.
pub const fn size() -> u32 {
    SIZE
}
