import AppKit
import SwiftUI

/// Design tokens for Sajilo.
///
/// Every spacing value, corner radius, colour, and Devanagari font in the app
/// resolves through this type. Views must not hard-code numbers or colours;
/// unstyled defaults scattered across views are what made the first dashboard
/// read as a prototype rather than a Mac utility.
enum Theme {
    enum Space {
        static let xxs: CGFloat = 2
        static let xs: CGFloat = 4
        static let s: CGFloat = 8
        static let m: CGFloat = 12
        static let l: CGFloat = 16
        static let xl: CGFloat = 20
    }

    enum Radius {
        static let day: CGFloat = 8
        static let card: CGFloat = 12
        static let panel: CGFloat = 14
    }

    enum Metric {
        /// PRD §4.2 targets a ~380 pt glanceable popover.
        static let popoverWidth: CGFloat = 380
        /// Six rows of this plus spacing is the calendar's fixed height. Sized
        /// to fit a Devanagari numeral over its Gregorian counterpart and no
        /// more — a taller cell leaves a dead band under short months.
        static let dayCell: CGFloat = 34
        static let heroNumeral: CGFloat = 40
    }
}

// MARK: - Colour

/// A `Sendable` colour literal. Storing components rather than an `NSColor`
/// keeps the dynamic provider closure below free of non-`Sendable` captures.
struct RGBA: Sendable {
    let red: Double
    let green: Double
    let blue: Double
    let alpha: Double

    init(_ red: Double, _ green: Double, _ blue: Double, _ alpha: Double = 1) {
        self.red = red
        self.green = green
        self.blue = blue
        self.alpha = alpha
    }

    static func white(_ alpha: Double) -> RGBA { RGBA(1, 1, 1, alpha) }
    static func black(_ alpha: Double) -> RGBA { RGBA(0, 0, 0, alpha) }

    var nsColor: NSColor {
        NSColor(srgbRed: red, green: green, blue: blue, alpha: alpha)
    }
}

extension Color {
    /// An appearance-aware colour without an asset catalog.
    ///
    /// `NSColor`'s dynamic provider is re-evaluated whenever the system
    /// appearance changes, so light/dark switching needs no view-level work.
    /// Asset catalogs would force `bundle: .module` lookups at every call site
    /// in a SwiftPM target.
    static func dynamic(light: RGBA, dark: RGBA) -> Color {
        Color(nsColor: NSColor(name: nil) { appearance in
            let match = appearance.bestMatch(from: [.aqua, .darkAqua])
            return (match == .darkAqua ? dark : light).nsColor
        })
    }
}

extension Theme {
    /// The app's visual identity, swappable in one place.
    ///
    /// The first palette leaned on flag crimson for the header wash, the hero
    /// numeral, Saturdays, holidays, event dots and today — six jobs for one
    /// colour. An accent carrying that much stops reading as an accent and
    /// starts reading as the background, which is exactly the red-on-dark look
    /// every other Nepali calendar app already has. Each skin below demotes the
    /// accent to a mark and gives the app a real base hue instead of neutral
    /// grey, so hierarchy comes from surface and weight rather than saturation.
    enum Skin: String, CaseIterable, Identifiable, Sendable {
        /// Cool slate-indigo base with a warm saffron mark. Nepali without
        /// being flag-red.
        case himalayanDusk
        /// Parchment and ink, like a printed patro. Type carries the hierarchy;
        /// a single deep crimson marks today and nothing else.
        case inkAndPaper
        /// Greyscale on system materials, following the user's macOS accent.
        case macNative

        var id: String { rawValue }

        var displayName: String {
            switch self {
            case .himalayanDusk: "Himalayan Dusk"
            case .inkAndPaper: "Ink & Paper"
            case .macNative: "Mac Native"
            }
        }
    }

    /// Set once at launch, and by previews before rendering. Deliberately not
    /// observable: retheming at runtime is not a product feature, this exists
    /// so the three directions can be compared side by side.
    @MainActor static var skin: Skin = .himalayanDusk

