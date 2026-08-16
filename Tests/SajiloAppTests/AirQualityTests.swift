import Foundation
import Testing
@testable import SajiloApp

struct AirQualityTests {
    /// A real Open-Meteo air-quality response for Kathmandu.
    private static let payload = Data("""
    {
      "current_units": { "us_aqi": "USAQI", "pm2_5": "μg/m³", "pm10": "μg/m³" },
      "current": { "time": "2026-08-16T12:45", "interval": 3600,
                   "us_aqi": 93, "pm2_5": 13.5, "pm10": 14.7 }
    }
    """.utf8)

    @Test func decodesTheLiveResponse() throws {
        let air = try #require(OpenMeteoWeatherProvider.decodeAirQuality(Self.payload))

        #expect(air.usAQI == 93)
        #expect(air.category == .moderate)
        #expect(air.pm25Text == "14 µg/m³")
        #expect(air.pm10Text == "15 µg/m³")
    }

    /// US EPA breakpoints. Boundaries matter — 50/51 and 100/101 are where the
    /// public health advice actually changes.
    @Test(arguments: [
        (0, AQICategory.good), (50, .good), (51, .moderate), (93, .moderate),
        (100, .moderate), (101, .unhealthyForSensitive), (150, .unhealthyForSensitive),
        (151, .unhealthy), (200, .unhealthy), (201, .veryUnhealthy),
        (300, .veryUnhealthy), (301, .hazardous), (500, .hazardous)
    ])
    func mapsIndexToBand(index: Int, expected: AQICategory) {
        #expect(AQICategory(index) == expected)
    }

    @Test func everyBandHasATitleAndAdvice() {
        for band in AQICategory.allCases {
            #expect(!String(localized: band.title).isEmpty)
            #expect(!String(localized: band.advice).isEmpty)
        }
    }

    @Test func bandsAreOrderedAndContiguous() {
        let bounds = AQICategory.allCases.map(\.lowerBound)
        #expect(bounds == bounds.sorted())
        #expect(bounds.first == 0)
        // Each band starts one above where the previous one ends.
        for band in AQICategory.allCases where band != .good {
            #expect(AQICategory(band.lowerBound) == band)
            #expect(AQICategory(band.lowerBound - 1) != band)
        }
    }

    /// A malformed or partial response must yield nothing rather than a
    /// zeroed-out reading that would render as "Good".
    @Test func returnsNothingWhenTheIndexIsMissing() {
        let noIndex = Data("""
        { "current": { "time": "2026-08-16T12:45", "pm2_5": 13.5 } }
        """.utf8)
        #expect(OpenMeteoWeatherProvider.decodeAirQuality(noIndex) == nil)
        #expect(OpenMeteoWeatherProvider.decodeAirQuality(Data("{}".utf8)) == nil)
        #expect(OpenMeteoWeatherProvider.decodeAirQuality(Data("not json".utf8)) == nil)
    }

    /// Particulates can be absent while the index is present; that should cost
    /// the detail lines, not the reading.
    @Test func toleratesMissingParticulates() throws {
        let indexOnly = Data("""
        { "current": { "time": "2026-08-16T12:45", "us_aqi": 210 } }
        """.utf8)

        let air = try #require(OpenMeteoWeatherProvider.decodeAirQuality(indexOnly))
        #expect(air.usAQI == 210)
        #expect(air.category == .veryUnhealthy)
    }

    /// Weather must survive air quality being unavailable — they are separate
    /// endpoints and only one of them is the reason to open the panel.
    @Test func weatherSnapshotWorksWithoutAirQuality() {
        let snapshot = WeatherSnapshot(
            location: .kathmandu, temperatureCelsius: 21, apparentTemperatureCelsius: 25,
            precipitationChance: 60, highCelsius: 26, lowCelsius: 20, condition: .drizzle,
            sunrise: nil, sunset: nil, daily: [], airQuality: nil,
            observedAt: .now, fetchedAt: .now
        )

        #expect(snapshot.airQuality == nil)
        #expect(snapshot.temperatureText == "21°")
    }
}
