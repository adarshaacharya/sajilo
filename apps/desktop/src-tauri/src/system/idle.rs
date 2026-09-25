//! Seconds since the last keyboard or mouse input, system-wide.
//!
//! Focus counts only time at the computer, and this is how it knows. Each
//! platform answers from the OS's own input clock: no accessibility or screen
//! recording permission, nothing about which app or what was typed. `None`
//! means the platform cannot say, and Focus then counts all time as active.

/// Idle seconds, or `None` where the platform cannot report them.
pub fn seconds() -> Option<u32> {
    platform::seconds()
}

#[cfg(target_os = "macos")]
mod platform {
    /// `kCGEventSourceStateHIDSystemState`: input from the hardware itself, not
    /// events apps post.
    const HID_SYSTEM_STATE: i32 = 1;
    /// `kCGAnyInputEventType`.
    const ANY_INPUT_EVENT: u32 = u32::MAX;

    #[link(name = "CoreGraphics", kind = "framework")]
    unsafe extern "C" {
        fn CGEventSourceSecondsSinceLastEventType(state: i32, event_type: u32) -> f64;
    }

    pub fn seconds() -> Option<u32> {
        // SAFETY: a pure query with two plain integer arguments; CoreGraphics
        // documents it as callable from any thread.
        let idle =
            unsafe { CGEventSourceSecondsSinceLastEventType(HID_SYSTEM_STATE, ANY_INPUT_EVENT) };
        idle.is_finite().then(|| idle.max(0.0) as u32)
    }
}

#[cfg(target_os = "windows")]
mod platform {
    #[repr(C)]
    struct LastInputInfo {
        size: u32,
        time: u32,
    }

    #[link(name = "user32")]
    unsafe extern "system" {
        fn GetLastInputInfo(info: *mut LastInputInfo) -> i32;
    }

    #[link(name = "kernel32")]
    unsafe extern "system" {
        fn GetTickCount() -> u32;
    }

    pub fn seconds() -> Option<u32> {
        let mut info = LastInputInfo {
            size: std::mem::size_of::<LastInputInfo>() as u32,
            time: 0,
        };
        // SAFETY: `info` is a correctly sized, initialised LASTINPUTINFO that
        // outlives the call.
        if unsafe { GetLastInputInfo(&raw mut info) } == 0 {
            return None;
        }
        // Both are milliseconds since boot and wrap together after ~49 days,
        // so the wrapping difference stays right across the wrap.
        // SAFETY: no arguments, no preconditions.
        let now = unsafe { GetTickCount() };
        Some(now.wrapping_sub(info.time) / 1_000)
    }
}

#[cfg(target_os = "linux")]
mod platform {
    use super::super::dbus::session;

    /// GNOME's idle monitor answers in milliseconds; KDE and others implement
    /// the freedesktop screensaver interface, in seconds. Anything else (a
    /// bare window manager) has neither, and gets `None`.
    pub fn seconds() -> Option<u32> {
        let connection = session()?;
        let gnome = connection
            .call_method(
                Some("org.gnome.Mutter.IdleMonitor"),
                "/org/gnome/Mutter/IdleMonitor/Core",
                Some("org.gnome.Mutter.IdleMonitor"),
                "GetIdletime",
                &(),
            )
            .ok()
            .and_then(|reply| reply.body().deserialize::<u64>().ok())
            .map(|millis| u32::try_from(millis / 1_000).unwrap_or(u32::MAX));
        gnome.or_else(|| {
            connection
                .call_method(
                    Some("org.freedesktop.ScreenSaver"),
                    "/org/freedesktop/ScreenSaver",
                    Some("org.freedesktop.ScreenSaver"),
                    "GetSessionIdleTime",
                    &(),
                )
                .ok()
                .and_then(|reply| reply.body().deserialize::<u32>().ok())
        })
    }
}

#[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
mod platform {
    pub fn seconds() -> Option<u32> {
        None
    }
}

#[cfg(all(test, any(target_os = "macos", target_os = "windows")))]
mod tests {
    /// Both platforms always have an input clock to read, even on a machine
    /// nobody has touched since boot.
    #[test]
    fn idle_time_is_reported() {
        assert!(super::seconds().is_some());
    }
}
