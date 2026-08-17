import Foundation
import Testing
@testable import SajiloApp

struct StockMarketParsingTests {
    /// Shaped like the market page: two byte-identical percent tables (gainers
    /// then losers), and two money tables whose columns run the other way.
    private static let marketHTML = """
    <table><tr><th>Index</th><th>Open</th><th>High</th><th>Low</th><th>Close</th>
      <th>Point Change</th><th>% Change</th><th>Turnover</th></tr>
      <tr><td>NEPSE Index</td><td>2,651</td><td>2,660</td><td>2,640</td><td>2,643.83</td>
          <td>-7.37</td><td>-0.27</td><td>4,275,675,402.84</td></tr></table>

    <table><tr><th>Sub Index</th><th>Open</th><th>High</th><th>Low</th><th>Close</th>
      <th>Point</th><th>% Change</th><th>Turnover</th></tr>
      <tr><td>Banking SubIndex</td><td>1,200</td><td>1,210</td><td>1,190</td><td>1,198.5</td>
          <td>-1.70</td><td>-0.14</td><td>500,000</td></tr>
      <tr><td>Hydropower Index</td><td>2,900</td><td>2,950</td><td>2,890</td><td>2,940.0</td>
          <td>40.00</td><td>1.38</td><td>900,000</td></tr></table>

    <table><tr><th>Symbol</th><th>LTP(Rs)</th><th>Point Change</th><th>% Change</th></tr>
      <tr><td>MEPDL</td><td>253.00</td><td>33.00</td><td>15.00</td></tr></table>

    <table><tr><th>Symbol</th><th>LTP(Rs)</th><th>Point Change</th><th>% Change</th></tr>
      <tr><td>SKHL</td><td>408.00</td><td>-60.00</td><td>-12.83</td></tr></table>

    <table><tr><th>Symbol</th><th>TurnOvers(Rs)</th><th>Ltp(Rs)</th></tr>
      <tr><td>ADBLB87</td><td>708,799,000</td><td>1,012.00</td></tr></table>

    <table><tr><th>Symbol</th><th>Volume</th><th>Ltp(Rs)</th></tr>
      <tr><td>LEC</td><td>723,736</td><td>229.00</td></tr></table>
    """

    private static let pricesHTML = """
    <table><tr><th>S.No</th><th>Symbol</th><th>Conf.</th><th>Open</th><th>High</th><th>Low</th>
      <th>Close</th><th>LTP</th><th>Close - LTP</th><th>Close - LTP %</th><th>VWAP</th><th>Vol</th>
      <th>Prev. Close</th><th>Turnover</th><th>Trans.</th><th>Diff</th><th>Range</th><th>Diff %</th>
      <th>Range %</th><th>VWAP %</th><th>120 Days</th><th>180 Days</th>
      <th>52 Weeks High</th><th>52 Weeks Low</th></tr>
      <tr><td>1</td><td>GBLBS</td><td>33.7</td><td>730.00</td><td>735.00</td><td>710.00</td>
        <td>722.90</td><td>722.90</td><td>0.00</td><td>0.00</td><td>719.50</td><td>7,026</td>
        <td>744.00</td><td>5,054,000</td><td>123</td><td>-21.10</td><td>25.00</td><td>-2.84</td>
        <td>3.45</td><td>0.47</td><td>766.80</td><td>769.12</td><td>876.00</td><td>698.00</td></tr>
    </table>
    <script>var cmpjson = [{"id":1,"symbol":"GBLBS","companyname":"Grameen Bikas Laghubitta"}];</script>
    """

    @Test func readsEveryColumnOfTheDayRow() throws {
        let snapshot = try ShareSansarStockProvider.parse(
            marketHTML: Self.marketHTML, pricesHTML: Self.pricesHTML, fetchedAt: .now
        )
        let quote = try #require(snapshot.quote(symbol: "GBLBS"))

        #expect(quote.companyName == "Grameen Bikas Laghubitta")
        #expect(quote.ltp == 722.90)
        #expect(quote.open == 730)
        #expect(quote.high == 735)
        #expect(quote.low == 710)
        #expect(quote.vwap == 719.50)
        #expect(quote.volume == 7_026)
        #expect(quote.transactions == 123)
        #expect(quote.previousClose == 744)
        #expect(quote.week52High == 876)
        #expect(quote.week52Low == 698)
        #expect(quote.average120Day == 766.80)
        #expect(quote.average180Day == 769.12)
    }

