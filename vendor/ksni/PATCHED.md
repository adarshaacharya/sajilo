# ksni, patched for Sajilo

This is [ksni](https://github.com/iovxw/ksni) 0.3.6, unmodified except for the
lines marked `// Sajilo:`. Sajilo's Linux tray uses it through `tray-icon`'s
`ksni` backend, which gets a left click on the icon (`Activate`), where the
older libappindicator backend could only ever open a menu. The root
`Cargo.toml` swaps it in with `[patch.crates-io]`.

The changes:

1. **The Ayatana label** (`src/dbus_interface.rs`, `src/service.rs`): the
   `XAyatanaLabel` and `XAyatanaLabelGuide` properties and the
   `XAyatanaNewLabel` signal, set from the item's title. GNOME's AppIndicator
   extension, Ubuntu's top bar, draws that label beside the icon; it is where
   the date shows. ksni has no label of its own.
2. **Starting before the panel** (`src/blocking.rs`): `spawn()` assumes a tray
   host will appear instead of failing when none is running yet, so an app
   started at login still gets its icon once the panel is up. The same fix
   is merged in tray-icon (tauri-apps/tray-icon#372) but not yet released.

Drop this copy once ksni has a label and a tray-icon release carries #372:
remove the `[patch.crates-io]` entry and this directory.

ksni is released into the public domain (`UNLICENSE`).
