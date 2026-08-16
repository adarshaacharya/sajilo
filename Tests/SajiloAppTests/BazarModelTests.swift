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

    @Test func loadsEveryPartOfTheRoute() async {
        let metals = CountingMetalProvider()
        let fuel = CountingFuelProvider()
        let produce = CountingVegetableProvider()
        let model = makeModel(metals: metals, fuel: fuel, produce: produce)

        await model.refreshBazarIfStale()

        #expect(model.metals?.rate(for: .fineGold, unit: .tola)?.price == 305_200)
        #expect(model.fuel?.price(for: .petrol)?.price == 200)
        #expect(model.vegetables?.price(named: "आलु सेतो")?.average == 55)
        #expect(metals.callCount == 1)
        #expect(fuel.callCount == 1)
        #expect(produce.callCount == 1)
    }

    /// Pins survive a relaunch — the whole point is not re-finding the same
    /// five items in a hundred-row list every morning.
    @Test func pinnedProduceIsRemembered() {
        let defaults = Self.makeDefaults()
        let first = makeModel(defaults: defaults)
        first.toggleVegetableFavourite("आलु सेतो")
        first.toggleVegetableFavourite("प्याज सुकेको (भारतीय)")
        first.toggleVegetableFavourite("आलु सेतो")

        #expect(makeModel(defaults: defaults).vegetableFavourites == ["प्याज सुकेको (भारतीय)"])
    }

    /// Pinned items lift to the top in the order they were pinned, and never
    /// appear twice.
    @Test func pinnedProduceSortsAboveTheRest() async {
        let model = makeModel()
        await model.refreshBazarIfStale()
        model.toggleVegetableFavourite("गोलभेडा ठूलो(नेपाली)")

        let groups = model.vegetables(matching: "")
        #expect(groups.pinned.map(\.name) == ["गोलभेडा ठूलो(नेपाली)"])
        #expect(!groups.others.contains { $0.name == "गोलभेडा ठूलो(नेपाली)" })
        #expect(groups.pinned.count + groups.others.count == model.vegetables?.prices.count)
    }

    /// Search runs across both groups, so a pinned item does not vanish when it
    /// stops matching.
    @Test func searchNarrowsPinnedAndUnpinnedAlike() async {
        let model = makeModel()
        await model.refreshBazarIfStale()
        model.toggleVegetableFavourite("आलु सेतो")

        #expect(model.vegetables(matching: "आलु").pinned.count == 1)
        #expect(model.vegetables(matching: "Tomato").pinned.isEmpty)
        #expect(model.vegetables(matching: "Tomato").others.count == 1)
    }

    /// Neither source is on the dashboard, so a user who switched the module
    /// off should generate no traffic at all.
    @Test func aDisabledBazarNeverFetches() async {
        let metals = CountingMetalProvider()
        let fuel = CountingFuelProvider()
        let produce = CountingVegetableProvider()
        let model = makeModel(metals: metals, fuel: fuel, produce: produce)
        model.isBazarEnabled = false

        await model.refreshBazarIfStale()

        #expect(metals.callCount == 0)
        #expect(fuel.callCount == 0)
        #expect(produce.callCount == 0)
    }

    /// Fuel changes twice a month and gold daily; a failure in one must not
    /// blank the other, because they render in the same route.
    @Test func oneFailingSourceDoesNotTakeTheOtherDown() async {
        let model = makeModel(metals: FailingMetalProvider(), fuel: CountingFuelProvider())

        await model.refreshBazarIfStale()

        #expect(model.metals == nil)
        #expect(model.metalsError != nil)
        #expect(model.fuel?.price(for: .petrol)?.price == 200)
        #expect(model.vegetables != nil, "produce must survive a metals failure")
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

        let produce = CountingVegetableProvider()
        let model = makeModel(defaults: defaults, metals: metals, fuel: fuel, produce: produce)
        await model.refreshBazarIfStale()
        await model.refreshBazarIfStale()

        #expect(metals.callCount == 1)
        #expect(fuel.callCount == 1)
        #expect(produce.callCount == 1)
    }

    /// The explicit Refresh button ignores staleness — that is the whole point
    /// of pressing it.
    @Test func explicitRefreshAlwaysRefetches() async {
        let metals = CountingMetalProvider()
        let fuel = CountingFuelProvider()
        let produce = CountingVegetableProvider()
        let model = makeModel(metals: metals, fuel: fuel, produce: produce)

        await model.refreshBazarIfStale()
        await model.refreshBazar()

        #expect(metals.callCount == 2)
        #expect(fuel.callCount == 2)
        #expect(produce.callCount == 2)
    }

    // MARK: - Fixtures

    private func makeModel(
        defaults: UserDefaults? = nil,
        metals: any MetalRateProviding = CountingMetalProvider(),
        fuel: any FuelPriceProviding = CountingFuelProvider(),
        produce: any VegetableMarketProviding = CountingVegetableProvider()
    ) -> AppModel {
        AppModel(
            now: Date(timeIntervalSince1970: 1_786_838_400),
            defaults: defaults ?? Self.makeDefaults(),
            metalProvider: metals,
            fuelProvider: fuel,
            vegetableProvider: produce,
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

private final class CountingVegetableProvider: VegetableMarketProviding, @unchecked Sendable {
    private(set) var callCount = 0

    func latestPrices() async throws -> VegetableMarketSnapshot {
        callCount += 1
        return VegetableMarketSnapshot(
            prices: [
                VegetablePrice(name: "गोलभेडा ठूलो(नेपाली)", unit: .kilogram, minimum: 60, maximum: 70, average: 65),
                VegetablePrice(name: "आलु सेतो", unit: .kilogram, minimum: 50, maximum: 60, average: 55),
                VegetablePrice(name: "प्याज सुकेको (भारतीय)", unit: .kilogram, minimum: 80, maximum: 90, average: 85),
            ],
            publishedOn: NepaliDate(year: 2083, month: 4, day: 31),
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
