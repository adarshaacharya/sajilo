# Development guide

## Prerequisites

- macOS 14 or later
- Xcode 16 or later with command-line tools selected
- Swift 6.2 or later

Open `Package.swift` in Xcode, select the **Sajilo** scheme, and run it. The app should appear as a menu-bar utility.

## Commands

```bash
swift test
swift run Sajilo
```

The current computer has Command Line Tools rather than full Xcode. It can build the SwiftUI app target, but it does not ship the `Testing` module needed by the Swift Testing target. Use full Xcode for the complete test suite.

## Configuration policy

- Never commit API keys or local `.env` files.
- Add a local provider configuration only when an external source truly requires a key.
- A first release should work with local calendar data and direct, keyless public data sources where possible.
- Do not make an account system or personal-data backend a prerequisite for launch.
