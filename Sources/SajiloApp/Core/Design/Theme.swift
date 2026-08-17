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
        /// Gilt brass and red on system materials. The default.
        ///
        /// Chrome defers to the platform (system materials, hierarchical fills,
        /// the system separator): the HIG's third principle, and what stops a
        /// Mac utility reading as a cross-platform dark app. The accent does
        /// not defer. Borrowing `accentColor` means most users see stock blue,
        /// which says nothing about a Nepali calendar.
        ///
        /// Two marks, taken from a real source rather than picked as a hue.
        /// Brass is the metal of Newari temple finials and Patan metalwork,
        /// read against dark carved timber — which is what the panel already
        /// is. Red stays the print convention: Saturdays and public holidays,
        /// always as text and never as a fill.
        ///
        /// They sit only 36° apart in hue, which is fine because they never
        /// take the same form. One is a small filled plate, the other is
        /// coloured text, so there is nothing to confuse.
        case patro

        var id: String { rawValue }

        var displayName: String {
            switch self {
            case .himalayanDusk: "Himalayan Dusk"
            case .inkAndPaper: "Ink & Paper"
            case .patro: "Patro"
            }
        }
    }

    /// Set once at launch, and by previews before rendering. Deliberately not
    /// observable: retheming at runtime is not a product feature, this exists
    /// so the three directions can be compared side by side.
    @MainActor static var skin: Skin = .patro

    @MainActor
    enum Palette {
        /// The one accent. Marks today and the next festival — nothing else.
        static var brand: Color {
            switch skin {
            case .himalayanDusk:
                Color.dynamic(light: RGBA(0.72, 0.40, 0.09), dark: RGBA(0.91, 0.57, 0.23))
            case .inkAndPaper:
                Color.dynamic(light: RGBA(0.55, 0.11, 0.18), dark: RGBA(0.85, 0.35, 0.40))
            case .patro:
                // Lighter than `brandFill` so a small glyph still reads against
                // a dark panel, where the fill value would disappear.
                // The dark appearance is intentionally brighter than the
                // selected fill: small marks should read as gilt, not brown.
                // Light: #6B5219. Dark: #C39A4A.
                Color.dynamic(light: RGBA(0.420, 0.322, 0.098), dark: RGBA(0.765, 0.604, 0.290))
            }
        }

        /// The accent as a *filled surface* — today's cell, the date plate,
        /// the primary button.
        ///
        /// Deliberately deeper than `brand`. The two have opposite contrast
        /// requirements: a glyph accent must be light enough to read against a
        /// dark canvas, while a fill must be dark enough to carry white text.
        /// One token cannot do both — the bright saffron scores 2.5:1 against
        /// white, which forced near-black text and made every filled element
        /// look like a hazard label.
        static var brandFill: Color {
            switch skin {
            case .himalayanDusk:
                // #B0561A — 5.0:1 against white.
                Color.dynamic(light: RGBA(0.69, 0.34, 0.10), dark: RGBA(0.69, 0.34, 0.10))
            case .inkAndPaper:
                Color.dynamic(light: RGBA(0.55, 0.11, 0.18), dark: RGBA(0.55, 0.11, 0.18))
            case .patro:
                // Gilt brass, taken from the Kathmandu Valley's own building
                // palette: fired brick, carved timber, and the gilt finials and
                // metalwork the Patan smiths are known for. The panel is
                // already dark timber; this is the metal against it.
                //
                // #6B5219 light — 7.4:1 against white, 6.8:1 against the panel.
                // #8A6A2F dark  — 5.0:1 against white, 3.2:1 against the panel.
                //
                // Six earlier attempts are recorded so none are retried:
                // crimson read as a Hamro Patro clone; bright saffron scored
                // 2.5:1 against white and forced hazard-label dark text;
                // `Color.primary` over a translucent material lands mid-grey
                // and reads as *disabled*; the system accent gives most users
                // stock blue; teal read as a dashboard, not a patro; and
                // oxblood was still close enough to the genre's red to be
                // mistaken for it.
                Color.dynamic(light: RGBA(0.420, 0.322, 0.098), dark: RGBA(0.541, 0.416, 0.184))
            }
        }

        /// Foreground on `brandFill`.
        static var onBrandFill: Color {
            switch skin {
            case .himalayanDusk, .inkAndPaper:
                // Both fills were chosen dark enough to carry white.
                .white
            case .patro:
                // The fill is dark enough to carry white in either appearance,
                // so this needs no dynamic variant.
                .white
            }
        }

        /// A rise, wherever something can also fall.
        ///
        /// The accent used to serve here, on the argument that a third colour
        /// was worth avoiding. That was wrong once `holiday` red appears as the
        /// opposite: against red the eye reads green, and brass reads as
        /// "highlighted" rather than "up" — so a gain and a loss looked like
        /// two different kinds of emphasis instead of two directions. Every
        /// market surface in Nepal, ShareSansar included, uses green up and red
        /// down.
        ///
        /// Each value is tuned to the same contrast as that skin's own red,
        /// within 0.02:1, so a gain and a loss carry identical weight — a
        /// brighter green would make every rise shout over every fall. Warm
        /// enough to sit beside the vermilion rather than fight it, and never a
        /// pure terminal green.
        static var positive: Color {
            switch skin {
            case .himalayanDusk:
                Color.dynamic(light: RGBA(0.059, 0.452, 0.257), dark: RGBA(0.349, 0.697, 0.453))
            case .inkAndPaper:
                Color.dynamic(light: RGBA(0.048, 0.368, 0.210), dark: RGBA(0.364, 0.727, 0.473))
            case .patro:
                Color.dynamic(light: RGBA(0.059, 0.450, 0.256), dark: RGBA(0.349, 0.698, 0.454))
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
            case .patro:
                // A warmer vermilion than the system's signal red. It keeps
                // the printed-patro convention without looking like an error
                // state beside the brass accent.
                Color.dynamic(light: RGBA(0.694, 0.231, 0.196), dark: RGBA(1.000, 0.463, 0.408))
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
            case .patro:
                // Nothing over the material. Vibrancy letting the desktop
                // through is what anchors the panel to the Mac; a tint on top
                // is exactly what made it read as a generic dark app.
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
            case .patro:
                // Derived from the label colour rather than hardcoded
                // black/white, so it inverts with appearance on its own.
                Color.primary.opacity(0.04)
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
            case .patro:
                Color.primary.opacity(0.055)
            }
        }

        /// Hairline border that keeps surfaces legible on both materials.
        static var surfaceBorder: Color {
            switch skin {
            case .inkAndPaper:
                Color.dynamic(light: RGBA(0.42, 0.34, 0.24, 0.16), dark: .white(0.08))
            case .himalayanDusk:
                Color.dynamic(light: .black(0.07), dark: .white(0.09))
            case .patro:
                // The system hairline, so it matches every other divider on
                // screen instead of approximating one.
                Color(nsColor: .separatorColor)
            }
        }

        /// Precipitation drawn over a normal surface rather than the weather
        /// hero's dark sky, where plain white would be invisible in light mode.
        static let particle = Color.primary.opacity(0.35)

        /// Pointer feedback for calendar days and icon buttons.
        static var hover: Color {
            switch skin {
            case .patro: Color.primary.opacity(0.08)
            case .himalayanDusk, .inkAndPaper:
                Color.dynamic(light: .black(0.06), dark: .white(0.10))
            }
        }
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
