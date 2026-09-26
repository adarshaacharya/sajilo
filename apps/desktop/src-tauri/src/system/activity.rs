//! What the moment looks like, for a break reminder deciding whether to speak.
//!
//! A nudge to stand up is welcome between tasks and rude in the middle of a
//! call, a film or a talk. Each desktop OS already knows three things that
//! say "not now": a microphone or camera is live, the front app fills the
//! screen, or the user has asked for quiet. This reads those signals and
//! nothing more: not which app, not what is on screen, not who is on the
//! call.
//!
//! Every answer is read fresh and cheaply, so the caller can ask on each
//! tick. Anything that cannot be answered reads as `false`, which is how the
//! reminders behaved before they asked; `supported` says which answers mean
//! something on this platform, so Settings can be honest about it.

/// What the break reminders need to know about the moment, read fresh each tick.
#[derive(Debug, Clone, Copy, Default)]
pub struct Moment {
    /// A microphone or camera is in use by some app: a call or a meeting.
    pub call: bool,
    /// The frontmost app covers a whole display: a video, slides, a game.
    pub fullscreen: bool,
    /// The system's Do Not Disturb / Focus / quiet mode is on.
    pub do_not_disturb: bool,
}

/// Whether this platform can tell each one at all, so Settings can say so.
#[derive(Debug, Clone, Copy)]
pub struct Supported {
    pub call: bool,
    pub fullscreen: bool,
    pub do_not_disturb: bool,
}

/// The moment as the OS sees it now.
pub fn moment() -> Moment {
    platform::moment()
}

/// Which parts of [`Moment`] this platform can answer.
pub fn supported() -> Supported {
    platform::supported()
}

#[cfg(target_os = "macos")]
mod platform {
    use std::ffi::c_void;
    use std::ptr;

    use super::{Moment, Supported};

    type CFTypeRef = *const c_void;

    /// A property selector or scope, spelled the way the C headers do.
    const fn four_cc(code: [u8; 4]) -> u32 {
        u32::from_be_bytes(code)
    }

    /// `AudioObjectPropertyAddress`, and CoreMediaIO's identically laid out
    /// `CMIOObjectPropertyAddress`.
    #[repr(C)]
    struct PropertyAddress {
        selector: u32,
        scope: u32,
        element: u32,
    }

    /// `kAudioObjectSystemObject` and `kCMIOObjectSystemObject`.
    const SYSTEM_OBJECT: u32 = 1;
    /// `kAudioHardwarePropertyDevices` and `kCMIOHardwarePropertyDevices`.
    const DEVICES: u32 = four_cc(*b"dev#");
    /// `kAudioHardwarePropertyProcessObjectList` (macOS 14 and later).
    const PROCESSES: u32 = four_cc(*b"prs#");
    /// `kAudioProcessPropertyPID`.
    const PROCESS_PID: u32 = four_cc(*b"ppid");
    /// `kAudioProcessPropertyIsRunningInput`.
    const PROCESS_IS_RUNNING_INPUT: u32 = four_cc(*b"piri");
    /// `kAudioDevicePropertyStreams`.
    const STREAMS: u32 = four_cc(*b"stm#");
    /// `kAudioDevicePropertyDeviceIsRunningSomewhere` and
    /// `kCMIODevicePropertyDeviceIsRunningSomewhere`.
    const IS_RUNNING_SOMEWHERE: u32 = four_cc(*b"gone");
    /// `kAudioObjectPropertyScopeGlobal` and `kCMIOObjectPropertyScopeGlobal`.
    const SCOPE_GLOBAL: u32 = four_cc(*b"glob");
    /// `kAudioObjectPropertyScopeInput`.
    const SCOPE_INPUT: u32 = four_cc(*b"inpt");
    /// `kAudioObjectPropertyElementMain` and `kCMIOObjectPropertyElementMain`.
    const ELEMENT_MAIN: u32 = 0;

