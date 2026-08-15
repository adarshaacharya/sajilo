import Foundation
import Testing
@testable import SajiloApp

@MainActor
struct WeatherLocationTests {
    @Test func defaultsToKathmanduAndPersistsAChange() {
        let defaults = makeDefaults()
        let model = makeModel(defaults: defaults, provider: StubProvider())
        #expect(model.selectedWeatherLocation == .kathmandu)

        model.selectedWeatherLocation = .pokhara

        let relaunched = makeModel(defaults: defaults, provider: StubProvider())
        #expect(relaunched.selectedWeatherLocation == .pokhara)
    }

    @Test func requestsTheSelectedLocation() async {
        let provider = StubProvider()
        let model = makeModel(provider: provider)

        model.selectedWeatherLocation = .lalitpur
        await model.refreshWeather()

        #expect(provider.requestedLocations.last == .lalitpur)
    }

    /// The defect this guards: showing one city's numbers under another's name.
    @Test func neverShowsOneCitysReadingUnderAnothersName() async {
        let defaults = makeDefaults()
        let provider = StubProvider()
        let model = makeModel(defaults: defaults, provider: provider)

        await model.refreshWeather()
        #expect(model.weather?.location == .kathmandu)
        #expect(weatherCard(model)?.title == "Kathmandu")

        model.selectedWeatherLocation = .pokhara

        // Pokhara has no cache yet, so the stale Kathmandu reading must be
        // dropped rather than relabelled.
        #expect(model.weather == nil)
        #expect(weatherCard(model)?.title == "Pokhara")

        await model.refreshWeather()
        #expect(model.weather?.location == .pokhara)
        #expect(weatherCard(model)?.title == "Pokhara")
    }

    @Test func keepsAPerCityCacheSoSwitchingBackIsInstant() async {
        let defaults = makeDefaults()
        let provider = StubProvider()
        let model = makeModel(defaults: defaults, provider: provider)

        await model.refreshWeather()
        model.selectedWeatherLocation = .pokhara
        await model.refreshWeather()

        model.selectedWeatherLocation = .kathmandu

        #expect(model.weather?.location == .kathmandu, "the earlier Kathmandu cache should still be there")
    }

    @Test func aCacheWrittenForOneCityIsNotReadableAsAnother() async {
        let defaults = makeDefaults()
        let seeded = makeModel(defaults: defaults, provider: StubProvider())
        await seeded.refreshWeather()

        let pokharaFirst = AppModel(
            defaults: defaults,
            weatherProvider: StubProvider(),
            autoLoadWeather: false
        )
        pokharaFirst.selectedWeatherLocation = .pokhara

        #expect(pokharaFirst.weather == nil)
    }

    @Test func everyLocationHasCoordinatesInsideNepal() {
        for location in WeatherLocation.allCases {
            #expect((26.3...30.5).contains(location.latitude), "\(location) latitude")
            #expect((80.0...88.3).contains(location.longitude), "\(location) longitude")
            #expect(!location.displayName.isEmpty)
            #expect(!location.nepaliName.isEmpty)
        }
    }

    // MARK: - Helpers

    private func weatherCard(_ model: AppModel) -> DashboardCard? {
        model.cards.first { $0.kind == .weather }
    }

    private func makeModel(defaults: UserDefaults? = nil, provider: any WeatherProviding) -> AppModel {
        AppModel(
            now: Date(timeIntervalSince1970: 1_786_838_400),
            defaults: defaults ?? makeDefaults(),
            weatherProvider: provider,
            autoLoadWeather: false
        )
    }

    private func makeDefaults() -> UserDefaults {
        let suite = "com.sajilo.tests.location.\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suite)!
        defaults.removePersistentDomain(forName: suite)
        return defaults
    }
}

/// Returns a reading stamped with whichever location was asked for.
private final class StubProvider: WeatherProviding, @unchecked Sendable {
    private(set) var requestedLocations: [WeatherLocation] = []

    func currentWeather(at location: WeatherLocation) async throws -> WeatherSnapshot {
        requestedLocations.append(location)
        return WeatherSnapshot(
            location: location,
            temperatureCelsius: 27.4,
            apparentTemperatureCelsius: 29.0,
            precipitationChance: 35,
            highCelsius: 29.2,
            lowCelsius: 21.1,
            condition: .partlyCloudy,
            sunrise: nil,
            sunset: nil,
            daily: [],
            observedAt: .now,
            fetchedAt: .now
        )
    }
}
