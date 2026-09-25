//! The Windows tray icon. Exercised on every platform, including macOS where it
//! is not used at runtime — otherwise the only machine that builds it would be
//! the one that never runs it.

use sajilo_desktop_lib::tray::icon::{nepal_flag_icon, size};

fn opaque_pixels(rgba: &[u8]) -> usize {
    rgba.chunks_exact(4).filter(|px| px[3] > 0).count()
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
