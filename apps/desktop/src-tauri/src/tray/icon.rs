//! The Windows tray icon: a compact Nepal flag.
//!
//! macOS and Linux carry the date as text beside the tray icon
//! (`tray/title.rs`). Windows has no tray text and its icon is a fixed small
//! square, too small for a legible date, so it shows the flag and keeps the
//! full date in the tooltip and the first tray-menu item.

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

/// A compact Nepal flag for Windows' tiny tray slot, rasterised once and
/// cached — the SVG never changes, so there is nothing to redo on later calls.
pub fn nepal_flag_icon() -> Option<Vec<u8>> {
    NEPAL_FLAG.get_or_init(render_nepal_flag).clone()
}

fn render_nepal_flag() -> Option<Vec<u8>> {
    let tree = resvg::usvg::Tree::from_data(FLAG_SVG, &resvg::usvg::Options::default()).ok()?;
    let flag_size = tree.size();

    // The flag is taller than it is wide (its own irrational aspect ratio, per
    // the construction), so scale to the smaller of the two ratios and centre
    // the result — filling the square would crop the pennants' points.
    let scale = (SIZE as f32 / flag_size.width()).min(SIZE as f32 / flag_size.height());
    let offset_x = (SIZE as f32 - flag_size.width() * scale) / 2.0;
    let offset_y = (SIZE as f32 - flag_size.height() * scale) / 2.0;

    let mut pixmap = Pixmap::new(SIZE, SIZE)?;
    resvg::render(
        &tree,
        Transform::from_scale(scale, scale).post_translate(offset_x, offset_y),
        &mut pixmap.as_mut(),
    );
    Some(pixmap.take())
}

/// The icon's edge length, so callers building a `tauri::image::Image` do not
/// hard-code it a second time.
pub const fn size() -> u32 {
    SIZE
}