    /// `kCGWindowListOptionOnScreenOnly | kCGWindowListExcludeDesktopElements`.
    const ON_SCREEN_APP_WINDOWS: u32 = (1 << 0) | (1 << 4);
    /// `kCGNullWindowID`: no reference window, list them all.
    const NULL_WINDOW: u32 = 0;
    /// `kCFNumberSInt32Type` and `kCFNumberDoubleType`.
    const SINT32: isize = 3;
    const DOUBLE: isize = 13;
    /// Anything smaller is a helper or an overlay, not what someone is watching.
    const MIN_WINDOW_SIDE: f64 = 64.0;

    /// `CGRect`: origin then size, `CGFloat` being `f64` on every Mac.
    #[repr(C)]
    #[derive(Clone, Copy, Default)]
    struct Rect {
        x: f64,
        y: f64,
        width: f64,
        height: f64,
    }

    impl Rect {
        /// The same rectangle, give or take a pixel of rounding.
        fn matches(self, other: Self) -> bool {
            [
                self.x - other.x,
                self.y - other.y,
                self.width - other.width,
                self.height - other.height,
            ]
            .iter()
            .all(|delta| delta.abs() <= 1.0)
        }
    }

    #[link(name = "CoreAudio", kind = "framework")]
    unsafe extern "C" {
        fn AudioObjectGetPropertyDataSize(
            object: u32,
            address: *const PropertyAddress,
            qualifier_size: u32,
            qualifier: *const c_void,
            size: *mut u32,
        ) -> i32;
        fn AudioObjectGetPropertyData(
            object: u32,
            address: *const PropertyAddress,
            qualifier_size: u32,
            qualifier: *const c_void,
            size: *mut u32,
            data: *mut c_void,
        ) -> i32;
    }

    #[link(name = "CoreMediaIO", kind = "framework")]
    unsafe extern "C" {
        fn CMIOObjectGetPropertyDataSize(
            object: u32,
            address: *const PropertyAddress,
            qualifier_size: u32,
            qualifier: *const c_void,
            size: *mut u32,
        ) -> i32;
        fn CMIOObjectGetPropertyData(
            object: u32,
            address: *const PropertyAddress,
            qualifier_size: u32,
            qualifier: *const c_void,
            size: u32,
            used: *mut u32,
            data: *mut c_void,
        ) -> i32;
    }

    #[link(name = "CoreGraphics", kind = "framework")]
    unsafe extern "C" {
        fn CGWindowListCopyWindowInfo(option: u32, relative_to: u32) -> CFTypeRef;
        fn CGGetActiveDisplayList(max: u32, displays: *mut u32, count: *mut u32) -> i32;
        fn CGDisplayBounds(display: u32) -> Rect;
        fn CGRectMakeWithDictionaryRepresentation(dictionary: CFTypeRef, rect: *mut Rect) -> bool;

        #[link_name = "kCGWindowLayer"]
        static WINDOW_LAYER: CFTypeRef;
        #[link_name = "kCGWindowOwnerPID"]
        static WINDOW_OWNER_PID: CFTypeRef;
        #[link_name = "kCGWindowAlpha"]
        static WINDOW_ALPHA: CFTypeRef;
        #[link_name = "kCGWindowBounds"]
        static WINDOW_BOUNDS: CFTypeRef;
    }

    #[link(name = "CoreFoundation", kind = "framework")]
    unsafe extern "C" {
        fn CFArrayGetCount(array: CFTypeRef) -> isize;
        fn CFArrayGetValueAtIndex(array: CFTypeRef, index: isize) -> CFTypeRef;
        fn CFDictionaryGetValue(dictionary: CFTypeRef, key: CFTypeRef) -> CFTypeRef;
        fn CFNumberGetValue(number: CFTypeRef, kind: isize, value: *mut c_void) -> u8;
        fn CFRelease(object: CFTypeRef);
    }

    fn address(selector: u32, scope: u32) -> PropertyAddress {
        PropertyAddress {
            selector,
            scope,
            element: ELEMENT_MAIN,
        }
    }

    /// How many bytes an audio property holds; `None` where it has none.
    fn audio_size(object: u32, selector: u32, scope: u32) -> Option<u32> {
        let address = address(selector, scope);
        let mut size: u32 = 0;
        // SAFETY: the address and out-pointer are valid for the call; no
        // qualifier is passed.
        let status = unsafe {
            AudioObjectGetPropertyDataSize(
                object,
                &raw const address,
                0,
                ptr::null(),
                &raw mut size,
            )
        };
        (status == 0).then_some(size)
    }

