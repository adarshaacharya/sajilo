import Foundation
import Testing
@testable import SajiloApp

struct FuelPriceTests {
    /// The shape NOC actually serves, including the four different ways it has
    /// typed the effective-date cell over the years.
    private static let page = """
    <html><body>
    <table class="table">
      <tr><th>effective Date</th><th>effective Time</th><th>petrol</th><th>diesel</th>
          <th>kerosene</th><th>LPG</th><th>ATF (DP)</th><th>ATF (DF)</th></tr>
      <tr><td>2083.04.17(2026.08.02)</td><td>24:00 hrs</td><td>200.00</td><td>200.00</td>
          <td>200.00</td><td>2060.00</td><td>249.00</td><td>1697.00</td></tr>
      <tr><td>2083.03.31(2026.07.15)</td><td>24:00 hrs</td><td>197.00</td><td>195.00</td>
          <td>195.00</td><td>2060.00</td><td>229.00</td><td>1566.00</td></tr>
      <tr><td>2083-03-01 (2026.06.15)</td><td>24:00 hrs</td><td>217.00</td><td>225.00</td>
          <td>225.00</td><td>2160.00</td><td>269.00</td><td>1831.00</td></tr>
    </table>
    </body></html>
    """

    @Test func readsTheCurrentPriceForEveryFuel() throws {
        let snapshot = try NOCFuelProvider.parse(Self.page, fetchedAt: .now)

        #expect(snapshot.price(for: .petrol)?.price == 200)
        #expect(snapshot.price(for: .diesel)?.price == 200)
        #expect(snapshot.price(for: .kerosene)?.price == 200)
        #expect(snapshot.price(for: .lpg)?.price == 2060)
    }

    @Test func comparesAgainstThePreviousRevisionNotTheOneBeforeIt() throws {
        let snapshot = try NOCFuelProvider.parse(Self.page, fetchedAt: .now)

        let petrol = try #require(snapshot.price(for: .petrol))
        #expect(petrol.previousPrice == 197)
        #expect(petrol.change == 3)
        #expect(petrol.isUp)

        // LPG did not move between the two most recent revisions.
        let lpg = try #require(snapshot.price(for: .lpg))
        #expect(lpg.isUnchanged)
        #expect(lpg.changeText == "No change")
    }

    /// Columns are located by heading, so NOC inserting one must not shift
    /// diesel's number into the kerosene row.
    @Test func locatesColumnsByHeadingNotPosition() throws {
        let shifted = Self.page
            .replacingOccurrences(of: "<th>petrol</th>", with: "<th>region</th><th>petrol</th>")
            .replacingOccurrences(of: "<td>24:00 hrs</td>", with: "<td>24:00 hrs</td><td>Kathmandu</td>")

        let snapshot = try NOCFuelProvider.parse(shifted, fetchedAt: .now)
        #expect(snapshot.price(for: .petrol)?.price == 200)
        #expect(snapshot.price(for: .lpg)?.price == 2060)
    }

    /// "ATF (DP)" sits next to the fuels we do want and must not be mistaken
    /// for one of them.
    @Test func ignoresAviationFuel() throws {
        let snapshot = try NOCFuelProvider.parse(Self.page, fetchedAt: .now)
        #expect(snapshot.prices.count == Fuel.allCases.count)
        #expect(snapshot.prices.allSatisfy { $0.price != 249 && $0.price != 1697 })
    }

    @Test(arguments: [
        "2083.04.17(2026.08.02)",
        "2083-03-01 (2026.06.15)",
        "2083-02-17(2026.05.31)",
        "2083.03.16 (2026.06.30)",
    ])
    func readsTheGregorianDateWhicheverWayTheCellIsTyped(cell: String) throws {
        let date = try #require(NOCFuelProvider.effectiveDate(from: cell))
        let year = NepalTime.calendar.component(.year, from: date)
        #expect(year == 2026)
    }

    @Test func effectiveDateIsTheOneNOCPublished() throws {
        let snapshot = try NOCFuelProvider.parse(Self.page, fetchedAt: Date(timeIntervalSince1970: 0))
        let parts = NepalTime.calendar.dateComponents([.year, .month, .day], from: snapshot.effectiveFrom)
        #expect(parts.year == 2026)
        #expect(parts.month == 8)
        #expect(parts.day == 2)
    }

    @Test(arguments: ["2083.04.17", "", "no brackets here", "2083.04.17(nonsense)", "(1.2)"])
    func rejectsAnUnreadableDateCell(cell: String) {
        #expect(NOCFuelProvider.effectiveDate(from: cell) == nil)
    }

    @Test func throwsWhenThePageHasNoPriceTable() {
        #expect(throws: FuelProviderError.tableNotFound) {
            try NOCFuelProvider.parse("<html><body><p>Under maintenance</p></body></html>", fetchedAt: .now)
        }
        #expect(throws: FuelProviderError.tableNotFound) {
            try NOCFuelProvider.parse("<table><tr><th>a</th><th>b</th></tr></table>", fetchedAt: .now)
        }
    }

    /// With only one revision published there is nothing to compare against, so
    /// the change must read as flat rather than as a fall from zero.
    @Test func treatsASingleRevisionAsUnchanged() throws {
        let single = """
        <table><tr><th>effective Date</th><th>petrol</th></tr>
        <tr><td>2083.04.17(2026.08.02)</td><td>200.00</td></tr></table>
        """
        let snapshot = try NOCFuelProvider.parse(single, fetchedAt: .now)
        #expect(snapshot.price(for: .petrol)?.isUnchanged == true)
    }
}

struct HTMLTableTests {
    @Test func keepsHeadingAndDataCellsInDocumentOrder() {
        let rows = HTMLTable.firstTableRows(in: "<table><tr><th>a</th><td>b</td><th>c</th></tr></table>")
        #expect(rows == [["a", "b", "c"]])
    }

    @Test func stripsNestedMarkupAndCollapsesWhitespace() {
        let rows = HTMLTable.firstTableRows(in: """
        <table><tr><td>  <b>200</b>\n<span>.00</span>  </td></tr></table>
        """)
        #expect(rows == [["200 .00"]])
    }

    @Test func decodesEntities() {
        #expect(HTMLTable.text("R&amp;D&nbsp;unit") == "R&D unit")
    }

    @Test func readsAttributedTagsAndIgnoresLookalikeNames() {
        let rows = HTMLTable.firstTableRows(in: """
        <tablet>ignored</tablet>
        <table class="x" id="y"><tr class="r"><td colspan="2">ok</td></tr></table>
        """)
        #expect(rows == [["ok"]])
    }

    @Test func takesTheFirstTableOnly() {
        let rows = HTMLTable.firstTableRows(in: "<table><tr><td>1</td></tr></table><table><tr><td>2</td></tr></table>")
        #expect(rows == [["1"]])
    }

    @Test func returnsNothingForMarkupWithNoTable() {
        #expect(HTMLTable.firstTableRows(in: "<p>hi</p>").isEmpty)
        #expect(HTMLTable.firstTableRows(in: "<table><tr><td>unclosed").isEmpty)
    }
}
