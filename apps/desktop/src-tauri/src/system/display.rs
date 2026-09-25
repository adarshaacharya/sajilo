//! Whether someone is watching the screen without touching it.
//!
//! Input idle alone reads a film or a call as time away. Every desktop OS
//! already knows better: an app playing video, running a call or showing
//! slides asks it to keep the display awake. Focus reads that one signal,
//! and only while the screen is unlocked: nothing about which app asked, or
//! what is on screen.
//!
//! Anything that cannot be answered reads as "not held", which is exactly
//! how Focus behaved before it asked: input idle alone decides.

/// Some app is keeping the display awake, and the screen is unlocked.
pub fn held_awake() -> bool {
    platform::held_awake()
}

#[cfg(target_os = "macos")]
mod platform {
    use std::ffi::{CStr, c_char, c_void};
    use std::ptr;

    type CFTypeRef = *const c_void;

    const UTF8: u32 = 0x0800_0100;
    const SINT32: isize = 3;

    #[link(name = "IOKit", kind = "framework")]
    unsafe extern "C" {
        fn IOPMCopyAssertionsStatus(status: *mut CFTypeRef) -> i32;
    }

    #[link(name = "CoreGraphics", kind = "framework")]
    unsafe extern "C" {
        fn CGSessionCopyCurrentDictionary() -> CFTypeRef;
    }

    #[link(name = "CoreFoundation", kind = "framework")]
    unsafe extern "C" {
        fn CFStringCreateWithCString(
            alloc: CFTypeRef,
            text: *const c_char,
            encoding: u32,
        ) -> CFTypeRef;
        fn CFDictionaryGetValue(dictionary: CFTypeRef, key: CFTypeRef) -> CFTypeRef;
        fn CFNumberGetValue(number: CFTypeRef, kind: isize, value: *mut c_void) -> u8;
        fn CFBooleanGetValue(boolean: CFTypeRef) -> u8;
        fn CFRelease(object: CFTypeRef);
    }

    /// Looks `key` up in `dictionary`; the value is borrowed from it.
    ///
    /// SAFETY: `dictionary` must be a live CFDictionary.
    unsafe fn lookup(dictionary: CFTypeRef, key: &CStr) -> CFTypeRef {
        // SAFETY: a static C string in UTF-8; the created key is released
        // below and the value is only borrowed from the dictionary.
        unsafe {
            let key = CFStringCreateWithCString(ptr::null(), key.as_ptr(), UTF8);
            if key.is_null() {
                return ptr::null();
            }
            let value = CFDictionaryGetValue(dictionary, key);
            CFRelease(key);
            value
        }
    }

    /// How many display-sleep assertions are held, across every process.
    fn display_assertions() -> i32 {
        let mut status: CFTypeRef = ptr::null();
        // SAFETY: the out-pointer is valid; on success we own the returned
        // dictionary and release it before returning.
        unsafe {
            if IOPMCopyAssertionsStatus(&raw mut status) != 0 || status.is_null() {
                return 0;
            }
            // The current name, and the name older macOS still reports.
            let count = [c"PreventUserIdleDisplaySleep", c"NoDisplaySleepAssertion"]
                .iter()
                .map(|key| {
                    let number = lookup(status, key);
                    let mut value: i32 = 0;
                    if !number.is_null() {
                        CFNumberGetValue(number, SINT32, (&raw mut value).cast());
                    }
                    value
                })
                .max()
                .unwrap_or(0);
            CFRelease(status);
            count
        }
    }

    /// The screen is locked, or there is no graphical session to ask.
    fn locked() -> bool {
        // SAFETY: returns an owned dictionary or null; released below.
        unsafe {
            let session = CGSessionCopyCurrentDictionary();
            if session.is_null() {
                return true;
            }
            let flag = lookup(session, c"CGSSessionScreenIsLocked");
            let locked = !flag.is_null() && CFBooleanGetValue(flag) != 0;
            CFRelease(session);
            locked
        }
    }

    pub fn held_awake() -> bool {
        display_assertions() > 0 && !locked()
    }
}