    /// An audio property holding a list of object ids.
    fn audio_ids(object: u32, selector: u32) -> Option<Vec<u32>> {
        let size = audio_size(object, selector, SCOPE_GLOBAL)?;
        let mut ids = vec![0_u32; size as usize / size_of::<u32>()];
        if ids.is_empty() {
            return Some(ids);
        }
        let address = address(selector, SCOPE_GLOBAL);
        let mut size = (ids.len() * size_of::<u32>()) as u32;
        // SAFETY: `size` is exactly the byte length of `ids`, which outlives
        // the call; CoreAudio writes at most that many bytes and reports how
        // many it did.
        let status = unsafe {
            AudioObjectGetPropertyData(
                object,
                &raw const address,
                0,
                ptr::null(),
                &raw mut size,
                ids.as_mut_ptr().cast(),
            )
        };
        if status != 0 {
            return None;
        }
        ids.truncate(size as usize / size_of::<u32>());
        Some(ids)
    }

    /// A 32-bit audio property: a flag, a count, a pid.
    fn audio_u32(object: u32, selector: u32) -> Option<u32> {
        let address = address(selector, SCOPE_GLOBAL);
        let mut value: u32 = 0;
        let mut size = size_of::<u32>() as u32;
        // SAFETY: `value` is a live u32 and `size` says exactly that.
        let status = unsafe {
            AudioObjectGetPropertyData(
                object,
                &raw const address,
                0,
                ptr::null(),
                &raw mut size,
                (&raw mut value).cast(),
            )
        };
        (status == 0 && size as usize == size_of::<u32>()).then_some(value)
    }

    /// Some other process is recording from any input, asked per process.
    /// `None` before macOS 14, where CoreAudio has no process objects.
    fn processes_recording() -> Option<bool> {
        let own = std::process::id();
        let processes = audio_ids(SYSTEM_OBJECT, PROCESSES)?;
        Some(processes.into_iter().any(|process| {
            audio_u32(process, PROCESS_IS_RUNNING_INPUT).is_some_and(|running| running != 0)
                && audio_u32(process, PROCESS_PID) != Some(own)
        }))
    }

    /// Some device with an input is running. Coarser than asking per
    /// process: a headset that is also playing music reads as recording.
    fn devices_recording() -> bool {
        audio_ids(SYSTEM_OBJECT, DEVICES)
            .unwrap_or_default()
            .into_iter()
            .filter(|&device| audio_size(device, STREAMS, SCOPE_INPUT).is_some_and(|size| size > 0))
            .any(|device| {
                audio_u32(device, IS_RUNNING_SOMEWHERE).is_some_and(|running| running != 0)
            })
    }

    fn microphone_live() -> bool {
        processes_recording().unwrap_or_else(devices_recording)
    }

    /// Every camera CoreMediaIO knows, built in, external or virtual.
    fn cameras() -> Vec<u32> {
        let address = address(DEVICES, SCOPE_GLOBAL);
        let mut size: u32 = 0;
        // SAFETY: the address and out-pointer are valid for the call.
        let status = unsafe {
            CMIOObjectGetPropertyDataSize(
                SYSTEM_OBJECT,
                &raw const address,
                0,
                ptr::null(),
                &raw mut size,
            )
        };
        if status != 0 {
            return Vec::new();
        }
        let mut ids = vec![0_u32; size as usize / size_of::<u32>()];
        if ids.is_empty() {
            return ids;
        }
        let mut used: u32 = 0;
        // SAFETY: the buffer is `ids`, exactly the byte length passed, and
        // outlives the call; `used` reports how much was written.
        let status = unsafe {
            CMIOObjectGetPropertyData(
                SYSTEM_OBJECT,
                &raw const address,
                0,
                ptr::null(),
                (ids.len() * size_of::<u32>()) as u32,
                &raw mut used,
                ids.as_mut_ptr().cast(),
            )
        };
        if status != 0 {
            return Vec::new();
        }
        ids.truncate(used as usize / size_of::<u32>());
        ids
    }

