// The Windows release build must not open a console window behind the popover.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    sajilo_desktop_lib::run();
}