#[cfg(target_os = "windows")]
mod platform {
    use std::ffi::c_void;
    use std::ptr;

    /// `POWER_INFORMATION_LEVEL::SystemExecutionState`.
    const SYSTEM_EXECUTION_STATE: i32 = 16;
    const ES_DISPLAY_REQUIRED: u32 = 0x0000_0002;
    const DESKTOP_SWITCHDESKTOP: u32 = 0x0100;

    #[link(name = "powrprof")]
    unsafe extern "system" {
        fn CallNtPowerInformation(
            level: i32,
            input: *const c_void,
            input_len: u32,
            output: *mut c_void,
            output_len: u32,
        ) -> i32;
    }

    #[link(name = "user32")]
    unsafe extern "system" {
        fn OpenInputDesktop(flags: u32, inherit: i32, access: u32) -> *mut c_void;
        fn CloseDesktop(desktop: *mut c_void) -> i32;
    }

    /// Some process has asked for the display to stay on.
    fn display_required() -> bool {
        let mut state: u32 = 0;
        // SAFETY: no input; the output is a correctly sized ULONG that
        // outlives the call.
        let status = unsafe {
            CallNtPowerInformation(
                SYSTEM_EXECUTION_STATE,
                ptr::null(),
                0,
                (&raw mut state).cast(),
                std::mem::size_of::<u32>() as u32,
            )
        };
        status == 0 && state & ES_DISPLAY_REQUIRED != 0
    }

    /// The lock screen runs on a secure desktop this process cannot open, so
    /// failing to open the input desktop means the screen is locked.
    fn locked() -> bool {
        // SAFETY: plain flags; the handle, when there is one, is closed.
        unsafe {
            let desktop = OpenInputDesktop(0, 0, DESKTOP_SWITCHDESKTOP);
            if desktop.is_null() {
                return true;
            }
            CloseDesktop(desktop);
            false
        }
    }

    pub fn held_awake() -> bool {
        display_required() && !locked()
    }
}

#[cfg(target_os = "linux")]
mod platform {
    use super::super::dbus::session;

    /// Ask one D-Bus method for a yes or no; `None` where nothing answers.
    fn ask<B>(service: &str, path: &str, interface: &str, method: &str, body: &B) -> Option<bool>
    where
        B: serde::Serialize + zbus::zvariant::DynamicType,
    {
        session()?
            .call_method(Some(service), path, Some(interface), method, body)
            .ok()?
            .body()
            .deserialize::<bool>()
            .ok()
    }

    /// GNOME's session manager tracks every "keep the screen on" request,
    /// whether made to it or through the freedesktop screensaver interface;
    /// 8 is the idle inhibitor. KDE and others answer the power management
    /// interface instead.
    fn inhibited() -> bool {
        const IDLE: u32 = 8;
        ask(
            "org.gnome.SessionManager",
            "/org/gnome/SessionManager",
            "org.gnome.SessionManager",
            "IsInhibited",
            &(IDLE,),
        )
        .or_else(|| {
            ask(
                "org.freedesktop.PowerManagement",
                "/org/freedesktop/PowerManagement/Inhibit",
                "org.freedesktop.PowerManagement.Inhibit",
                "HasInhibit",
                &(),
            )
        })
        .unwrap_or(false)
    }

    /// The screensaver or lock screen is up. Unknown counts as locked, so a
    /// desktop that cannot say never has its time counted by this signal.
    fn locked() -> bool {
        ask(
            "org.gnome.ScreenSaver",
            "/org/gnome/ScreenSaver",
            "org.gnome.ScreenSaver",
            "GetActive",
            &(),
        )
        .or_else(|| {
            ask(
                "org.freedesktop.ScreenSaver",
                "/org/freedesktop/ScreenSaver",
                "org.freedesktop.ScreenSaver",
                "GetActive",
                &(),
            )
        })
        .unwrap_or(true)
    }

    pub fn held_awake() -> bool {
        inhibited() && !locked()
    }
}

#[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
mod platform {
    pub fn held_awake() -> bool {
        false
    }
}
