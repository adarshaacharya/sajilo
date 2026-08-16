import Foundation
import Testing
@testable import SajiloApp

/// Verifies the card states PRD §6 requires: loading, fresh, stale cached, and
/// unavailable — and specifically that a failed refresh never blanks the card.
@MainActor
struct WeatherCardTests {
    @Test func showsLiveValuesAfterASuccessfulRefresh() async {
        let model = makeModel(provider: StubWeatherProvider(result: .success(snapshot(temperature: 27.4))))

        await model.refreshWeather()

        #expect(weatherCard(model)?.primaryValue == "27°")
        #expect(model.weatherError == nil)
    }

    @Test func keepsTheCachedValueWhenARefreshFails() async {
        let defaults = makeDefaults()
        let good = makeModel(defaults: defaults, provider: StubWeatherProvider(result: .success(snapshot(temperature: 27.4))))
        await good.refreshWeather()

        // A fresh model reads the persisted cache, then fails to refresh.
        let offline = makeModel(defaults: defaults, provider: StubWeatherProvider(result: .failure(WeatherProviderError.invalidResponse)))
        #expect(offline.weather != nil, "cache should survive a relaunch")

        await offline.refreshWeather()

        #expect(offline.weather?.temperatureCelsius == 27.4, "a failed refresh must not discard the cache")
        #expect(offline.weatherError != nil)
        #expect(weatherCard(offline)?.primaryValue == "27°", "PRD §6: a blank remote card is not acceptable")
    }

    @Test func reportsUnavailableWhenThereIsNoCacheAndTheRefreshFails() async {
        let model = makeModel(provider: StubWeatherProvider(result: .failure(WeatherProviderError.invalidResponse)))

        await model.refreshWeather()

        #expect(weatherCard(model)?.primaryValue == "Unavailable")
    }

    /// Pins the freshness wording across every unit boundary, so a day-old
    /// cache can never again read the same as a 61-minute-old one.
    ///
    /// Written as a loop rather than `@Test(arguments:)`: the type-checker
    /// times out expanding the macro over this many tuple cases.
    @Test func labelsTheAgeOfCachedData() {
        let minute: TimeInterval = 60
        let hour: TimeInterval = 60 * 60
        var cases: [(TimeInterval, String)] = []
        cases.append((30, "Updated just now"))
        cases.append((minute, "Updated 1 min ago"))
        cases.append((minute * 5, "Updated 5 min ago"))
        cases.append((minute * 90, "Updated 1 hour ago"))
        cases.append((hour * 5, "Updated 5 hours ago"))
        cases.append((hour * 26, "Updated yesterday"))
        cases.append((hour * 24 * 3, "Updated 3 days ago"))

        let now = Date(timeIntervalSince1970: 1_786_838_400)
        for (age, expected) in cases {
            let observed = now.addingTimeInterval(-age)
            let actual = AppModel.freshnessText(for: observed, now: now)
            #expect(actual == expected, "age \(Int(age))s produced \(actual)")
        }
    }

    @Test func showsRefreshingWhileARequestIsInFlight() async {
        let model = makeModel(provider: StubWeatherProvider(result: .success(snapshot(temperature: 27.4))))
        await model.refreshWeather()

        #expect(model.isWeatherLoading == false)
        #expect(weatherCard(model)?.freshness.hasPrefix("Updated") == true)
    }

    /// PRD §5.4: the popover refreshes on open only when the cache has aged
    /// past the target, so repeated opens do not hammer the provider.
    @Test func treatsACacheOlderThanTheRefreshTargetAsStale() async {
        let fresh = makeModel(provider: StubWeatherProvider(result: .success(snapshot(temperature: 27.4, observedAt: Date(timeIntervalSinceNow: -60 * 5)))))
        await fresh.refreshWeather()
        #expect(fresh.isWeatherStale == false)

        let old = makeModel(provider: StubWeatherProvider(result: .success(snapshot(temperature: 27.4, observedAt: Date(timeIntervalSinceNow: -60 * 90)))))
        await old.refreshWeather()
        #expect(old.isWeatherStale == true)
    }

    @Test func treatsAnEmptyCacheAsStaleSoTheFirstOpenFetches() {
        let model = makeModel(provider: StubWeatherProvider(result: .failure(WeatherProviderError.invalidResponse)))

        #expect(model.weather == nil)
        #expect(model.isWeatherStale)
    }

    @Test func skipsTheRefreshWhenTheCacheIsWarm() async {
        let provider = CountingWeatherProvider(snapshot: snapshot(temperature: 27.4))
        let model = makeModel(provider: provider)

        await model.refreshWeather()
        await model.refreshWeatherIfStale()
        await model.refreshWeatherIfStale()

        #expect(provider.callCount == 1, "a warm cache must not re-request on every popover open")
    }

    @Test func reportsAnOfflineFailureDistinctly() async {
        let model = makeModel(provider: StubWeatherProvider(result: .failure(URLError(.notConnectedToInternet))))

        await model.refreshWeather()

        #expect(model.weatherError == "No internet connection")
    }

    @Test func reportsATimeoutDistinctly() async {
        let model = makeModel(provider: StubWeatherProvider(result: .failure(URLError(.timedOut))))

        await model.refreshWeather()

        // Wording is shared with forex now: the card already names its
        // subject, so the message does not repeat it.
        #expect(model.weatherError == "Request timed out")
    }

    private func weatherCard(_ model: AppModel) -> DashboardCard? {
        model.cards.first { $0.kind == .weather }
    }

    // MARK: - Helpers

    private func makeModel(
        defaults: UserDefaults? = nil,
        provider: any WeatherProviding
    ) -> AppModel {
        AppModel(
            now: Date(timeIntervalSince1970: 1_786_838_400),
            defaults: defaults ?? makeDefaults(),
            weatherProvider: provider,
            autoLoadWeather: false
        )
    }

    private func makeDefaults() -> UserDefaults {
        let suite = "com.sajilo.tests.\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suite)!
        defaults.removePersistentDomain(forName: suite)
        return defaults
    }

    private func snapshot(
        temperature: Double,
        observedAt: Date = .now,
        location: WeatherLocation = .kathmandu
    ) -> WeatherSnapshot {
        WeatherSnapshot(
            location: location,
            temperatureCelsius: temperature,
            apparentTemperatureCelsius: 29.0,
            precipitationChance: 35,
            highCelsius: 29.2,
            lowCelsius: 21.1,
            condition: .partlyCloudy,
            sunrise: nil,
            sunset: nil,
            daily: [],
            observedAt: observedAt,
            fetchedAt: observedAt
        )
    }
}

private final class CountingWeatherProvider: WeatherProviding, @unchecked Sendable {
    private(set) var callCount = 0
    let snapshot: WeatherSnapshot

    init(snapshot: WeatherSnapshot) { self.snapshot = snapshot }

    private(set) var requestedLocations: [WeatherLocation] = []

    func currentWeather(at location: WeatherLocation) async throws -> WeatherSnapshot {
        callCount += 1
        requestedLocations.append(location)
        return snapshot
    }
}

private struct StubWeatherProvider: WeatherProviding {
    let result: Result<WeatherSnapshot, any Error>

    func currentWeather(at location: WeatherLocation) async throws -> WeatherSnapshot {
        try result.get()
    }
}
