import Foundation

/// The weather locations Sajilo supports (PRD §5.4).
///
/// Coordinates are fixed and bundled, so a request never carries anything about
/// the user. Automatic, permission-based location and a custom coordinate entry
/// are separate features and deliberately not implied here.
enum WeatherLocation: String, CaseIterable, Identifiable, Codable, Sendable {
    case kathmandu
    case pokhara
    case lalitpur

    static let `default` = WeatherLocation.kathmandu

    var id: String { rawValue }

    var displayName: String {
        switch self {
        case .kathmandu: "Kathmandu"
        case .pokhara: "Pokhara"
        case .lalitpur: "Lalitpur"
        }
    }

    var nepaliName: String {
        switch self {
        case .kathmandu: "काठमाडौं"
        case .pokhara: "पोखरा"
        case .lalitpur: "ललितपुर"
        }
    }

    var latitude: Double {
        switch self {
        case .kathmandu: 27.7172
        case .pokhara: 28.2096
        case .lalitpur: 27.6588
        }
    }

    var longitude: Double {
        switch self {
        case .kathmandu: 85.3240
        case .pokhara: 83.9856
        case .lalitpur: 85.3247
        }
    }
}
