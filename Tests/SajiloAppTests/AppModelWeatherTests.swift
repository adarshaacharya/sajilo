import Foundation
import Testing
@testable import SajiloApp

@MainActor
struct AppModelWeatherTests {
    @Test func keepsTheLastSuccessfulWeatherResultAcrossRelaunch() async throws {
        let suiteName = "com.sajilo.tests.weather.\(UUID().uuidString)"
        let defaults = try #require(UserDefaults(suiteName: suiteName))
        defer { defaults.removePersistentDomain(forName: suiteName) }

        let expected = WeatherSnapshot(
            location: .kathmandu,
            temperatureCelsius: 26.3,
            apparentTemperatureCelsius: 29.0,
            precipitationChance: 35,
            highCelsius: 29.1,
            lowCelsius: 20.6,
            condition: .drizzle,
            sunrise: nil,
            sunset: nil,
            daily: [],
            observedAt: Date(timeIntervalSince1970: 1_784_123_456),
            fetchedAt: Date(timeIntervalSince1970: 1_784_123_456)
        )
        let model = AppModel(
            defaults: defaults,
            weatherProvider: WeatherProviderStub(result: expected),
            autoLoadWeather: false
        )

        await model.refreshWeather()

        #expect(model.weather == expected)
        let relaunchedModel = AppModel(defaults: defaults, autoLoadWeather: false)
        #expect(relaunchedModel.weather == expected)
    }
}

private struct WeatherProviderStub: WeatherProviding {
    let result: WeatherSnapshot

    func currentWeather(at location: WeatherLocation) async throws -> WeatherSnapshot { result }
}