    @MainActor
    enum Palette {
        /// The one accent. Marks today and the next festival — nothing else.
        static var brand: Color {
            switch skin {
            case .himalayanDusk:
                Color.dynamic(light: RGBA(0.72, 0.40, 0.09), dark: RGBA(0.91, 0.57, 0.23))
            case .inkAndPaper:
                Color.dynamic(light: RGBA(0.55, 0.11, 0.18), dark: RGBA(0.85, 0.35, 0.40))
            case .macNative:
                Color.accentColor
            }
        }

        /// Foreground for content sitting on `brand`. Saffron is light enough
        /// in dark mode that white on it fails contrast, so that case flips to
        /// near-black rather than shipping unreadable text.
        static var onBrand: Color {
            switch skin {
            case .himalayanDusk:
                Color.dynamic(light: .white(1), dark: RGBA(0.09, 0.11, 0.15))
            case .inkAndPaper, .macNative:
                .white
            }
        }

        /// Saturdays and public holidays. Text only — never a fill, so the
        /// grid does not turn into a wall of colour.
        static var holiday: Color {
            switch skin {
            case .himalayanDusk:
                Color.dynamic(light: RGBA(0.65, 0.28, 0.18), dark: RGBA(0.88, 0.54, 0.43))
            case .inkAndPaper:
                Color.dynamic(light: RGBA(0.45, 0.28, 0.16), dark: RGBA(0.80, 0.62, 0.45))
            case .macNative:
                Color(nsColor: .systemRed)
            }
        }

        /// Base tint laid over the popover's material. This is what stops the
        /// app reading as unstyled grey.
        static var canvas: Color {
            switch skin {
            case .himalayanDusk:
                Color.dynamic(light: RGBA(0.97, 0.96, 0.94, 0.50), dark: RGBA(0.09, 0.11, 0.15, 0.55))
            case .inkAndPaper:
                Color.dynamic(light: RGBA(0.96, 0.94, 0.90, 0.62), dark: RGBA(0.08, 0.07, 0.06, 0.62))
            case .macNative:
                .clear
            }
        }

        /// Route headers. No coloured band any more — separation comes from a
        /// slightly raised surface plus a hairline.
        static var headerSurface: Color {
            switch skin {
            case .himalayanDusk:
                Color.dynamic(light: .white(0.42), dark: .white(0.045))
            case .inkAndPaper:
                Color.dynamic(light: RGBA(1, 0.99, 0.96, 0.45), dark: .white(0.04))
            case .macNative:
                Color.dynamic(light: .white(0.35), dark: .white(0.04))
            }
        }

        /// Raised grouping fill. Replaces the `Divider()` rules that were doing
        /// the layout's structural work.
        static var surface: Color {
            switch skin {
            case .himalayanDusk:
                Color.dynamic(light: .white(0.62), dark: .white(0.055))
            case .inkAndPaper:
                Color.dynamic(light: RGBA(1, 0.99, 0.97, 0.66), dark: .white(0.05))
            case .macNative:
                Color.dynamic(light: .white(0.58), dark: .white(0.06))
            }
        }

        /// Hairline border that keeps surfaces legible on both materials.
        static var surfaceBorder: Color {
            switch skin {
            case .inkAndPaper:
                Color.dynamic(light: RGBA(0.42, 0.34, 0.24, 0.16), dark: .white(0.08))
            case .himalayanDusk, .macNative:
                Color.dynamic(light: .black(0.07), dark: .white(0.09))
            }
        }

        /// Precipitation drawn over a normal surface rather than the weather
        /// hero's dark sky, where plain white would be invisible in light mode.
        static let particle = Color.dynamic(
            light: .black(0.30),
            dark: .white(0.45)
        )

        /// Pointer feedback for calendar days and icon buttons.
        static let hover = Color.dynamic(
            light: .black(0.06),
            dark: .white(0.10)
        )
    }
}

// MARK: - Typography

extension Font {
    /// Devanagari conjuncts need a face with real vertical room. The system
    /// font's fallback clips matras at the small sizes SwiftUI's `.caption`
    /// styles use, which is the typography risk called out in PRD §10.
    ///
    /// `Font.custom` silently falls back to the system font when the family is
    /// unavailable, so this is safe on any macOS 14 install.
    static func nepali(_ size: CGFloat, weight: Font.Weight = .regular) -> Font {
        .custom("Kohinoor Devanagari", size: size).weight(weight)
    }
}