    fn camera_running(camera: u32) -> bool {
        let address = address(IS_RUNNING_SOMEWHERE, SCOPE_GLOBAL);
        let mut value: u32 = 0;
        let mut used: u32 = 0;
        // SAFETY: `value` is a live u32 and the size passed says exactly that.
        let status = unsafe {
            CMIOObjectGetPropertyData(
                camera,
                &raw const address,
                0,
                ptr::null(),
                size_of::<u32>() as u32,
                &raw mut used,
                (&raw mut value).cast(),
            )
        };
        status == 0 && value != 0
    }

    fn camera_live() -> bool {
        cameras().into_iter().any(camera_running)
    }

    /// A number in a window's dictionary, borrowed from it.
    ///
    /// SAFETY: `window` must be a live CFDictionary and `key` a CFString.
    unsafe fn number<T: Default>(window: CFTypeRef, key: CFTypeRef, kind: isize) -> Option<T> {
        // SAFETY: per the contract above; `value` matches `kind` in size.
        unsafe {
            let number = CFDictionaryGetValue(window, key);
            if number.is_null() {
                return None;
            }
            let mut value = T::default();
            (CFNumberGetValue(number, kind, (&raw mut value).cast()) != 0).then_some(value)
        }
    }

    /// The bounds of an ordinary, visible window someone else owns; `None`
    /// for anything else (a panel, the menu bar, a transparent helper, ours).
    ///
    /// SAFETY: `window` must be a live CFDictionary from the window list.
    unsafe fn app_window_bounds(window: CFTypeRef, own: i32) -> Option<Rect> {
        // SAFETY: the keys are CoreGraphics' own constants; values are
        // borrowed from `window` and read before it is released.
        unsafe {
            if number::<i32>(window, WINDOW_LAYER, SINT32)? != 0
                || number::<i32>(window, WINDOW_OWNER_PID, SINT32)? == own
                || number::<f64>(window, WINDOW_ALPHA, DOUBLE).unwrap_or(1.0) <= 0.0
            {
                return None;
            }
            let bounds = CFDictionaryGetValue(window, WINDOW_BOUNDS);
            let mut rect = Rect::default();
            if bounds.is_null() || !CGRectMakeWithDictionaryRepresentation(bounds, &raw mut rect) {
                return None;
            }
            (rect.width >= MIN_WINDOW_SIDE && rect.height >= MIN_WINDOW_SIDE).then_some(rect)
        }
    }

    /// The frontmost ordinary window, in the same global coordinates as
    /// `CGDisplayBounds`. A native full-screen app sits alone in its own
    /// Space, so while that Space is showing it is on screen and fills it.
    fn front_window() -> Option<Rect> {
        let own = std::process::id() as i32;
        // SAFETY: returns an owned array or null; every dictionary read from
        // it is used before the array is released.
        unsafe {
            let windows = CGWindowListCopyWindowInfo(ON_SCREEN_APP_WINDOWS, NULL_WINDOW);
            if windows.is_null() {
                return None;
            }
            let front = (0..CFArrayGetCount(windows))
                .find_map(|index| app_window_bounds(CFArrayGetValueAtIndex(windows, index), own));
            CFRelease(windows);
            front
        }
    }

    fn displays() -> Vec<Rect> {
        let mut ids = [0_u32; 16];
        let mut count: u32 = 0;
        // SAFETY: `ids` holds `ids.len()` entries and outlives the call.
        let status =
            unsafe { CGGetActiveDisplayList(ids.len() as u32, ids.as_mut_ptr(), &raw mut count) };
        if status != 0 {
            return Vec::new();
        }
        ids.iter()
            .take(count as usize)
            // SAFETY: a plain query on a display id the system just listed.
            .map(|&id| unsafe { CGDisplayBounds(id) })
            .collect()
    }

    fn fullscreen() -> bool {
        front_window().is_some_and(|window| {
            displays()
                .into_iter()
                .any(|display| window.matches(display))
        })
    }

