//! Which Windows this is, for the few places Windows 10 and 11 differ.
//!
//! Asks `RtlGetVersion` rather than `GetVersionEx`, which reports whatever
//! version the app's manifest declares support for instead of the real one.

use std::sync::OnceLock;

#[repr(C)]
struct OsVersionInfo {
    size: u32,
    major: u32,
    minor: u32,
    build: u32,
    platform: u32,
    service_pack: [u16; 128],
}

#[link(name = "ntdll")]
unsafe extern "system" {
    fn RtlGetVersion(info: *mut OsVersionInfo) -> i32;
}

/// The first build that is Windows 11, which still reports itself as 10.0.
const WINDOWS_11_BUILD: u32 = 22_000;

/// Windows 11 or later. Unknown reads as not, the cautious answer for
/// anything that only looks right on 11.
pub fn is_windows_11() -> bool {
    static ANSWER: OnceLock<bool> = OnceLock::new();
    *ANSWER.get_or_init(|| {
        let mut info = OsVersionInfo {
            size: std::mem::size_of::<OsVersionInfo>() as u32,
            major: 0,
            minor: 0,
            build: 0,
            platform: 0,
            service_pack: [0; 128],
        };
        // SAFETY: `info` is a correctly sized, initialised OSVERSIONINFOW whose
        // size field is set, and it outlives the call.
        let status = unsafe { RtlGetVersion(&raw mut info) };
        status == 0 && info.major >= 10 && info.build >= WINDOWS_11_BUILD
    })
}
