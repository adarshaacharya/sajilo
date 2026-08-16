import Foundation
import Testing
@testable import SajiloApp

/// The card used to render hardcoded numbers with no indication they were
/// fake. These pin that it now shows real rates or plainly says it has none.
@MainActor
struct ForexCardTests {
    @Test func showsTheHeadlineFavouriteRate() async {
        let model = makeModel(provider: StubForexProvider(result: .success(snapshot())))

        await model.refreshForex()

        let card = forexCard(model)
        #expect(card?.title == "USD / NPR")
        #expect(card?.primaryValue == "152.39")
        #expect(card?.detail == "Buy · Sell 152.99")
        #expect(model.forexError == nil)
    }

    @Test func reportsUnavailableRatherThanInventingARate() async {
        let model = makeModel(provider: StubForexProvider(result: .failure(URLError(.notConnectedToInternet))))

        await model.refreshForex()

        #expect(forexCard(model)?.primaryValue == "Unavailable")
        #expect(model.forexError == "No internet connection")
    }

    @Test func keepsTheCachedRatesWhenARefreshFails() async {
        let defaults = makeDefaults()
        let good = makeModel(defaults: defaults, provider: StubForexProvider(result: .success(snapshot())))
        await good.refreshForex()

        let offline = makeModel(defaults: defaults, provider: StubForexProvider(result: .failure(URLError(.timedOut))))
        #expect(offline.forex != nil, "cache should survive a relaunch")

        await offline.refreshForex()

        #expect(forexCard(offline)?.primaryValue == "152.39", "PRD §6: a blank remote card is not acceptable")
        #expect(offline.forexError != nil)
    }

    @Test func saysSoWhenTheBankHasNotPublished() async {
        let model = makeModel(provider: StubForexProvider(result: .failure(ForexProviderError.noRatesPublished)))

        await model.refreshForex()

        #expect(model.forexError == "Nepal Rastra Bank has not published rates yet")
    }

    /// Rates move once a day, so the refresh target is hours, not minutes.
    @Test func treatsRatesAsFreshForSixHours() async {
        let model = makeModel(provider: StubForexProvider(result: .success(snapshot(fetchedAt: Date(timeIntervalSinceNow: -60 * 60)))))
        await model.refreshForex()
        #expect(model.isForexStale == false)

        #expect(AppModel.forexStaleInterval == 6 * 60 * 60)
    }

    @Test func skipsTheRefreshWhenTheCacheIsWarm() async {
        let provider = CountingForexProvider(snapshot: snapshot())
        let model = makeModel(provider: provider)

        await model.refreshForex()
        await model.refreshForexIfStale()
        await model.refreshForexIfStale()

        #expect(provider.callCount == 1)
    }

    @Test func defaultsToThePRDFavouritesAndPersistsAChange() {
        let defaults = makeDefaults()
        let model = makeModel(defaults: defaults, provider: StubForexProvider(result: .success(snapshot())))
        #expect(model.forexFavourites == ["USD", "AUD", "GBP", "EUR", "JPY"])

        model.forexFavourites = ["EUR", "USD"]

        let relaunched = makeModel(defaults: defaults, provider: StubForexProvider(result: .success(snapshot())))
        #expect(relaunched.forexFavourites == ["EUR", "USD"])
    }

    @Test func headlineFollowsTheFavouriteOrder() async {
        let model = makeModel(provider: StubForexProvider(result: .success(snapshot())))
        model.forexFavourites = ["EUR", "USD"]

        await model.refreshForex()

        #expect(model.headlineRate?.currencyCode == "EUR")
        #expect(forexCard(model)?.title == "EUR / NPR")
    }

    @Test func favouritesListSkipsCurrenciesTheBankDidNotPublish() async {
        let model = makeModel(provider: StubForexProvider(result: .success(snapshot())))
        model.forexFavourites = ["USD", "ZZZ", "EUR"]

        await model.refreshForex()

        #expect(model.favouriteRates.map(\.currencyCode) == ["USD", "EUR"])
    }

    // MARK: - Helpers

    private func forexCard(_ model: AppModel) -> DashboardCard? {
        model.cards.first { $0.kind == .forex }
    }

    private func snapshot(fetchedAt: Date = .now) -> ForexSnapshot {
        ForexSnapshot(
            rates: [
                ForexRate(currencyCode: "USD", currencyName: "U.S. Dollar", unit: 1, buy: 152.39, sell: 152.99),
                ForexRate(currencyCode: "EUR", currencyName: "European Euro", unit: 1, buy: 176.06, sell: 176.75),
                ForexRate(currencyCode: "INR", currencyName: "Indian Rupee", unit: 100, buy: 160.00, sell: 160.15)
            ],
            date: Date(timeIntervalSince1970: 1_786_838_400),
            publishedOn: Date(timeIntervalSince1970: 1_786_838_438),
            modifiedOn: nil,
            fetchedAt: fetchedAt
        )
    }

    private func makeModel(defaults: UserDefaults? = nil, provider: any ForexProviding) -> AppModel {
        AppModel(
            now: Date(timeIntervalSince1970: 1_786_838_400),
            defaults: defaults ?? makeDefaults(),
            forexProvider: provider,
            autoLoadWeather: false
        )
    }

    private func makeDefaults() -> UserDefaults {
        let suite = "com.sajilo.tests.forex.\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suite)!
        defaults.removePersistentDomain(forName: suite)
        return defaults
    }
}

private struct StubForexProvider: ForexProviding {
    let result: Result<ForexSnapshot, any Error>

    func latestRates() async throws -> ForexSnapshot { try result.get() }
}

private final class CountingForexProvider: ForexProviding, @unchecked Sendable {
    private(set) var callCount = 0
    let snapshot: ForexSnapshot

    init(snapshot: ForexSnapshot) { self.snapshot = snapshot }

    func latestRates() async throws -> ForexSnapshot {
        callCount += 1
        return snapshot
    }
}