    pub fn moment() -> Moment {
        Moment {
            call: microphone_live() || camera_live(),
            fullscreen: fullscreen(),
            // Focus has no public API to read, only an entitlement-gated one.
            do_not_disturb: false,
        }
    }

    pub fn supported() -> Supported {
        Supported {
            call: true,
            fullscreen: true,
            do_not_disturb: false,
        }
    }
}

#[cfg(target_os = "windows")]
mod platform {
    use std::ffi::c_void;
    use std::ptr;

    use super::{Moment, Supported};

    type Hkey = *mut c_void;

    /// `QUERY_USER_NOTIFICATION_STATE` values that mean something fills the
    /// screen: a full-screen app, a Direct3D game, presentation mode.
    const QUNS_BUSY: i32 = 2;
    const QUNS_RUNNING_D3D_FULL_SCREEN: i32 = 3;
    const QUNS_PRESENTATION_MODE: i32 = 4;

    /// `HKEY_CURRENT_USER`, `(HKEY)(ULONG_PTR)(LONG)0x80000001`: the LONG is
    /// negative, so it sign-extends on 64-bit.
    const HKEY_CURRENT_USER: isize = 0x8000_0001_u32 as i32 as isize;
    const KEY_READ: u32 = 0x0002_0019;
    const REG_QWORD: u32 = 11;
    const ERROR_SUCCESS: i32 = 0;
    const ERROR_MORE_DATA: i32 = 234;
    /// Registry key names are at most 255 characters.
    const MAX_KEY_NAME: usize = 256;
    /// A bound on the walk, well past any real consent store.
    const MAX_CHILDREN: u32 = 4096;

    /// Where Windows records, per app, when it last started and stopped
    /// using each device; the same store the tray's "in use" icon reads.
    const CONSENT_STORE: &str =
        r"Software\Microsoft\Windows\CurrentVersion\CapabilityAccessManager\ConsentStore";

    #[link(name = "shell32")]
    unsafe extern "system" {
        fn SHQueryUserNotificationState(state: *mut i32) -> i32;
    }

    #[link(name = "advapi32")]
    unsafe extern "system" {
        fn RegOpenKeyExW(
            key: Hkey,
            sub_key: *const u16,
            options: u32,
            desired: u32,
            result: *mut Hkey,
        ) -> i32;
        fn RegEnumKeyExW(
            key: Hkey,
            index: u32,
            name: *mut u16,
            name_len: *mut u32,
            reserved: *mut u32,
            class: *mut u16,
            class_len: *mut u32,
            last_write: *mut c_void,
        ) -> i32;
        fn RegQueryValueExW(
            key: Hkey,
            name: *const u16,
            reserved: *mut u32,
            kind: *mut u32,
            data: *mut u8,
            data_len: *mut u32,
        ) -> i32;
        fn RegCloseKey(key: Hkey) -> i32;
    }

    /// A NUL-terminated UTF-16 copy of `text`.
    fn wide(text: &str) -> Vec<u16> {
        text.encode_utf16().chain(Some(0)).collect()
    }

    /// An open registry key, closed on drop.
    struct Key(Hkey);

    impl Key {
        /// Opens `path` (NUL-terminated UTF-16) under `parent` for reading.
        fn open(parent: Hkey, path: &[u16]) -> Option<Self> {
            let mut key: Hkey = ptr::null_mut();
            // SAFETY: `path` is NUL-terminated and outlives the call; the
            // handle, on success, is owned by the returned `Key`.
            let status = unsafe { RegOpenKeyExW(parent, path.as_ptr(), 0, KEY_READ, &raw mut key) };
            (status == ERROR_SUCCESS && !key.is_null()).then_some(Self(key))
        }

        fn current_user(path: &str) -> Option<Self> {
            Self::open(
                ptr::without_provenance_mut(HKEY_CURRENT_USER as usize),
                &wide(path),
            )
        }

        fn child(&self, name: &[u16]) -> Option<Self> {
            Self::open(self.0, name)
        }

