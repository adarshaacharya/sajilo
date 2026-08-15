import Foundation
import Testing
@testable import SajiloApp

struct OpenMeteoWeatherProviderTests {
    @Test func decodesCurrentConditionsAndTodayRange() throws {
        let payload = Data("""
        {
          "current": { "time": "2026-08-16T02:45", "temperature_2m": 27.4, "apparent_temperature": 29.6, "precipitation_probability": 35, "weather_code": 2 },
          "daily": { "time": ["2026-08-16"], "temperature_2m_max": [29.2], "temperature_2m_min": [21.1], "weather_code": [2], "precipitation_probability_max": [35], "sunrise": ["2026-08-16T05:34"], "sunset": ["2026-08-16T18:41"] }
        }
        """.utf8)
        let fetchedAt = Date(timeIntervalSince1970: 1_784_123_456)

        let snapshot = try OpenMeteoWeatherProvider.decode(payload, location: .kathmandu, fetchedAt: fetchedAt)

        #expect(snapshot.temperatureText == "27°")
        #expect(snapshot.rangeText == "H 29° L 21°")
        #expect(snapshot.condition == .partlyCloudy)
        #expect(snapshot.fetchedAt == fetchedAt)
        #expect(snapshot.location == .kathmandu)
        #expect(snapshot.apparentTemperatureText == "Feels like 30°")
        #expect(snapshot.precipitationText == "Rain 35%")
        #expect(snapshot.daily.count == 1)
        #expect(snapshot.sunrise != nil)
        #expect(snapshot.sunset != nil)
    }

    /// The reading can be up to 15 minutes older than the response, so the
    /// source's own timestamp is what the freshness label must count from.
    @Test func prefersTheSourceObservationTimeOverTheFetchTime() throws {
        let payload = Data("""
        {
          "current": { "time": "2026-08-16T02:45", "temperature_2m": 20.9, "weather_code": 51 },
          "daily": { "time": ["2026-08-16"], "temperature_2m_max": [29.2], "temperature_2m_min": [21.1] }
        }
        """.utf8)

        let snapshot = try OpenMeteoWeatherProvider.decode(payload, location: .kathmandu, fetchedAt: .now)

        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "Asia/Kathmandu")!
        let parts = calendar.dateComponents([.year, .month, .day, .hour, .minute], from: snapshot.observedAt)

        #expect(parts.year == 2026)
        #expect(parts.month == 8)
        #expect(parts.day == 16)
        #expect(parts.hour == 2)
        #expect(parts.minute == 45)
        #expect(snapshot.observedAt != snapshot.fetchedAt)
    }

    /// An unparseable timestamp must not lose the whole response.
    @Test func fallsBackToTheFetchTimeWhenTheSourceTimeIsUnusable() throws {
        let payload = Data("""
        {
          "current": { "time": "not-a-date", "temperature_2m": 20.9, "weather_code": 0 },
          "daily": { "time": ["2026-08-16"], "temperature_2m_max": [29.2], "temperature_2m_min": [21.1] }
        }
        """.utf8)
        let fetchedAt = Date(timeIntervalSince1970: 1_784_123_456)

        let snapshot = try OpenMeteoWeatherProvider.decode(payload, location: .kathmandu, fetchedAt: fetchedAt)

        #expect(snapshot.observedAt == fetchedAt)
    }

    @Test func rejectsAResponseWithoutTodayRange() {
        let payload = Data("""
        {
          "current": { "time": "2026-08-16T02:45", "temperature_2m": 27.4, "weather_code": 0 },
          "daily": { "time": [], "temperature_2m_max": [], "temperature_2m_min": [] }
        }
        """.utf8)

        #expect(throws: WeatherProviderError.self) {
            try OpenMeteoWeatherProvider.decode(payload, location: .kathmandu, fetchedAt: .now)
        }
    }
}
