import SwiftUI

/// Air quality for the selected city.
///
/// Kathmandu's air is something people check the way they check rain, which is
/// why this sits inside Weather rather than becoming its own module.
struct AirQuality: Codable, Equatable, Sendable {
    /// US EPA index. Chosen over Open-Meteo's European index because Nepal's
    /// Department of Environment reports on the EPA scale, so this is the
    /// number people already recognise from local reporting.
    let usAQI: Int
    /// Fine particulates, µg/m³ — the pollutant that actually drives
    /// Kathmandu's index most days.
    let pm25: Double
    let pm10: Double
    let observedAt: Date

    var category: AQICategory { AQICategory(usAQI) }

    var indexText: String { "\(usAQI)" }
    var pm25Text: String { "\(Int(pm25.rounded())) µg/m³" }
    var pm10Text: String { "\(Int(pm10.rounded())) µg/m³" }
}

/// US EPA breakpoints, with the plain-language health line each one carries.
enum AQICategory: Equatable, Sendable, CaseIterable {
    case good
    case moderate
    case unhealthyForSensitive
    case unhealthy
    case veryUnhealthy
    case hazardous

    init(_ aqi: Int) {
        switch aqi {
        case ..<51: self = .good
        case 51...100: self = .moderate
        case 101...150: self = .unhealthyForSensitive
        case 151...200: self = .unhealthy
        case 201...300: self = .veryUnhealthy
        default: self = .hazardous
        }
    }

    var title: LocalizedStringResource {
        switch self {
        case .good: L10n.aqiGood
        case .moderate: L10n.aqiModerate
        case .unhealthyForSensitive: L10n.aqiSensitive
        case .unhealthy: L10n.aqiUnhealthy
        case .veryUnhealthy: L10n.aqiVeryUnhealthy
        case .hazardous: L10n.aqiHazardous
        }
    }

    var advice: LocalizedStringResource {
        switch self {
        case .good: L10n.aqiAdviceGood
        case .moderate: L10n.aqiAdviceModerate
        case .unhealthyForSensitive: L10n.aqiAdviceSensitive
        case .unhealthy: L10n.aqiAdviceUnhealthy
        case .veryUnhealthy: L10n.aqiAdviceVeryUnhealthy
        case .hazardous: L10n.aqiAdviceHazardous
        }
    }

    /// A deliberate exception to the brass-and-red palette.
    ///
    /// The AQI scale is a published convention people already read off IQAir,
    /// news bulletins and roadside displays — green through maroon carries
    /// meaning that an app's own accent colour cannot. Same reasoning as the
    /// holiday red: where a colour is already a standard, matching it beats
    /// being consistent with ourselves. Values are darkened from the raw EPA
    /// swatches so they hold up as text on both appearances.
    var tint: Color {
        switch self {
        case .good:
            Color.dynamic(light: RGBA(0.13, 0.51, 0.24), dark: RGBA(0.42, 0.78, 0.47))
        case .moderate:
            Color.dynamic(light: RGBA(0.62, 0.47, 0.05), dark: RGBA(0.90, 0.75, 0.28))
        case .unhealthyForSensitive:
            Color.dynamic(light: RGBA(0.73, 0.38, 0.05), dark: RGBA(0.98, 0.62, 0.25))
        case .unhealthy:
            Color.dynamic(light: RGBA(0.75, 0.16, 0.16), dark: RGBA(0.98, 0.45, 0.45))
        case .veryUnhealthy:
            Color.dynamic(light: RGBA(0.48, 0.20, 0.55), dark: RGBA(0.78, 0.51, 0.85))
        case .hazardous:
            Color.dynamic(light: RGBA(0.45, 0.09, 0.16), dark: RGBA(0.85, 0.40, 0.48))
        }
    }

    /// Where this band starts, for the scale bar.
    var lowerBound: Int {
        switch self {
        case .good: 0
        case .moderate: 51
        case .unhealthyForSensitive: 101
        case .unhealthy: 151
        case .veryUnhealthy: 201
        case .hazardous: 301
        }
    }
}
