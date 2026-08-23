//! The Windows/Linux tray renderer. Exercised on every platform, including
//! macOS where it is not used at runtime — otherwise the only machine that
//! builds it would be the one that never runs it.

use sajilo_core::numerals::NumeralStyle;
use sajilo_desktop_lib::tray::icon::{Panel, day_icon, nepal_flag_icon, size};

fn opaque_pixels(rgba: &[u8]) -> usize {
    rgba.chunks_exact(4).filter(|px| px[3] > 0).count()
}

#[test]
fn renders_a_day_number_into_the_icon() {
    let pixels = day_icon(31, NumeralStyle::Devanagari, Panel::Dark).expect("shaping succeeds");

    assert_eq!(
        pixels.len(),
        (size() * size() * 4) as usize,
        "RGBA at the declared size"
    );
    assert!(
        opaque_pixels(&pixels) > 20,
        "the glyphs must actually be drawn, got {} lit pixels",
        opaque_pixels(&pixels)
    );
}

/// Different days must produce different icons, or the tray would silently show
/// yesterday's number.
#[test]
fn a_different_day_renders_differently() {
    let first = day_icon(1, NumeralStyle::Devanagari, Panel::Dark).unwrap();
    let seventeen = day_icon(17, NumeralStyle::Devanagari, Panel::Dark).unwrap();
    assert_ne!(first, seventeen);
}

/// The numeral setting reaches the tray icon too, not just the macOS label.
#[test]
fn the_numeral_style_changes_the_icon() {
    let devanagari = day_icon(25, NumeralStyle::Devanagari, Panel::Dark).unwrap();
    let latin = day_icon(25, NumeralStyle::Latin, Panel::Dark).unwrap();
    assert_ne!(devanagari, latin);
    assert!(opaque_pixels(&latin) > 20);
}

/// Rendering runs at most once per day, so the cache must return the same bytes
/// rather than reshaping on every call.
#[test]
fn repeated_calls_are_cached() {
    let first = day_icon(12, NumeralStyle::Devanagari, Panel::Dark).unwrap();
    let second = day_icon(12, NumeralStyle::Devanagari, Panel::Dark).unwrap();
    assert_eq!(first, second);
}

/// Every day of the longest BS month must fit and render — a two-digit day is
/// the normal case, not the edge case.
#[test]
fn every_day_of_a_month_renders() {
    for day in 1..=32 {
        let pixels = day_icon(day, NumeralStyle::Devanagari, Panel::Dark)
            .unwrap_or_else(|| panic!("day {day} failed to render"));
        assert!(
            opaque_pixels(&pixels) > 15,
            "day {day} rendered almost nothing"
        );
    }
}

/// The colour of the most opaque pixel, un-premultiplied back to straight RGB.
///
/// Anti-aliased edges are half-lit and would average towards nothing, so this
/// samples the glyph's solid core rather than the whole bitmap.
fn ink_colour(pixels: &[u8]) -> (u8, u8, u8) {
    let core = pixels
        .chunks_exact(4)
        .max_by_key(|px| px[3])
        .expect("the icon has pixels");
    let straight = |channel: u8| ((u32::from(channel) * 255) / u32::from(core[3])) as u8;
    (straight(core[0]), straight(core[1]), straight(core[2]))
}

/// The whole point of [`Panel`]: a light taskbar needs dark digits.
///
/// The renderer draws glyph-on-transparent with no plate of its own, so it
/// inherits whatever the taskbar is painted. White digits on a light-mode
/// Windows taskbar are invisible, which is exactly what shipped before.
#[test]
fn a_light_panel_inks_the_digits_dark() {
    let (r, g, b) = ink_colour(&day_icon(6, NumeralStyle::Devanagari, Panel::Light).unwrap());
    assert!(
        r < 80 && g < 80 && b < 80,
        "light panels need dark digits, got ({r}, {g}, {b})"
    );
}

#[test]
fn a_dark_panel_inks_the_digits_light() {
    let (r, g, b) = ink_colour(&day_icon(6, NumeralStyle::Devanagari, Panel::Dark).unwrap());
    assert!(
        r > 200 && g > 200 && b > 200,
        "dark panels need light digits, got ({r}, {g}, {b})"
    );
}

