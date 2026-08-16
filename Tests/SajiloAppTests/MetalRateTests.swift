import Foundation
import Testing
@testable import SajiloApp

struct MetalRateTests {
    /// A verbatim capture of the Federation's `Dashboard/today` response.
    private static let payload = Data("""
    [
      {"id":128,"todayDate":"2026-08-16T04:40:51.919+00:00","yestardayDate":"2026-08-14T04:59:55.673+00:00",
       "rateType":"असली चाँदी दर (१ तोला)","todayBaseRatePerGram":4710.0,"yestardayBaseRatePerGram":4660.0},
      {"id":129,"todayDate":"2026-08-16T04:40:51.919+00:00","yestardayDate":"2026-08-14T04:59:55.673+00:00",
       "rateType":"असली चाँदी दर (१० ग्राम)","todayBaseRatePerGram":4038.0,"yestardayBaseRatePerGram":3995.0},
      {"id":130,"todayDate":"2026-08-16T04:40:51.919+00:00","yestardayDate":"2026-08-14T04:59:55.673+00:00",
       "rateType":"छापावाल सुन (१ तोला)","todayBaseRatePerGram":305200.0,"yestardayBaseRatePerGram":301600.0},
      {"id":131,"todayDate":"2026-08-16T04:40:51.919+00:00","yestardayDate":"2026-08-14T04:59:55.673+00:00",
       "rateType":"छापावाल सुन (१० ग्राम)","todayBaseRatePerGram":261660.0,"yestardayBaseRatePerGram":258575.0}
    ]
    """.utf8)

    @Test func decodesEveryPublishedRate() throws {
        let snapshot = try FenegosidaMetalProvider.decode(Self.payload, fetchedAt: .now)
        #expect(snapshot.rates.count == 4)

        let goldTola = try #require(snapshot.rate(for: .fineGold, unit: .tola))
        #expect(goldTola.price == 305_200)
        #expect(goldTola.previousPrice == 301_600)

        let silverTenGram = try #require(snapshot.rate(for: .silver, unit: .tenGram))
        #expect(silverTenGram.price == 4_038)
    }

    /// The upstream field is called `todayBaseRatePerGram` but holds the price
    /// for the unit named in `rateType`. Reading it as per-gram would be out by
    /// more than an order of magnitude.
    @Test func treatsTheRateAsPerUnitNotPerGram() throws {
        let snapshot = try FenegosidaMetalProvider.decode(Self.payload, fetchedAt: .now)
        let goldTola = try #require(snapshot.rate(for: .fineGold, unit: .tola))

        #expect(goldTola.price == 305_200, "the quoted figure is per tola")
        // A tola is 11.66 g, so per-gram must be far smaller.
        #expect(abs(goldTola.pricePerGram - 26_166) < 50)
        #expect(goldTola.pricePerGram < goldTola.price / 10)
    }

    /// The unit label is read out of free Nepali text, so both markers matter.
    @Test func readsMetalAndUnitFromTheNepaliLabel() {
        #expect(FenegosidaMetalProvider.metal(from: "असली चाँदी दर (१ तोला)") == .silver)
        #expect(FenegosidaMetalProvider.metal(from: "छापावाल सुन (१० ग्राम)") == .fineGold)
        #expect(FenegosidaMetalProvider.metal(from: "तेजाबी सुन (१ तोला)") == .tejabiGold)
        #expect(FenegosidaMetalProvider.metal(from: "something else") == nil)

        #expect(FenegosidaMetalProvider.unit(from: "छापावाल सुन (१ तोला)") == .tola)
        #expect(FenegosidaMetalProvider.unit(from: "छापावाल सुन (१० ग्राम)") == .tenGram)
        #expect(FenegosidaMetalProvider.unit(from: "छापावाल सुन") == nil)
    }

    /// Tejabi contains "सुन" too, so the more specific match has to win or every
    /// tejabi rate would be filed as fine gold.
    @Test func doesNotMistakeTejabiForFineGold() {
        #expect(FenegosidaMetalProvider.metal(from: "तेजाबी सुन (१ तोला)") != .fineGold)
    }

    @Test func computesChangeAgainstThePreviousPublication() throws {
        let snapshot = try FenegosidaMetalProvider.decode(Self.payload, fetchedAt: .now)
        let gold = try #require(snapshot.rate(for: .fineGold, unit: .tola))

        #expect(gold.change == 3_600)
        #expect(gold.isUp)
        #expect(abs(gold.changePercent - 1.1936) < 0.001)
        #expect(gold.changeText.hasPrefix("+"))
    }

    @Test func readsTheFederationsOwnPublishTime() throws {
        let snapshot = try FenegosidaMetalProvider.decode(Self.payload, fetchedAt: Date(timeIntervalSince1970: 0))
        #expect(snapshot.publishedAt.timeIntervalSince1970 > 0, "must not fall back to the fetch time")
    }

    @Test func rejectsAPayloadWithNoRecognisableRates() {
        let unknown = Data("""
        [{"id":1,"todayDate":"2026-08-16T04:40:51.919+00:00","rateType":"platinum",
          "todayBaseRatePerGram":1.0,"yestardayBaseRatePerGram":1.0}]
        """.utf8)

        #expect(throws: MetalProviderError.noRatesPublished) {
            try FenegosidaMetalProvider.decode(unknown, fetchedAt: .now)
        }
    }

    @Test func decodesTheWeeklyChart() {
        let chart = Data("""
        {"goldData":[{"date":"9","tola":301700.0},{"date":"10","tola":301500.0},
                     {"date":"11","tola":307900.0},{"date":"12","tola":null}]}
        """.utf8)

        #expect(FenegosidaMetalProvider.decodeHistory(chart) == [301_700, 301_500, 307_900])
        #expect(FenegosidaMetalProvider.decodeHistory(Data("{}".utf8)).isEmpty)
        #expect(FenegosidaMetalProvider.decodeHistory(Data("nope".utf8)).isEmpty)
    }

    @Test func headlineIsFineGoldPerTola() throws {
        let snapshot = try FenegosidaMetalProvider.decode(Self.payload, fetchedAt: .now)
        #expect(snapshot.headline?.metal == .fineGold)
        #expect(snapshot.headline?.unit == .tola)
    }
}