    /// Gainers and losers are separate tables with identical headers. Matching
    /// on the header alone finds the gainers twice and leaves losers empty —
    /// which is exactly what the first version did.
    @Test func separatesGainersFromLosersDespiteIdenticalHeaders() throws {
        let snapshot = try ShareSansarStockProvider.parse(
            marketHTML: Self.marketHTML, pricesHTML: Self.pricesHTML, fetchedAt: .now
        )

        #expect(snapshot.movers(.gainers).map(\.symbol) == ["MEPDL"])
        #expect(snapshot.movers(.losers).map(\.symbol) == ["SKHL"])
        #expect(snapshot.movers(.gainers).first?.metric == 15.00)
        #expect(snapshot.movers(.losers).first?.metric == -12.83)
    }

    /// The money tables put their metric first and the price second — the
    /// opposite of the percent tables. Reading them the same way reports the
    /// turnover as the share price.
    @Test func readsTheMoneyTablesColumnsTheRightWayRound() throws {
        let snapshot = try ShareSansarStockProvider.parse(
            marketHTML: Self.marketHTML, pricesHTML: Self.pricesHTML, fetchedAt: .now
        )

        let turnover = try #require(snapshot.movers(.turnover).first)
        #expect(turnover.symbol == "ADBLB87")
        #expect(turnover.metric == 708_799_000)
        #expect(turnover.ltp == 1_012, "the price column, not the turnover again")

        let volume = try #require(snapshot.movers(.volume).first)
        #expect(volume.metric == 723_736)
        #expect(volume.ltp == 229)
    }

    @Test func readsTheHeadlineIndexAndTheSectors() throws {
        let snapshot = try ShareSansarStockProvider.parse(
            marketHTML: Self.marketHTML, pricesHTML: Self.pricesHTML, fetchedAt: .now
        )

        #expect(snapshot.nepse?.value == 2_643.83)
        #expect(snapshot.nepse?.changePercent == -0.27)
        #expect(snapshot.subIndices.map(\.name) == ["Banking SubIndex", "Hydropower Index"])
        #expect(snapshot.subIndices.last?.isUp == true)
        // The headline index must not leak into the sector list.
        #expect(!snapshot.subIndices.contains { $0.name.contains("NEPSE") })
    }

    @Test func throwsWhenThePriceTableIsMissing() {
        #expect(throws: StockMarketProviderError.tableNotFound) {
            try ShareSansarStockProvider.parse(
                marketHTML: Self.marketHTML, pricesHTML: "<p>maintenance</p>", fetchedAt: .now
            )
        }
    }

    /// A narrower table must still yield a usable quote rather than dropping
    /// every row, since the trailing columns are extras.
    @Test func toleratesATableWithoutTheTrailingColumns() throws {
        let narrow = """
        <table><tr><th>S.No</th><th>Symbol</th><th>Conf.</th><th>Open</th><th>High</th><th>Low</th>
          <th>Close</th><th>LTP</th><th>a</th><th>b</th><th>VWAP</th><th>Vol</th>
          <th>Prev. Close</th><th>Turnover</th><th>Trans.</th><th>Diff</th><th>Range</th><th>Diff %</th></tr>
          <tr><td>1</td><td>NABIL</td><td>1</td><td>500</td><td>510</td><td>495</td><td>505</td>
            <td>505</td><td>0</td><td>0</td><td>502</td><td>100</td><td>500</td><td>50,000</td>
            <td>10</td><td>5</td><td>15</td><td>1.00</td></tr></table>
        """
        let snapshot = try ShareSansarStockProvider.parse(
            marketHTML: Self.marketHTML, pricesHTML: narrow, fetchedAt: .now
        )
        let quote = try #require(snapshot.quote(symbol: "NABIL"))
        #expect(quote.ltp == 505)
        #expect(quote.week52High == nil, "absent rather than fabricated")
        #expect(quote.average120Day == nil)
    }
}

struct StockQuoteTests {
    private func quote(ltp: Double, low: Double?, high: Double?) -> StockQuote {
        StockQuote(
            symbol: "X", companyName: nil, ltp: ltp, previousClose: 100,
            change: 0, changePercent: 0, open: nil, high: nil, low: nil, close: nil,
            vwap: nil, volume: nil, turnover: 0, transactions: nil,
            week52High: high, week52Low: low, average120Day: nil, average180Day: nil
        )
    }

