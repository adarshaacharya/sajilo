<img src="docs/icon.png" alt="" width="120" height="120">

# Sajilo

Sajilo brings the Nepali calendar and everyday essentials to your Mac menu bar.



## Features

- Bikram Sambat calendar with AD dates, tithi, festivals, and public holidays
- Personal plans and optional reminders, saved only on your Mac
- Upcoming festivals and daily calendar details
- Bikram Sambat ↔ AD date converter
- Kathmandu weather and air quality
- Nepal Rastra Bank exchange rates
- Gold and silver rates, Nepal Oil Corporation fuel prices, and Kalimati produce prices
- Daily rashifal for all twelve signs, from Hamro Patro
- Nepali and English news headlines from nine Nepali newsrooms
- Quick tools for land, weight, VAT, and simple interest
- English, नेपाली, and mixed-language display options

## Install

**[Download Sajilo beta for Mac](https://github.com/adarshaacharya/sajilo/releases/download/v0.1.0-beta.3/Sajilo-macos-arm64.dmg)**

Open the downloaded file, then drag **Sajilo.app** into the Applications folder.

### First launch

This is a beta release and is not yet Apple-notarized, so macOS blocks it the first time with *"Apple could not verify Sajilo is free of malware"*. To allow it:

1. Open **Sajilo.app**, then click **Done** on the warning.
2. Go to **System Settings → Privacy & Security**.
3. Scroll down to **Security**. A line reads *"Sajilo" was blocked to protect your Mac*.
4. Click **Open Anyway** and authenticate.
5. Open **Sajilo.app** again.

You only do this once. Sajilo then lives in the menu bar — it has no Dock icon or window unless you turn one on in Settings.

> On macOS 14 and earlier you could Control-click the app and choose **Open** instead. macOS 15 removed that shortcut, so the steps above are the only way now.

## Run from source

Requires macOS 14+, Xcode 16+, and Apple Silicon.

```bash
git clone https://github.com/adarshaacharya/sajilo.git
cd sajilo
./scripts/run-local-app.sh
```

To run the tests:

```bash
swift test
```



## License

Sajilo is available under the [MIT License](LICENSE). Calendar-data notices are in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
