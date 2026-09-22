# Installing Sajilo

Download the file for your computer from
[Sajilo's GitHub Releases page](https://github.com/adarshaacharya/sajilo/releases/latest).
Only install Sajilo from there.

| Computer | Download |
|---|---|
| Mac with Apple Silicon (M1, M2, M3, M4) | `Sajilo-macos-arm64.dmg` |
| Intel Mac | `Sajilo-macos-x64.dmg` |
| Windows 10 or 11 (64-bit) | `Sajilo-windows-x64.exe` |
| Ubuntu, Debian, Linux Mint, Pop!_OS | `Sajilo-linux-amd64.deb` |
| Any other 64-bit Linux | `Sajilo-linux-x86_64.AppImage` |

After the first install Sajilo updates itself, and it starts when you log in.
You can turn that off in **Settings → Display → Startup → Launch at login**.

- [macOS](#macos)
- [Windows](#windows)
- [Linux](#linux)

## macOS

### First launch

Current beta builds are not yet Apple-signed or notarized, so macOS blocks the
first launch. Only continue if you downloaded Sajilo from
[Sajilo's GitHub Releases page](https://github.com/adarshaacharya/sajilo/releases).

1. Drag **Sajilo.app** onto the **Applications** shortcut in the `.dmg` window.

   <img src="docs/macos-first-launch/0-drag-to-applications.png" width="420" alt="Dragging Sajilo.app onto the Applications shortcut">

2. Open Sajilo from Applications, Launchpad, or Spotlight. macOS shows
   **"Sajilo" Not Opened** — click **Done** (not Move to Trash).

   <img src="docs/macos-first-launch/1-not-opened.png" width="260" alt="“Sajilo” Not Opened dialog">

3. Open **System Settings → Privacy & Security**, scroll to the **Security**
   section. You'll see *"Sajilo" was blocked to protect your Mac* with an
   **Open Anyway** button — click it.

   <img src="docs/macos-first-launch/2-open-anyway.png" width="480" alt="Security section showing the Open Anyway button">

4. Confirm **Open Anyway** again in the dialog that follows, then authenticate
   with Touch ID or your admin password.

   <img src="docs/macos-first-launch/3-confirm-open.png" width="240" alt="Open Sajilo confirmation dialog"> <img src="docs/macos-first-launch/4-authenticate.png" width="240" alt="Touch ID or admin password prompt">

Sajilo opens and now launches normally from Launchpad or Spotlight — no
Terminal needed. You only need to do this once per beta build. Sajilo lives in
the menu bar — it has no Dock icon or window unless you turn one on in
Settings.

<img src="docs/macos-first-launch/5-running.png" width="260" alt="Sajilo popover open, showing the calendar, weather, and Bazar cards">

> Proper Apple code signing and notarization are planned before the stable release;
> this workaround is temporary beta-installation guidance.

## Windows

### Install

1. Run **Sajilo-windows-x64.exe**.
2. Beta builds are not code-signed yet, so Windows SmartScreen shows
   **Windows protected your PC**. Click **More info**, then **Run anyway**.
   Only do this for a file you downloaded from the Releases page.
3. Follow the installer. It installs for your user account only, so it
   normally doesn't ask for an administrator password.

Windows 11 already includes Microsoft Edge WebView2, which Sajilo needs. On
Windows 10 the installer downloads it if it's missing, so stay online for the
first install.

### Find the tray icon

Sajilo lives in the system tray, next to the clock. Windows hides every
newly installed tray icon behind the **^** arrow, so after installing it can
look as if nothing happened.

1. Click the **^** arrow at the right end of the taskbar.
2. Drag the **Nepal flag** out of that panel and drop it next to the clock.

Or turn it on in **Settings → Personalization → Taskbar → Other system tray
icons → Sajilo**.

Click the flag to open Sajilo. Hover over it to see today's date, or
right-click it for the menu.

> Windows tray icons can't show text, so the Nepali date isn't written on the
> taskbar the way it is in the Mac menu bar. It's one click (or a hover) away.


## Linux

Sajilo needs a 64-bit (x86_64) system.

### Ubuntu, Debian, Linux Mint, Pop!_OS — `.deb`

```bash
sudo apt install ./Sajilo-linux-amd64.deb
```

Run it from the folder you downloaded to. `apt` also installs what Sajilo
needs (WebKitGTK and the AppIndicator library). Then open **Sajilo** from your
applications menu.

### Any other distribution — AppImage

```bash
chmod +x Sajilo-linux-x86_64.AppImage
./Sajilo-linux-x86_64.AppImage
```

If it doesn't start and mentions FUSE, install FUSE 2 — on Ubuntu 22.04 that's
`sudo apt install libfuse2`, on Ubuntu 24.04 `sudo apt install libfuse2t64`.

### Find the tray icon

Sajilo shows the Nepali date in your top bar through the StatusNotifier
(AppIndicator) tray.

- **KDE Plasma, Cinnamon, XFCE, MATE, Budgie**: works out of the box.
- **GNOME** (default Ubuntu, Fedora): GNOME has no tray by default. Install
  the **AppIndicator and KStatusNotifierItem Support** extension. Ubuntu ships
  it already enabled.

Linux trays don't pass clicks to apps, so open Sajilo from the tray icon's
menu: click the date, then **Open Sajilo**.