        /// Every subkey's name, NUL-terminated, ready to open.
        fn children(&self) -> Vec<Vec<u16>> {
            let mut names = Vec::new();
            for index in 0..MAX_CHILDREN {
                let mut name = [0_u16; MAX_KEY_NAME];
                let mut len = name.len() as u32;
                // SAFETY: `name` holds `len` characters and outlives the
                // call; the optional class and timestamp are not asked for.
                let status = unsafe {
                    RegEnumKeyExW(
                        self.0,
                        index,
                        name.as_mut_ptr(),
                        &raw mut len,
                        ptr::null_mut(),
                        ptr::null_mut(),
                        ptr::null_mut(),
                        ptr::null_mut(),
                    )
                };
                match status {
                    ERROR_SUCCESS => {
                        let mut owned = name[..(len as usize).min(name.len())].to_vec();
                        owned.push(0);
                        names.push(owned);
                    }
                    ERROR_MORE_DATA => {}
                    // No more items, or the key changed under the walk.
                    _ => break,
                }
            }
            names
        }

        /// A REG_QWORD value, or `None` where it is missing or another type.
        fn qword(&self, name: &str) -> Option<u64> {
            let name = wide(name);
            let mut kind: u32 = 0;
            let mut value: u64 = 0;
            let mut len = size_of::<u64>() as u32;
            // SAFETY: `name` is NUL-terminated; `value` is a live u64 and
            // `len` says exactly that.
            let status = unsafe {
                RegQueryValueExW(
                    self.0,
                    name.as_ptr(),
                    ptr::null_mut(),
                    &raw mut kind,
                    (&raw mut value).cast(),
                    &raw mut len,
                )
            };
            (status == ERROR_SUCCESS && kind == REG_QWORD && len as usize == size_of::<u64>())
                .then_some(value)
        }

        /// This app has started using the device and not yet stopped.
        fn in_use(&self) -> bool {
            self.qword("LastUsedTimeStart")
                .is_some_and(|start| start != 0)
                && self.qword("LastUsedTimeStop") == Some(0)
        }
    }

    impl Drop for Key {
        fn drop(&mut self) {
            // SAFETY: the handle came from RegOpenKeyExW and is closed once.
            unsafe {
                RegCloseKey(self.0);
            }
        }
    }

    /// Some app, packaged or not, is using this device right now. Packaged
    /// apps are direct children of the device's key; desktop apps sit one
    /// level down, under `NonPackaged`.
    fn device_in_use(device: &str) -> bool {
        let Some(store) = Key::current_user(&format!(r"{CONSENT_STORE}\{device}")) else {
            return false;
        };
        let non_packaged = wide("NonPackaged");
        store.children().iter().any(|name| {
            let Some(app) = store.child(name) else {
                return false;
            };
            if same_name(name, &non_packaged) {
                app.children()
                    .iter()
                    .any(|name| app.child(name).is_some_and(|app| app.in_use()))
            } else {
                app.in_use()
            }
        })
    }

    /// Registry names compare without regard to ASCII case.
    fn same_name(a: &[u16], b: &[u16]) -> bool {
        let lower = |unit: &u16| {
            u8::try_from(*unit).map_or(*unit, |byte| u16::from(byte.to_ascii_lowercase()))
        };
        a.len() == b.len() && a.iter().map(lower).eq(b.iter().map(lower))
    }

    fn fullscreen() -> bool {
        let mut state: i32 = 0;
        // SAFETY: the out-pointer is a live i32 for the call.
        let status = unsafe { SHQueryUserNotificationState(&raw mut state) };
        status == 0
            && matches!(
                state,
                QUNS_BUSY | QUNS_RUNNING_D3D_FULL_SCREEN | QUNS_PRESENTATION_MODE
            )
    }

    pub fn moment() -> Moment {
        Moment {
            call: device_in_use("microphone") || device_in_use("webcam"),
            fullscreen: fullscreen(),
            // Focus assist / Do not disturb has no documented way to be read.
            // `QUNS_QUIET_TIME` sounds like it but is the first hour after a
            // fresh install or upgrade, and the switch itself lives in an
            // undocumented CloudStore blob or WNF state that moves between
            // releases; reading either would break silently.
            do_not_disturb: false,
        }
    }

