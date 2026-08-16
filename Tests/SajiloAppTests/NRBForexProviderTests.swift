import Foundation
import Testing
@testable import SajiloApp

struct NRBForexProviderTests {
    /// Trimmed from a real NRB response, keeping the three currencies that are
    /// not quoted per single unit.
    private static let payload = Data("""
    {
      "status": { "code": 200 },
      "data": {
        "payload": [
          {
            "date": "2026-08-15",
            "published_on": "2026-08-15 00:00:41",
            "modified_on": "2026-08-13 16:02:11",
            "rates": [
              { "currency": { "iso3": "USD", "name": "U.S. Dollar", "unit": 1 }, "buy": "152.20", "sell": "152.80" }
            ]
          },
          {
            "date": "2026-08-16",
            "published_on": "2026-08-16 00:00:38",
            "modified_on": "2026-08-14 16:01:01",
            "rates": [
              { "currency": { "iso3": "INR", "name": "Indian Rupee", "unit": 100 }, "buy": "160.00", "sell": "160.15" },
              { "currency": { "iso3": "USD", "name": "U.S. Dollar", "unit": 1 }, "buy": "152.39", "sell": "152.99" },
              { "currency": { "iso3": "JPY", "name": "Japanese Yen", "unit": 10 }, "buy": "9.58", "sell": "9.62" }
            ]
          }
        ]
      }
    }
    """.utf8)

    @Test func decodesTheMostRecentPublishedDay() throws {
        let snapshot = try NRBForexProvider.decode(Self.payload, fetchedAt: .now)

        #expect(snapshot.rates.count == 3)
        #expect(snapshot.rate(for: "USD")?.buy == 152.39, "must take 16 Aug, not the earlier 15 Aug entry")
        #expect(Calendar.nepal.component(.day, from: snapshot.date) == 16)
    }

    /// NRB quotes INR per 100 and JPY per 10. Treating those as per-1 would
    /// misprice by two orders of magnitude, so the per-unit maths is pinned.
    @Test func normalisesCurrenciesQuotedInBlocks() throws {
        let snapshot = try NRBForexProvider.decode(Self.payload, fetchedAt: .now)

        let inr = try #require(snapshot.rate(for: "INR"))
        #expect(inr.unit == 100)
        #expect(abs(inr.buyPerUnit - 1.60) < 0.0001)
        #expect(inr.unitLabel == "INR (per 100)")

        let jpy = try #require(snapshot.rate(for: "JPY"))
        #expect(jpy.unit == 10)
        #expect(abs(jpy.buyPerUnit - 0.958) < 0.0001)

        let usd = try #require(snapshot.rate(for: "USD"))
        #expect(usd.unit == 1)
        #expect(usd.unitLabel == "USD")
        #expect(abs(usd.buyPerUnit - 152.39) < 0.0001)
    }

    @Test func convertsBothDirectionsUsingTheCorrectSideOfTheSpread() throws {
        let snapshot = try NRBForexProvider.decode(Self.payload, fetchedAt: .now)
        let usd = try #require(snapshot.rate(for: "USD"))

        // Selling dollars to the bank uses the buy rate.
        #expect(abs(usd.npr(forAmount: 100) - 15_239) < 0.01)
        // Buying dollars from the bank uses the sell rate.
        #expect(abs(usd.amount(forNPR: 15_299) - 100) < 0.001)

        let inr = try #require(snapshot.rate(for: "INR"))
        #expect(abs(inr.npr(forAmount: 100) - 160.00) < 0.01, "100 INR is one quoted block")
    }

    @Test func readsTheSourcePublishTimestamps() throws {
        let snapshot = try NRBForexProvider.decode(Self.payload, fetchedAt: .now)

        #expect(snapshot.publishedOn != nil)
        #expect(snapshot.modifiedOn != nil)
        // NRB's modified_on can predate published_on — this fixture mirrors a
        // real response where it does — so the later of the two wins rather
        // than the revision automatically superseding.
        #expect(snapshot.modifiedOn! < snapshot.publishedOn!)
        #expect(snapshot.sourceTimestamp == snapshot.publishedOn)
    }

    @Test func reportsWhenNothingIsPublished() {
        let empty = Data("""
        { "status": { "code": 200 }, "data": { "payload": [] } }
        """.utf8)

        #expect(throws: ForexProviderError.noRatesPublished) {
            try NRBForexProvider.decode(empty, fetchedAt: .now)
        }
    }

    @Test func rejectsADayWhoseRatesAreAllUnparseable() {
        let broken = Data("""
        {
          "status": { "code": 200 },
          "data": { "payload": [ {
            "date": "2026-08-16", "published_on": null, "modified_on": null,
            "rates": [ { "currency": { "iso3": "USD", "name": "U.S. Dollar", "unit": 1 }, "buy": "n/a", "sell": "n/a" } ]
          } ] }
        }
        """.utf8)

        #expect(throws: ForexProviderError.noRatesPublished) {
            try NRBForexProvider.decode(broken, fetchedAt: .now)
        }
    }

    @Test func guardsAgainstAZeroUnitFromTheSource() throws {
        let zeroUnit = Data("""
        {
          "status": { "code": 200 },
          "data": { "payload": [ {
            "date": "2026-08-16", "published_on": null, "modified_on": null,
            "rates": [ { "currency": { "iso3": "XXX", "name": "Test", "unit": 0 }, "buy": "10.00", "sell": "11.00" } ]
          } ] }
        }
        """.utf8)

        let rate = try #require(NRBForexProvider.decode(zeroUnit, fetchedAt: .now).rate(for: "XXX"))
        #expect(rate.unit == 1, "a zero unit would divide by zero")
        #expect(rate.buyPerUnit == 10.00)
    }
}
