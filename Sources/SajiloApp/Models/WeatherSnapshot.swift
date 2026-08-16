import Foundation

struct WeatherSnapshot: Codable, Equatable, Sendable {
    /// Which place this reading describes. Without it a cached Kathmandu
    /// reading could be rendered under a Pokhara heading.
    let location: WeatherLocation
    let temperatureCelsius: Double
    let apparentTemperatureCelsius: Double
    /// Chance of precipitation, 0–100.
    let precipitationChance: Int
    let highCelsius: Double
    let lowCelsius: Double
    let condition: WeatherCondition
    /// Today's sunrise and sunset at the selected location, used to place the
    /// sky phase against the real day rather than fixed clock hours.
    let sunrise: Date?
    let sunset: Date?
    /// Today first, then the following days (PRD §5.4).
    let daily: [DailyForecast]
    /// Optional by design: air quality comes from a separate endpoint, and a
    /// forecast is still worth showing when only that one is unreachable.
    var airQuality: AirQuality?
    /// When the reading was taken at source.
    let observedAt: Date
    /// When Sajilo retrieved it. Drives the refresh schedule; `observedAt`
    /// drives what the user is told.
    let fetchedAt: Date

    var temperatureText: String { Self.degrees(temperatureCelsius) }
    var apparentTemperatureText: String { "Feels like \(Self.degrees(apparentTemperatureCelsius))" }
    var rangeText: String { "H \(Self.degrees(highCelsius)) L \(Self.degrees(lowCelsius))" }
    var precipitationText: String { "Rain \(precipitationChance)%" }

    var tomorrow: DailyForecast? {
        daily.count > 1 ? daily[1] : nil
    }

    static func degrees(_ value: Double) -> String {
        "\(Int(value.rounded()))°"
    }
}

struct DailyForecast: Codable, Equatable, Sendable, Identifiable {
    let date: Date
    let highCelsius: Double
    let lowCelsius: Double
    let condition: WeatherCondition
    let precipitationChance: Int

    var id: Date { date }

    var highText: String { WeatherSnapshot.degrees(highCelsius) }
    var lowText: String { WeatherSnapshot.degrees(lowCelsius) }
}

enum WeatherCondition: String, Codable, Equatable, Sendable {
    case clear
    case partlyCloudy
    case overcast
    case fog
    case drizzle
    case rain
    case snow
    case showers
    case thunderstorm
    case unknown

    var title: String {
        switch self {
        case .clear: "Clear"
        case .partlyCloudy: "Partly cloudy"
        case .overcast: "Overcast"
        case .fog: "Fog"
        case .drizzle: "Drizzle"
        case .rain: "Rain"
        case .snow: "Snow"
        case .showers: "Showers"
        case .thunderstorm: "Thunderstorm"
        case .unknown: "Weather unavailable"
        }
    }

    var symbolName: String {
        switch self {
        case .clear: "sun.max.fill"
        case .partlyCloudy: "cloud.sun.fill"
        case .overcast: "cloud.fill"
        case .fog: "cloud.fog.fill"
        case .drizzle: "cloud.drizzle.fill"
        case .rain: "cloud.rain.fill"
        case .snow: "cloud.snow.fill"
        case .showers: "cloud.heavyrain.fill"
        case .thunderstorm: "cloud.bolt.rain.fill"
        case .unknown: "cloud.fill"
        }
    }

    /// What, if anything, should fall or drift across the detail backdrop.
    var precipitation: Precipitation {
        switch self {
        case .drizzle: .init(kind: .rain, density: 40, speed: 0.55, length: 5)
        case .rain: .init(kind: .rain, density: 90, speed: 0.95, length: 9)
        case .showers: .init(kind: .rain, density: 130, speed: 1.2, length: 12)
        case .thunderstorm: .init(kind: .rain, density: 150, speed: 1.35, length: 14)
        case .snow: .init(kind: .snow, density: 60, speed: 0.18, length: 3)
        case .clear, .partlyCloudy, .overcast, .fog, .unknown: .none
        }
    }

    struct Precipitation: Equatable, Sendable {
        enum Kind: Equatable, Sendable { case rain, snow }

        let kind: Kind
        let density: Int
        let speed: Double
        let length: Double

        static let none = Precipitation(kind: .rain, density: 0, speed: 0, length: 0)
        var isEmpty: Bool { density == 0 }
    }
}