    pub fn supported() -> Supported {
        Supported {
            call: true,
            fullscreen: true,
            do_not_disturb: false,
        }
    }
}

#[cfg(target_os = "linux")]
mod platform {
    use std::fs;
    use std::path::Path;

    use zbus::zvariant::{OwnedValue, Value};

    use super::super::dbus::session;
    use super::{Moment, Supported};

    const ASOUND: &str = "/proc/asound";

    /// Every entry of `dir` whose name passes `keep`.
    fn entries<F>(dir: &Path, keep: F) -> impl Iterator<Item = fs::DirEntry> + use<F>
    where
        F: Fn(&str) -> bool,
    {
        fs::read_dir(dir)
            .into_iter()
            .flatten()
            .flatten()
            .filter(move |entry| entry.file_name().to_str().is_some_and(&keep))
    }

    /// Some ALSA capture substream is running. PipeWire and PulseAudio hold
    /// the device open while anything records, so this sees them too; a
    /// Bluetooth headset's microphone, which never touches ALSA, it does not.
    /// Cameras have no such shared record and are not asked.
    fn capture_running() -> bool {
        let card = |name: &str| {
            name.strip_prefix("card").is_some_and(|number| {
                !number.is_empty() && number.bytes().all(|b| b.is_ascii_digit())
            })
        };
        let capture = |name: &str| name.starts_with("pcm") && name.ends_with('c');
        let substream = |name: &str| name.starts_with("sub");
        entries(Path::new(ASOUND), card)
            .flat_map(|card| entries(&card.path(), capture))
            .flat_map(|pcm| entries(&pcm.path(), substream))
            .any(|sub| {
                fs::read_to_string(sub.path().join("status"))
                    .is_ok_and(|status| status.lines().any(|line| line.trim() == "state: RUNNING"))
            })
    }

    /// A boolean however deeply D-Bus wrapped it in variants.
    fn as_bool(value: &Value<'_>) -> Option<bool> {
        match value {
            Value::Bool(flag) => Some(*flag),
            Value::Value(inner) => as_bool(inner),
            _ => None,
        }
    }

    /// Ask one D-Bus method for a variant holding a yes or no.
    fn ask<B>(service: &str, path: &str, interface: &str, method: &str, body: &B) -> Option<bool>
    where
        B: serde::Serialize + zbus::zvariant::DynamicType,
    {
        let reply = session()?
            .call_method(Some(service), path, Some(interface), method, body)
            .ok()?;
        as_bool(&reply.body().deserialize::<OwnedValue>().ok()?)
    }

    /// Do Not Disturb, where the desktop says. KDE's notification server
    /// publishes it as `Inhibited`; GNOME keeps it as `show-banners`, which
    /// the settings portal reads for sandboxed apps and anyone else. KDE is
    /// asked first so a GTK portal installed beside it cannot answer for it.
    /// `None` where neither answers.
    fn quiet() -> Option<bool> {
        ask(
            "org.freedesktop.Notifications",
            "/org/freedesktop/Notifications",
            "org.freedesktop.DBus.Properties",
            "Get",
            &("org.freedesktop.Notifications", "Inhibited"),
        )
        .or_else(|| {
            ask(
                "org.freedesktop.portal.Desktop",
                "/org/freedesktop/portal/desktop",
                "org.freedesktop.portal.Settings",
                "Read",
                &("org.gnome.desktop.notifications", "show-banners"),
            )
            .map(|banners| !banners)
        })
    }

    pub fn moment() -> Moment {
        Moment {
            call: capture_running(),
            // Neither X11 nor Wayland says so over anything this app links.
            fullscreen: false,
            do_not_disturb: quiet().unwrap_or(false),
        }
    }

    pub fn supported() -> Supported {
        Supported {
            call: Path::new(ASOUND).is_dir(),
            fullscreen: false,
            do_not_disturb: quiet().is_some(),
        }
    }
}

#[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
mod platform {
    use super::{Moment, Supported};

    pub fn moment() -> Moment {
        Moment::default()
    }

    pub fn supported() -> Supported {
        Supported {
            call: false,
            fullscreen: false,
            do_not_disturb: false,
        }
    }
}
