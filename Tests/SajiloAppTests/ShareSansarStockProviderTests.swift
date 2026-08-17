import Foundation
import Testing
@testable import SajiloApp

struct ShareSansarStockProviderTests {
    private static let pricePage = """
    <script>var cmpjson = [{"symbol":"NABIL","companyname":"Nabil Bank Limited"},{"symbol":"UPPER","companyname":"Upper Tamakoshi Hydropower Limited"}];</script>
    <h5>As of : <span>2026-08-14</span></h5>
    <table id="headFixed"><thead><tr>
      <th>S.No</th><th>Symbol</th><th>Conf.</th><th>Open</th><th>High</th><th>Low</th><th>Close</th><th>LTP</th><th>Close - LTP</th><th>Close - LTP %</th><th>VWAP</th><th>Vol</th><th>Prev. Close</th><th>Turnover</th><th>Trans.</th><th>Diff</th><th>Range</th><th>Diff %</th>
    </tr></thead><tbody>
      <tr><td>1</td><td><a>NABIL</a></td><td>42</td><td>525</td><td>535</td><td>520</td><td>530</td><td>532</td><td>-2</td><td>-0.38</td><td>528</td><td>1,000</td><td>530</td><td>532,000</td><td>12</td><td>2</td><td>15</td><td>0.38</td></tr>
      <tr><td>2</td><td><a>UPPER</a></td><td>30</td><td>200</td><td>205</td><td>198</td><td>202</td><td>200</td><td>2</td><td>0.99</td><td>201</td><td>2,000</td><td>202</td><td>400,000</td><td>8</td><td>-2</td><td>7</td><td>-0.99</td></tr>
    </tbody></table>
    """

    private static let marketPage = """
    <p>As of <span>2026-08-14</span></p>
    <table><thead><tr><th>Index</th><th>Open</th><th>High</th><th>Low</th><th>Close</th><th>Point Change</th><th>% Change</th><th>Turnover</th></tr></thead>
    <tbody><tr><td>NEPSE Index</td><td>2,600</td><td>2,650</td><td>2,590</td><td>2,643.83</td><td>-7.37</td><td>-0.27</td><td>4,275,675,402.84</td></tr></tbody></table>
    """

    @Test func readsQuotesAndTheirActualDailyMovement() throws {
        let quotes = try ShareSansarStockProvider.quotes(in: Self.pricePage)
        #expect(quotes.count == 2)
        let nabil = try #require(quotes.first(where: { $0.symbol == "NABIL" }))
        #expect(nabil.ltp == 532)
        #expect(nabil.companyName == "Nabil Bank Limited")
        #expect(nabil.previousClose == 530)
        #expect(nabil.change == 2)
        #expect(nabil.changePercent == 0.38)
        #expect(nabil.turnover == 532_000)
        #expect(nabil.ltpText == "Rs 532.00")
    }

    @Test func readsTheIndexSeparatelyFromTickerRows() throws {
        let snapshot = try ShareSansarStockProvider.parse(
            marketHTML: Self.marketPage,
            pricesHTML: Self.pricePage,
            fetchedAt: .now
        )
        let index = try #require(snapshot.nepse)
        #expect(index.value == 2643.83)
        #expect(index.change == -7.37)
        #expect(index.turnover == 4_275_675_402.84)
        #expect(snapshot.quote(symbol: "nabil")?.ltp == 532)
        #expect(snapshot.publishedOn != nil)
    }

    @Test func rejectsAPageThatOnlyLooksLikeAStockTable() {
        #expect(throws: StockMarketProviderError.tableNotFound) {
            try ShareSansarStockProvider.quotes(in: "<table><tr><th>Symbol</th></tr><tr><td>NABIL</td></tr></table>")
        }
    }
}
