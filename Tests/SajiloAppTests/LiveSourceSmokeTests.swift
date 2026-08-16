import Foundation
import Testing
@testable import SajiloApp

/// Hits the real endpoints. Off by default so `swift test` stays offline and
/// deterministic; run with `SAJILO_LIVE=1 swift test --filter LiveSource` when
/// checking whether a source has changed shape under us.
@Suite(.enabled(if: ProcessInfo.processInfo.environment["SAJILO_LIVE"] == "1"))
struct LiveSourceSmokeTests {
    @Test func federationStillPublishesGoldAndSilver() async throws {
        let snapshot = try await FenegosidaMetalProvider().latestRates()
        #expect(snapshot.rate(for: .fineGold, unit: .tola) != nil)
        #expect(snapshot.rate(for: .silver, unit: .tola) != nil)
        // A per-gram misread would land three orders of magnitude low.
        #expect(snapshot.rate(for: .fineGold, unit: .tola)!.price > 50_000)
    }

    @Test func kalimatiStillPublishesTheDailyTable() async throws {
        let snapshot = try await KalimatiMarketProvider().latestPrices()

        // The board lists around a hundred items every trading day; a handful
        // would mean the table shape changed under us.
        #expect(snapshot.prices.count > 50)
        #expect(snapshot.publishedOn != nil, "the BS date heading moved or changed shape")
        #expect(snapshot.prices.allSatisfy { $0.average > 0 })
        #expect(snapshot.prices.contains { $0.englishName == "Potato" })
    }

    @Test func hamroPatroStillPublishesAllTwelveReadings() async throws {
        let snapshot = try await HamroPatroRashifalProvider().todaysRashifal()

        #expect(snapshot.readings.count == 12)
        #expect(snapshot.publishedOn != nil, "the date in the page title moved or changed shape")
        // Each reading is a real paragraph, not a stray label picked up near
        // the heading.
        #expect(snapshot.readings.allSatisfy { $0.prediction.count > 60 })
        // Twelve distinct readings, not the same text attached to every sign.
        #expect(Set(snapshot.readings.map(\.prediction)).count == 12)
    }

    @Test func nocStillPublishesTheRetailTable() async throws {
        let snapshot = try await NOCFuelProvider().latestPrices()
        #expect(snapshot.price(for: .petrol) != nil)
        #expect(snapshot.price(for: .lpg) != nil)
        #expect(snapshot.price(for: .petrol)!.price > 50)
    }
}
