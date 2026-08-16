import Foundation
import Testing
@testable import SajiloApp

struct VegetableMarketTests {
    /// Shaped exactly like the board's page, including the four spellings of
    /// kilogram it uses in one day's table and the Devanagari price format.
    private static let page = """
    <html><body>
    <h4>संकलित दैनिक थोक मूल्य बारे जानकारी
    - वि.सं. साउन ३१, २०८३</h4>
    <table class="table">
      <tr><th>कृषि उपज</th><th>ईकाइ</th><th>न्यूनतम</th><th>अधिकतम</th><th>औसत</th></tr>
      <tr><td>गोलभेडा ठूलो(नेपाली)</td><td>के.जी.</td><td>रू ६०.००</td><td>रू ७०.००</td><td>रू ६५.००</td></tr>
      <tr><td>गोलभेडा ठूलो(भारतीय)</td><td>केजी</td><td>रू ७०.००</td><td>रू ८०.००</td><td>रू ७५.००</td></tr>
      <tr><td>आलु रातो(लाम्चो)</td><td>के जी</td><td>रू ४८.००</td><td>रू ५१.००</td><td>रू ४९.३३</td></tr>
      <tr><td>आभोकाडो</td><td>के.जी</td><td>रू ३००.००</td><td>रू ३००.००</td><td>रू ३००.००</td></tr>
      <tr><td>केरा(नेपाली)</td><td>दर्जन</td><td>रू १२०.००</td><td>रू १४०.००</td><td>रू १३०.००</td></tr>
      <tr><td>भुई कटहर</td><td>प्रति गोटा</td><td>रू ८०.००</td><td>रू १००.००</td><td>रू ९०.००</td></tr>
      <tr><td>माछा सुकेको</td><td>के.जी.</td><td>रू ८००.००</td><td>रू १,०००.००</td><td>रू ९००.००</td></tr>
    </table>
    </body></html>
    """

    @Test func readsEveryPublishedRow() throws {
        let snapshot = try KalimatiMarketProvider.parse(Self.page, fetchedAt: .now)
        #expect(snapshot.prices.count == 7)

        let tomato = try #require(snapshot.price(named: "गोलभेडा ठूलो(नेपाली)"))
        #expect(tomato.minimum == 60)
        #expect(tomato.maximum == 70)
        #expect(tomato.average == 65)
    }

    /// The board types kilogram four different ways in a single table because
    /// the rows are entered by hand. All four have to land on one unit or the
    /// same commodity appears twice under different units.
    @Test(arguments: [
        ("के.जी.", MarketUnit.kilogram),
        ("के जी", MarketUnit.kilogram),
        ("केजी", MarketUnit.kilogram),
        ("के.जी", MarketUnit.kilogram),
        (" केजी ", MarketUnit.kilogram),
        ("दर्जन", MarketUnit.dozen),
        ("प्रति गोटा", MarketUnit.piece),
    ])
    func normalisesEveryUnitSpelling(raw: String, expected: MarketUnit) {
        #expect(MarketUnit.parse(raw) == expected)
    }

    @Test func rejectsAnUnknownUnit() {
        #expect(MarketUnit.parse("बोरा") == nil)
        #expect(MarketUnit.parse("") == nil)
    }

    @Test func everyKilogramSpellingSurvivesParsing() throws {
        let snapshot = try KalimatiMarketProvider.parse(Self.page, fetchedAt: .now)
        let kilos = snapshot.prices.filter { $0.unit == .kilogram }
        #expect(kilos.count == 5, "all four kilogram spellings must land on .kilogram")
        #expect(snapshot.price(named: "केरा(नेपाली)")?.unit == .dozen)
        #expect(snapshot.price(named: "भुई कटहर")?.unit == .piece)
    }

    /// Prices arrive in Devanagari with a currency prefix and a thousands
    /// separator. Reading them as ASCII would yield nothing at all.
    @Test func readsDevanagariNumeralsIncludingGroupedThousands() throws {
        #expect(KalimatiMarketProvider.amount("रू ६०.००") == 60)
        #expect(KalimatiMarketProvider.amount("रू १,०००.००") == 1000)
        #expect(KalimatiMarketProvider.amount("रू ४९.३३") == 49.33)
        #expect(KalimatiMarketProvider.amount("रू ०.००") == nil)
        #expect(KalimatiMarketProvider.amount("") == nil)

        let snapshot = try KalimatiMarketProvider.parse(Self.page, fetchedAt: .now)
        #expect(snapshot.price(named: "माछा सुकेको")?.maximum == 1000)
    }

    /// The board dates the table in Bikram Sambat above it, not in any cell.
    @Test func readsTheBikramSambatPublishDate() throws {
        let snapshot = try KalimatiMarketProvider.parse(Self.page, fetchedAt: .now)
        let published = try #require(snapshot.publishedOn)

        #expect(published.year == 2083)
        #expect(published.month == 4, "साउन is the fourth month")
        #expect(published.day == 31)
    }

