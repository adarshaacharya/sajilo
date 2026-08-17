//! Drawing the Nepali day number into the tray icon.
//!
//! macOS lets a tray item carry text beside its icon, which is what
//! `tray/title.rs` uses. Windows and Linux do not: the icon is all there is. So
//! on those platforms the day number is rendered into the bitmap itself, which
//! is the only way the date is visible at a glance rather than on hover.
//!
//! Rendering is comparatively expensive and the answer changes once a day, so
//! the result is cached and only redrawn when the day or the numeral style
//! actually changes.

use std::sync::Mutex;

use cosmic_text::{Attrs, Buffer, Color, Family, FontSystem, Metrics, Shaping, SwashCache, Weight};
use sajilo_core::numerals::NumeralStyle;
use tiny_skia::{Pixmap, PremultipliedColorU8};

/// Tray icons are small and are drawn at device scale. 32px covers a 2× menu
/// bar without the text turning to mush.
const SIZE: u32 = 32;

/// The bundled face, so Devanagari digits render identically on every platform
/// rather than depending on what the system happens to ship.
const FONT: &[u8] = include_bytes!("../../assets/fonts/NotoSansDevanagari-Variable.ttf");

/// What the last render was for. A redraw is skipped when neither has moved.
#[derive(PartialEq, Eq, Clone, Copy)]
struct Rendered {
    day: u32,
    devanagari: bool,
}

static CACHE: Mutex<Option<(Rendered, Vec<u8>)>> = Mutex::new(None);

/// RGBA pixels for the given day, ready for `tauri::image::Image`.
///
/// Returns `None` only if text shaping fails outright, in which case the caller
/// keeps the static icon — a tray with no date beats a tray with no icon.
pub fn day_icon(day: u32, numerals: NumeralStyle) -> Option<Vec<u8>> {
    let wanted = Rendered {
        day,
        devanagari: numerals == NumeralStyle::Devanagari,
    };

    let mut cache = CACHE.lock().unwrap_or_else(|error| error.into_inner());
    if let Some((rendered, pixels)) = cache.as_ref()
        && *rendered == wanted
    {
        return Some(pixels.clone());
    }

    let pixels = render(day, numerals)?;
    *cache = Some((wanted, pixels.clone()));
    Some(pixels)
}

fn render(day: u32, numerals: NumeralStyle) -> Option<Vec<u8>> {
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
    // White: on Windows and Linux the tray sits on a dark panel far more often
    // than not, and macOS never reaches this path.
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
            // expects back.
            if let Some(pixel) = PremultipliedColorU8::from_rgba(alpha, alpha, alpha, alpha) {
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
