import SwiftUI

/// Time of day at the weather location, used to tint the detail backdrop.
///
/// Derived from the real sunrise and sunset the provider returns rather than
/// fixed clock hours, so the transition tracks Nepal's actual day. Falls back
/// to hour bands only when the payload carried no sun times.
enum SkyPhase: Equatable, Sendable {
    case night
    case dawn
    case day
    case dusk

    static func current(
        now: Date = .now,
        sunrise: Date?,
        sunset: Date?,
        calendar: Calendar = .nepal
    ) -> SkyPhase {
        guard let sunrise, let sunset else { return fallback(now: now, calendar: calendar) }

        // The civil-twilight-ish window either side of the horizon crossing.
        let twilight: TimeInterval = 45 * 60

        if now < sunrise.addingTimeInterval(-twilight) { return .night }
        if now < sunrise.addingTimeInterval(twilight) { return .dawn }
        if now < sunset.addingTimeInterval(-twilight) { return .day }
        if now < sunset.addingTimeInterval(twilight) { return .dusk }
        return .night
    }

    private static func fallback(now: Date, calendar: Calendar) -> SkyPhase {
        switch calendar.component(.hour, from: now) {
        case 0..<5, 20..<24: .night
        case 5..<7: .dawn
        case 7..<17: .day
        default: .dusk
        }
    }

    /// Sky colours, top to bottom. Deliberately muted: this sits behind text in
    /// a small panel, not a full-screen weather app.
    var gradient: [RGBA] {
        switch self {
        case .night:
            [RGBA(0.06, 0.09, 0.20), RGBA(0.10, 0.12, 0.24)]
        case .dawn:
            [RGBA(0.36, 0.30, 0.46), RGBA(0.85, 0.51, 0.40)]
        case .day:
            [RGBA(0.22, 0.51, 0.78), RGBA(0.53, 0.74, 0.90)]
        case .dusk:
            [RGBA(0.28, 0.24, 0.42), RGBA(0.78, 0.42, 0.36)]
        }
    }

    /// Every phase uses a dark-enough sky that white text reads cleanly, so the
    /// foreground is fixed rather than adapting to appearance.
    var prefersLightForeground: Bool { true }

    var isDaylight: Bool {
        self == .day || self == .dawn
    }

    var accessibilityDescription: String {
        switch self {
        case .night: "night"
        case .dawn: "dawn"
        case .day: "daytime"
        case .dusk: "dusk"
        }
    }
}

extension Calendar {
    /// Weather is reported for Nepal, so time of day is judged there rather
    /// than wherever the user happens to be.
    static let nepal: Calendar = {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "Asia/Kathmandu")!
        return calendar
    }()
}

extension LinearGradient {
    init(sky phase: SkyPhase) {
        self.init(
            colors: phase.gradient.map { Color(nsColor: $0.nsColor) },
            startPoint: .top,
            endPoint: .bottom
        )
    }
}