    /// The board does not publish on every holiday, so the date must never be
    /// silently replaced with today's — a stale table has to be able to say so.
    @Test(arguments: ["<h4>no date at all</h4>", "<h4>वि.सं. सोमबार</h4>", "<h4>वि.सं. साउन</h4>"])
    func leavesTheDateUnsetRatherThanGuessing(heading: String) {
        #expect(KalimatiMarketProvider.publishedDate(in: heading) == nil)
    }

    @Test func throwsWhenThePageCarriesNoPriceTable() {
        #expect(throws: MarketProviderError.tableNotFound) {
            try KalimatiMarketProvider.parse("<html><p>बन्द</p></html>", fetchedAt: .now)
        }
        #expect(throws: MarketProviderError.tableNotFound) {
            try KalimatiMarketProvider.parse(
                "<table><tr><th>कृषि उपज</th><th>ईकाइ</th></tr></table>", fetchedAt: .now
            )
        }
    }

    /// A row the board leaves half-filled is dropped, not shown as free.
    @Test func skipsRowsThatDoNotCarryAFullPrice() throws {
        let partial = """
        <table>
          <tr><th>कृषि उपज</th><th>ईकाइ</th><th>न्यूनतम</th><th>अधिकतम</th><th>औसत</th></tr>
          <tr><td>आलु सेतो</td><td>के.जी.</td><td>रू ५०.००</td><td>रू ६०.००</td><td>रू ५५.००</td></tr>
          <tr><td>अज्ञात</td><td>के.जी.</td><td></td><td></td><td></td></tr>
          <tr><td></td><td>के.जी.</td><td>रू १०.००</td><td>रू १०.००</td><td>रू १०.००</td></tr>
        </table>
        """
        let snapshot = try KalimatiMarketProvider.parse(partial, fetchedAt: .now)
        #expect(snapshot.prices.count == 1)
        #expect(snapshot.prices.first?.name == "आलु सेतो")
    }

    @Test func collapsesTheRangeWhenNothingMoved() throws {
        let snapshot = try KalimatiMarketProvider.parse(Self.page, fetchedAt: .now)
        #expect(snapshot.price(named: "आभोकाडो")?.rangeText == "300")
        #expect(snapshot.price(named: "गोलभेडा ठूलो(नेपाली)")?.rangeText == "60–70")
    }

    @Test func searchMatchesNepaliAndEnglishAlike() throws {
        let snapshot = try KalimatiMarketProvider.parse(Self.page, fetchedAt: .now)

        #expect(snapshot.matching("आलु").count == 1)
        #expect(snapshot.matching("potato").count == 1)
        #expect(snapshot.matching("Tomato").count == 2, "both tomato rows")
        #expect(snapshot.matching("  ").count == snapshot.prices.count, "blank query shows everything")
        #expect(snapshot.matching("zzz").isEmpty)
    }
}

struct ProduceNameTests {
    /// The names nest, so the longest match has to win. Checking the short one
    /// first files every capsicum as a chilli.
    @Test func prefersTheMoreSpecificName() {
        #expect(ProduceNames.english(for: "भेडे खुर्सानी") == "Capsicum")
        #expect(ProduceNames.english(for: "खुर्सानी हरियो(बुलेट)") == "Chilli")
        #expect(ProduceNames.english(for: "रातो बन्दा") == "Red cabbage")
        #expect(ProduceNames.english(for: "बन्दा(लोकल)") == "Cabbage")
        #expect(ProduceNames.english(for: "गान्टे मूला") == "Kohlrabi")
        #expect(ProduceNames.english(for: "मूला रातो") == "Radish")
    }

    /// The board's own table carries the chilli name with and without a stray
    /// halant on the same day. Both spellings must resolve.
    @Test func toleratesTheBoardsChilliTypo() {
        #expect(ProduceNames.english(for: "खु्र्सानी सुकेको") == "Chilli")
        #expect(ProduceNames.english(for: "भेडे खु्र्सानी") == "Capsicum")
    }

    @Test func keepsQualifiersOutOfTheEnglishName() {
        #expect(ProduceNames.english(for: "गोलभेडा ठूलो(भारतीय)") == "Tomato")
        #expect(ProduceNames.english(for: "आलु रातो(मुडे)") == "Potato")
    }

    /// Anything uncertain is absent rather than invented — a wrong label on a
    /// price list makes someone buy the wrong thing.
    @Test func returnsNothingForAnUnmappedItem() {
        #expect(ProduceNames.english(for: "झिगूनी") == nil)
        #expect(ProduceNames.english(for: "जिरीको साग") == nil)
        #expect(ProduceNames.english(for: "") == nil)
    }
}
