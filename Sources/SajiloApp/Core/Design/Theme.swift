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
        static let dayCell: CGFloat = 38
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
    enum Palette {
        /// Nepal's flag crimson, lightened in dark mode so it keeps contrast
        /// against the popover's dark material. This is the app's only accent;
        /// everything else stays native greyscale.
        static let brand = Color.dynamic(
            light: RGBA(0.76, 0.08, 0.20),
            dark: RGBA(0.98, 0.38, 0.45)
        )

        /// Saturdays and public holidays, which Nepali calendars print in red.
        static let holiday = brand

        /// Wash behind the date header, tying the accent into the layout
        /// without colouring large areas of text.
        static let brandWash = Color.dynamic(
            light: RGBA(0.76, 0.08, 0.20, 0.08),
            dark: RGBA(0.98, 0.38, 0.45, 0.14)
        )

        /// Raised grouping fill. Replaces the `Divider()` rules that were doing
        /// the layout's structural work.
        static let surface = Color.dynamic(
            light: .white(0.58),
            dark: .white(0.06)
        )

        /// Hairline border that keeps surfaces legible on both materials.
        static let surfaceBorder = Color.dynamic(
            light: .black(0.07),
            dark: .white(0.09)
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
