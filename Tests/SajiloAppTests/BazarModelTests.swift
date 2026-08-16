import Foundation
import Testing
@testable import SajiloApp

@MainActor
struct BazarModelTests {
    @Test func bazarIsOnByDefault() {
        #expect(makeModel().isBazarEnabled)
    }

    /// `bool(forKey:)` cannot tell "never set" from "switched off", so a user
    /// who turns Bazar off must not find it back on next launch.
    @Test func aDisabledBazarStaysDisabledAcrossLaunches() {
        let defaults = Self.makeDefaults()
        let first = makeModel(defaults: defaults)
        first.isBazarEnabled = false

        #expect(makeModel(defaults: defaults).isBazarEnabled == false)
    }

    @Test func loadsBothHalvesOfTheRoute() async {
        let metals = CountingMetalProvider()
        let fuel = CountingFuelProvider()
        let model = makeModel(metals: metals, fuel: fuel)

        await model.refreshBazarIfStale()

        #expect(model.metals?.rate(for: .fineGold, unit: .tola)?.price == 305_200)
        #expect(model.fuel?.price(for: .petrol)?.price == 200)
        #expect(metals.callCount == 1)
        #expect(fuel.callCount == 1)
    }

    /// Neither source is on the dashboard, so a user who switched the module
    /// off should generate no traffic at all.
    @Test func aDisabledBazarNeverFetches() async {
        let metals = CountingMetalProvider()
        let fuel = CountingFuelProvider()
        let model = makeModel(metals: metals, fuel: fuel)
        model.isBazarEnabled = false

        await model.refreshBazarIfStale()

        #expect(metals.callCount == 0)
        #expect(fuel.callCount == 0)
    }

    /// Fuel changes twice a month and gold daily; a failure in one must not
    /// blank the other, because they render in the same route.
    @Test func oneFailingSourceDoesNotTakeTheOtherDown() async {
        let model = makeModel(metals: FailingMetalProvider(), fuel: CountingFuelProvider())

        await model.refreshBazarIfStale()

        #expect(model.metals == nil)
        #expect(model.metalsError != nil)
        #expect(model.fuel?.price(for: .petrol)?.price == 200)
    }

    /// The route's own copy for a day the Federation has not posted yet, rather
    /// than a raw networking message.
    @Test func explainsADayWithNoPublishedRate() async {
        let model = makeModel(metals: FailingMetalProvider(error: MetalProviderError.noRatesPublished))

        await model.refreshBazarIfStale()

        #expect(model.metalsError == "The Federation has not published today's rate yet")
    }

    @Test func explainsAnUnreadablePriceTable() async {
        let model = makeModel(fuel: FailingFuelProvider())

        await model.refreshBazarIfStale()

        #expect(model.fuelError == "Nepal Oil Corporation's price table could not be read")
    }

    /// A second open while the cache is warm must not hit either source again.
    @Test func aWarmCacheIsNotRefetched() async {
        let metals = CountingMetalProvider()
        let fuel = CountingFuelProvider()
        let defaults = Self.makeDefaults()

        let model = makeModel(defaults: defaults, metals: metals, fuel: fuel)
        await model.refreshBazarIfStale()
        await model.refreshBazarIfStale()

        #expect(metals.callCount == 1)
        #expect(fuel.callCount == 1)
    }

    /// The explicit Refresh button ignores staleness — that is the whole point
    /// of pressing it.
    @Test func explicitRefreshAlwaysRefetches() async {
        let metals = CountingMetalProvider()
        let fuel = CountingFuelProvider()
        let model = makeModel(metals: metals, fuel: fuel)

        await model.refreshBazarIfStale()
        await model.refreshBazar()

        #expect(metals.callCount == 2)
        #expect(fuel.callCount == 2)
    }

    // MARK: - Fixtures

    private func makeModel(
        defaults: UserDefaults? = nil,
        metals: any MetalRateProviding = CountingMetalProvider(),
        fuel: any FuelPriceProviding = CountingFuelProvider()
    ) -> AppModel {
        AppModel(
            now: Date(timeIntervalSince1970: 1_786_838_400),
            defaults: defaults ?? Self.makeDefaults(),
            metalProvider: metals,
            fuelProvider: fuel,
            autoLoadWeather: false
        )
    }

    private static func makeDefaults() -> UserDefaults {
        let suite = "com.sajilo.tests.bazar.\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suite)!
        defaults.removePersistentDomain(forName: suite)
        return defaults
    }
}

private final class CountingMetalProvider: MetalRateProviding, @unchecked Sendable {
    private(set) var callCount = 0

    func latestRates() async throws -> MetalRateSnapshot {
        callCount += 1
        return MetalRateSnapshot(
            rates: [
                MetalRate(metal: .fineGold, unit: .tola, price: 305_200, previousPrice: 301_600),
                MetalRate(metal: .silver, unit: .tola, price: 4_710, previousPrice: 4_660),
            ],
            publishedAt: .now,
            fetchedAt: .now
        )
    }
}

private final class CountingFuelProvider: FuelPriceProviding, @unchecked Sendable {
    private(set) var callCount = 0

    func latestPrices() async throws -> FuelPriceSnapshot {
        callCount += 1
        return FuelPriceSnapshot(
            prices: [
                FuelPrice(fuel: .petrol, price: 200, previousPrice: 197),
                FuelPrice(fuel: .lpg, price: 2_060, previousPrice: 2_060),
            ],
            effectiveFrom: .now,
            fetchedAt: .now
        )
    }
}

private struct FailingMetalProvider: MetalRateProviding {
    var error: any Error = URLError(.notConnectedToInternet)
    func latestRates() async throws -> MetalRateSnapshot { throw error }
}

private struct FailingFuelProvider: FuelPriceProviding {
    func latestPrices() async throws -> FuelPriceSnapshot { throw FuelProviderError.tableNotFound }
}