    @Test func placesThePriceInsideItsFiftyTwoWeekRange() {
        #expect(quote(ltp: 698, low: 698, high: 876).week52Position == 0)
        #expect(quote(ltp: 876, low: 698, high: 876).week52Position == 1)
        let middle = try? #require(quote(ltp: 787, low: 698, high: 876).week52Position)
        #expect(abs((middle ?? 0) - 0.5) < 0.01)
    }

    /// Absent rather than defaulting to the middle, which would imply a
    /// position the data does not support.
    @Test func hasNoPositionWithoutAUsableRange() {
        #expect(quote(ltp: 700, low: nil, high: 876).week52Position == nil)
        #expect(quote(ltp: 700, low: 800, high: 800).week52Position == nil)
    }

    /// A price outside its own 52-week range still clamps into the bar rather
    /// than drawing off the end of it.
    @Test func clampsAPriceOutsideTheRange() {
        #expect(quote(ltp: 200, low: 698, high: 876).week52Position == 0)
        #expect(quote(ltp: 2_000, low: 698, high: 876).week52Position == 1)
    }

    @Test func searchPrefersSymbolMatchesOverCompanyNames() {
        let snapshot = StockMarketSnapshot(
            nepse: nil,
            quotes: [
                StockQuote(symbol: "NBF3", companyName: "Nabil Balanced Fund 3", ltp: 10, previousClose: 10,
                           change: 0, changePercent: 0, open: nil, high: nil, low: nil, close: nil,
                           vwap: nil, volume: nil, turnover: 0, transactions: nil,
                           week52High: nil, week52Low: nil, average120Day: nil, average180Day: nil),
                StockQuote(symbol: "NABIL", companyName: "Nabil Bank Limited", ltp: 500, previousClose: 500,
                           change: 0, changePercent: 0, open: nil, high: nil, low: nil, close: nil,
                           vwap: nil, volume: nil, turnover: 0, transactions: nil,
                           week52High: nil, week52Low: nil, average120Day: nil, average180Day: nil),
            ],
            publishedOn: nil,
            fetchedAt: .now
        )

        #expect(snapshot.search("nabil").first?.symbol == "NABIL")
        #expect(snapshot.search("nabil").count == 2, "the fund matches by company name")
        #expect(snapshot.search("bank").map(\.symbol) == ["NABIL"])
        #expect(snapshot.search("  ").isEmpty, "a blank query is not a match-all here")
        #expect(snapshot.search("zzz").isEmpty)
    }
}

@MainActor
struct StockWatchlistTests {
    @Test func followingTogglesBothWays() {
        let model = makeModel()
        model.toggleStockWatchlist("gblbs")
        #expect(model.stockWatchlist == ["GBLBS"])

        model.toggleStockWatchlist("GBLBS")
        #expect(model.stockWatchlist.isEmpty)
    }

    @Test func followingIsCaseInsensitiveAndNeverDuplicates() {
        let model = makeModel()
        model.toggleStockWatchlist("nabil")
        model.addStockToWatchlist("NABIL")
        model.addStockToWatchlist(" nabil ")
        #expect(model.stockWatchlist == ["NABIL"])
    }

    @Test func theWatchlistIsBounded() {
        let model = makeModel()
        for index in 0..<20 { model.toggleStockWatchlist("SYM\(index)") }
        #expect(model.stockWatchlist.count == AppModel.stockWatchlistLimit)
        #expect(model.isStockWatchlistFull)
    }

    @Test func followedCompaniesSurviveRelaunch() {
        let defaults = Self.defaults()
        makeModel(defaults: defaults).toggleStockWatchlist("GBLBS")
        #expect(makeModel(defaults: defaults).stockWatchlist == ["GBLBS"])
    }

    private func makeModel(defaults: UserDefaults? = nil) -> AppModel {
        AppModel(defaults: defaults ?? Self.defaults(), autoLoadWeather: false)
    }

    private static func defaults() -> UserDefaults {
        let suite = "com.sajilo.tests.stocks.\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suite)!
        defaults.removePersistentDomain(forName: suite)
        return defaults
    }
}
