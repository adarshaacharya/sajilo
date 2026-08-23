//! Drawing the Nepali day number into the tray icon.
//!
//! macOS lets a tray item carry text beside its icon, which is what
//! `tray/title.rs` uses. Windows shows a compact Nepal flag instead; its tray
//! icon is too small for a full Nepali date to remain legible.
//!
//! Rendering is comparatively expensive and the answer changes once a day, so
//! the result is cached and only redrawn when the day or the numeral style
//! actually changes.

use std::sync::{Mutex, OnceLock};

use cosmic_text::{Attrs, Buffer, Color, Family, FontSystem, Metrics, Shaping, SwashCache, Weight};
use sajilo_core::numerals::NumeralStyle;
use tiny_skia::{Pixmap, PremultipliedColorU8, Transform};

/// Tray icons are small and are drawn at device scale. 32px covers a 2× menu
/// bar without the text turning to mush.
const SIZE: u32 = 32;

/// The bundled face, so Devanagari digits render identically on every platform
/// rather than depending on what the system happens to ship.
const FONT: &[u8] = include_bytes!("../../assets/fonts/NotoSansDevanagari-Variable.ttf");

/// How light the panel behind the tray is, which decides the digits' colour.
///
/// The icon is glyph-on-transparent, so it has no plate of its own to sit on —
/// it inherits whatever the taskbar is painted. White digits vanish on a
/// light-mode Windows taskbar, which is what this exists to prevent.
#[derive(Debug, PartialEq, Eq, Clone, Copy)]
pub enum Panel {
    Light,
    Dark,
}

impl Panel {
    /// Near-black rather than pure black: the taskbar is rarely pure white, and
    /// full black reads as a hole punched in it at this size.
    const fn ink(self) -> (u8, u8, u8) {
        match self {
            Self::Light => (28, 28, 30),
            Self::Dark => (255, 255, 255),
        }
    }
}

/// What the last render was for. A redraw is skipped when none of it has moved.
#[derive(PartialEq, Eq, Clone, Copy)]
struct Rendered {
    day: u32,
    devanagari: bool,
    panel: Panel,
}

static CACHE: Mutex<Option<(Rendered, Vec<u8>)>> = Mutex::new(None);
static NEPAL_FLAG: OnceLock<Option<Vec<u8>>> = OnceLock::new();

/// RGBA pixels for the given day, ready for `tauri::image::Image`.
///
/// Returns `None` only if text shaping fails outright, in which case the caller
/// keeps the static icon — a tray with no date beats a tray with no icon.
pub fn day_icon(day: u32, numerals: NumeralStyle, panel: Panel) -> Option<Vec<u8>> {
    let wanted = Rendered {
        day,
        devanagari: numerals == NumeralStyle::Devanagari,
        panel,
    };

    let mut cache = CACHE.lock().unwrap_or_else(|error| error.into_inner());
    if let Some((rendered, pixels)) = cache.as_ref()
        && *rendered == wanted
    {
        return Some(pixels.clone());
    }

    let pixels = render(day, numerals, panel)?;
    *cache = Some((wanted, pixels.clone()));
    Some(pixels)
}

/// The flag's own colours (crimson base, deep-blue border, white sun/moon) are
/// legally exact and are not touched by [`Panel`] — unlike the drawn digits,
/// this has a border on every side, so it never needs to fight the taskbar
/// for contrast.
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

fn render(day: u32, numerals: NumeralStyle, panel: Panel) -> Option<Vec<u8>> {
    let text = numerals.format(i64::from(day), None);

    let mut fonts = FontSystem::new();
    fonts.db_mut().load_font_data(FONT.to_vec());

    // Two digits at 22px fill a 32px icon without touching the edges; one digit
    // gets the same size so the tray does not visibly resize day to day.
    let metrics = Metrics::new(22.0, 24.0);
    let mut buffer = Buffer::new(&mut fonts, metrics);
    let mut buffer = buffer.borrow_with(&mut fonts);

    let attrs = Attrs::new()
        .family(Family::Name("Noto Sans Devanagari"))
        .weight(Weight::SEMIBOLD);
    buffer.set_text(&text, &attrs, Shaping::Advanced);
    buffer.set_size(Some(SIZE as f32), Some(SIZE as f32));
    buffer.shape_until_scroll(true);

    let mut cache = SwashCache::new();
    // Only this pass's *coverage* is kept, not its colour — the ink colour is
    // applied when the glyphs are blitted below, once the panel is known.
    let colour = Color::rgb(255, 255, 255);

    // Two passes. The first collects the glyph coverage and its true inked
    // bounds; the second blits it centred. Laying out from the text origin
    // leaves the digits hard against the top edge, and the line box cannot be
    // used to correct that — it spans the font's full ascent to descent, most
    // of which a row of digits never touches.
    let span = SIZE as usize * 3;
    let mut ink = vec![0u8; span * span];
    let (mut min_x, mut min_y) = (usize::MAX, usize::MAX);
    let (mut max_x, mut max_y) = (0usize, 0usize);

    buffer.draw(&mut cache, colour, |x, y, w, h, colour| {
        let alpha = colour.a();
        if alpha == 0 {
            return;
        }
        for dy in 0..h {
            for dx in 0..w {
                // Offset into the oversized buffer so glyphs that shape to a
                // negative coordinate are still captured rather than clipped.
                let px = x + dx as i32 + SIZE as i32;
                let py = y + dy as i32 + SIZE as i32;
                if px < 0 || py < 0 || px >= span as i32 || py >= span as i32 {
                    continue;
                }
                let (px, py) = (px as usize, py as usize);
                ink[py * span + px] = ink[py * span + px].max(alpha);
                min_x = min_x.min(px);
                max_x = max_x.max(px);
                min_y = min_y.min(py);
                max_y = max_y.max(py);
            }
        }
    });

    if min_x > max_x || min_y > max_y {
        // Nothing was drawn at all, which means shaping found no glyph for the
        // text. The caller keeps the static icon.
        return None;
    }

    let mut pixmap = Pixmap::new(SIZE, SIZE)?;
    let (ink_r, ink_g, ink_b) = panel.ink();
    let ink_width = max_x - min_x + 1;
    let ink_height = max_y - min_y + 1;
    let offset_x = (SIZE as i32 - ink_width as i32) / 2;
    let offset_y = (SIZE as i32 - ink_height as i32) / 2;

    for y in 0..ink_height {
        for x in 0..ink_width {
            let alpha = ink[(min_y + y) * span + (min_x + x)];
            if alpha == 0 {
                continue;
            }
            let px = x as i32 + offset_x;
            let py = y as i32 + offset_y;
            if px < 0 || py < 0 || px >= SIZE as i32 || py >= SIZE as i32 {
                continue;
            }
            // Premultiplied, which is what tiny-skia stores and what the tray
            // expects back: each channel scaled by the glyph's coverage.
            let premultiply = |channel: u8| {
                ((u32::from(channel) * u32::from(alpha)) / 255).min(u32::from(alpha)) as u8
            };
            if let Some(pixel) = PremultipliedColorU8::from_rgba(
                premultiply(ink_r),
                premultiply(ink_g),
                premultiply(ink_b),
                alpha,
            ) {
                pixmap.pixels_mut()[py as usize * SIZE as usize + px as usize] = pixel;
            }
        }
    }

    Some(pixmap.take())
}

/// The icon's edge length, so callers building a `tauri::image::Image` do not
/// hard-code it a second time.
pub const fn size() -> u32 {
    SIZE
}