#[test]
fn renders_a_nepal_flag_for_the_windows_tray() {
    let pixels = nepal_flag_icon().expect("flag renders");
    assert_eq!(pixels.len(), (size() * size() * 4) as usize);
    assert!(
        opaque_pixels(&pixels) > 100,
        "flag should have a substantial silhouette"
    );
    assert!(
        pixels.chunks_exact(4).any(|px| px[2] > px[0] && px[3] > 0),
        "blue border"
    );
    assert!(
        pixels.chunks_exact(4).any(|px| px[0] > px[2] && px[3] > 0),
        "crimson field"
    );
}

/// The cache is keyed on the panel too. Without that, flipping the OS theme
/// would return yesterday's colour from the cache and the digits would sink
/// into the new taskbar — the bug this whole enum exists to prevent.
#[test]
fn the_panel_is_part_of_the_cache_key() {
    let dark = day_icon(6, NumeralStyle::Devanagari, Panel::Dark).unwrap();
    let light = day_icon(6, NumeralStyle::Devanagari, Panel::Light).unwrap();
    assert_ne!(dark, light);
    // And back again, to prove the switch is not one-way.
    assert_eq!(
        dark,
        day_icon(6, NumeralStyle::Devanagari, Panel::Dark).unwrap()
    );
}

/// Colour must not change which pixels are lit — only how they are inked.
#[test]
fn the_panel_does_not_move_the_glyphs() {
    let dark = day_icon(17, NumeralStyle::Devanagari, Panel::Dark).unwrap();
    let light = day_icon(17, NumeralStyle::Devanagari, Panel::Light).unwrap();
    assert_eq!(ink_bounds(&dark), ink_bounds(&light));
    assert_eq!(opaque_pixels(&dark), opaque_pixels(&light));
}

/// The inked bounds of the rendered digits.
fn ink_bounds(pixels: &[u8]) -> (usize, usize, usize, usize) {
    let n = size() as usize;
    let (mut x0, mut y0, mut x1, mut y1) = (n, n, 0usize, 0usize);
    for y in 0..n {
        for x in 0..n {
            if pixels[(y * n + x) * 4 + 3] > 0 {
                x0 = x0.min(x);
                x1 = x1.max(x);
                y0 = y0.min(y);
                y1 = y1.max(y);
            }
        }
    }
    (x0, y0, x1, y1)
}

/// The glyphs must stay inside the bitmap: a digit clipped at the edge reads as
/// a broken icon.
#[test]
fn the_digits_stay_within_the_icon() {
    let pixels = day_icon(31, NumeralStyle::Devanagari, Panel::Dark).unwrap();
    let n = size() as usize;
    let (x0, y0, x1, y1) = ink_bounds(&pixels);

    assert!(x0 > 0 && x1 < n - 1, "clipped horizontally: {x0}..{x1}");
    assert!(y0 > 0 && y1 < n - 1, "clipped vertically: {y0}..{y1}");
}

/// Centred on both axes.
///
/// Laying the text out from its origin leaves the digits hard against the top
/// edge, and the line box cannot be used to correct it — that box spans the
/// font's full ascent to descent, most of which a row of digits never touches.
/// So the renderer measures the real ink and centres on that.
#[test]
fn the_digits_are_centred_on_both_axes() {
    let n = size() as usize;
    for (day, style) in [
        (31u32, NumeralStyle::Devanagari),
        (5, NumeralStyle::Devanagari),
        (17, NumeralStyle::Latin),
        (1, NumeralStyle::Latin),
    ] {
        let pixels = day_icon(day, style, Panel::Dark).unwrap();
        let (x0, y0, x1, y1) = ink_bounds(&pixels);
        let (left, right) = (x0, n - 1 - x1);
        let (top, bottom) = (y0, n - 1 - y1);

        assert!(
            left.abs_diff(right) <= 1,
            "day {day} is off-centre horizontally: {left} vs {right}"
        );
        assert!(
            top.abs_diff(bottom) <= 1,
            "day {day} is off-centre vertically: {top} vs {bottom}"
        );
    }
}
