# Sajilo

Sajilo brings the Nepali calendar and everyday essentials to your Mac menu bar.



Features

- Bikram Sambat calendar with AD dates, tithi, festivals, and public holidays
- Personal plans and optional reminders, saved only on your Mac
- Upcoming festivals and daily calendar details
- Kathmandu weather and air quality
- Nepal Rastra Bank exchange rates
- Gold and silver rates, and Nepal Oil Corporation fuel prices
- Nepali news headlines
- Quick tools for land, weight, VAT, and simple interest
- English, नेपाली, and mixed-language display options

## Install

**[Download Sajilo for Mac](https://github.com/adarshaacharya/sajilo/releases/latest/download/Sajilo-macos-arm64.dmg)**

Open the downloaded file, then drag **Sajilo.app** into the Applications folder.

Because this is a free direct download and is not Apple-notarized, macOS may block the first launch. Control-click **Sajilo.app**, choose **Open**, then choose **Open** again. After that, find Sajilo's icon in the menu bar.

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