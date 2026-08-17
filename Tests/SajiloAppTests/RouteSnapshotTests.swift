import AppKit
import SwiftUI
import Testing
@testable import SajiloApp

/// Renders a route to a PNG so it can be looked at without launching the app.
///
/// Off unless `SAJILO_RENDER=1`, so `swift test` stays fast and writes nothing:
///
///     SAJILO_RENDER=1 SAJILO_RENDER_OUT=/tmp swift test --filter RouteSnapshot
///
/// `ImageRenderer` does not draw scrolled content, which is why the route bodies
/// are factored out of their `ScrollView`. It also cannot draw `Link` or
/// `.buttonStyle(.link)` — those come out as yellow placeholders and are fine in
/// the running app.
@MainActor
@Suite(.enabled(if: ProcessInfo.processInfo.environment["SAJILO_RENDER"] == "1"))
struct RouteSnapshotTests {
    @Test(arguments: SettingsView.Tab.allCases)
    func settings(tab: SettingsView.Tab) throws {
        let model = AppModel(
            defaults: UserDefaults(suiteName: "com.sajilo.render.\(UUID().uuidString)")!,
            autoLoadWeather: false
        )
        try shoot(
            SettingsContent(
                model: model,
                tab: .constant(tab),
                appUpdater: nil,
                backupDocument: .constant(nil),
                isExportingBackup: .constant(false),
                isImportingBackup: .constant(false),
                backupMessage: .constant(nil)
            ),
            named: "settings-\(tab.rawValue)"
        )
    }

    @Test func stocks() throws {
        let model = AppModel(
            defaults: UserDefaults(suiteName: "com.sajilo.render.\(UUID().uuidString)")!,
            autoLoadWeather: false
        )
        model.seedStocksForPreview(StockRenderFixture.snapshot)
        model.toggleStockWatchlist("NABIL")
        try shoot(StocksSection(model: model), named: "stocks")
        try shoot(StocksSection(model: model, opened: "GBLBS"), named: "stocks-company")
    }

    @Test func dayDetail() throws {
        let outcome = try #require(ConversionOutcome.make(for: NepaliDate(year: 2083, month: 5, day: 1)))
        try shoot(
            VStack(alignment: .leading, spacing: Theme.Space.m) {
                DateSummaryPanel(outcome: outcome, leadsWithNepali: true) {
                    CompactCopyRow(outcome: outcome, copiedFormat: nil) { _ in }
                }
                PanchangaRenderProbe(date: outcome.gregorian)
            },
            named: "day-detail"
        )
    }

    @Test func rashifal() async throws {
        let model = AppModel(
            defaults: UserDefaults(suiteName: "com.sajilo.render.\(UUID().uuidString)")!,
            rashifalProvider: RenderStub(),
            autoLoadWeather: false
        )
        await model.refreshRashifalIfStale()
        model.selectedRashi = .vrish
        try shoot(RashifalContent(model: model, viewing: .constant(nil)), named: "rashifal")
    }

    private func shoot(_ view: some View, named name: String) throws {
        let wrapped = view
            .padding(Theme.Space.m)
            .frame(width: Theme.Metric.popoverWidth)
            .background(Color(nsColor: .windowBackgroundColor))

        let renderer = ImageRenderer(content: wrapped)
        renderer.scale = 2
        let image = try #require(renderer.nsImage)
        let tiff = try #require(image.tiffRepresentation)
        let rep = try #require(NSBitmapImageRep(data: tiff))
        let png = try #require(rep.representation(using: .png, properties: [:]))
        let directory = ProcessInfo.processInfo.environment["SAJILO_RENDER_OUT"] ?? NSTemporaryDirectory()
        try png.write(to: URL(fileURLWithPath: "\(directory)/\(name).png"))
    }
}

private struct RenderStub: RashifalProviding {
    func todaysRashifal() async throws -> RashifalSnapshot {
        RashifalSnapshot(
            readings: RashiSign.allCases.map {
                Rashifal(sign: $0, prediction: "आकस्मिक धनलाभका योग छन्। व्यापार व्यवसायमा आफन्तको विश्वास गर्नाले नुकसान हुनसक्छ। स्वास्थ्यको लागि पौष्टिक आहारको सेवन गर्नुहोस्।")
            },
            publishedOn: NepaliDate(year: 2083, month: 4, day: 31),
            fetchedAt: .now
        )
    }
}


enum StockRenderFixture {
    static var snapshot: StockMarketSnapshot {
        func quote(_ symbol: String, _ name: String, _ ltp: Double, _ prev: Double) -> StockQuote {
            StockQuote(
                symbol: symbol, companyName: name, ltp: ltp, previousClose: prev,
                change: ltp - prev, changePercent: (ltp - prev) / prev * 100,
                open: max(ltp, prev) - 1, high: max(ltp, prev) + 6, low: min(ltp, prev) - 8, close: ltp,
                vwap: (ltp + prev) / 2, volume: 7_026, turnover: 5_054_000, transactions: 123,
                week52High: ltp * 1.21, week52Low: ltp * 0.96,
                average120Day: ltp * 1.06, average180Day: ltp * 1.07
            )
        }
        return StockMarketSnapshot(
            nepse: MarketIndex(name: "NEPSE Index", value: 2_643.83, change: -7.37, changePercent: -0.27, turnover: 4_275_675_402),
            subIndices: [
                MarketIndex(name: "Banking SubIndex", value: 1_198, change: -1.7, changePercent: -0.14, turnover: 0),
                MarketIndex(name: "Hydropower Index", value: 2_940, change: 40, changePercent: 1.38, turnover: 0),
                MarketIndex(name: "Microfinance Index", value: 4_120, change: -12, changePercent: -0.29, turnover: 0),
                MarketIndex(name: "Life Insurance", value: 9_880, change: 22, changePercent: 0.22, turnover: 0),
            ],
            movers: [
                MarketMover(board: .gainers, symbol: "MEPDL", ltp: 253, metric: 15.0),
                MarketMover(board: .gainers, symbol: "SAPIL", ltp: 611, metric: 14.99),
                MarketMover(board: .losers, symbol: "SKHL", ltp: 408, metric: -12.83),
            ],
            quotes: [
                quote("NABIL", "Nabil Bank Limited", 512.4, 505.0),
                quote("GBLBS", "Grameen Bikas Laghubitta Bittiya Sanstha Limited", 722.9, 744.0),
            ],
            publishedOn: Date(timeIntervalSince1970: 1_786_838_400),
            fetchedAt: Date(timeIntervalSince1970: 1_786_838_400)
        )
    }
}


/// Mirrors the panchanga card so it can be rendered; the real one is private
/// to the day-detail route.
struct PanchangaRenderProbe: View {
    let date: Date

    var body: some View {
        if let panchanga = Panchanga.forDate(date, tithi: nil) {
            VStack(alignment: .leading, spacing: Theme.Space.xs) {
                Text(verbatim: "Sun and time")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.secondary)
                HStack(spacing: Theme.Space.s) {
                    ForEach([
                        ("sunrise", "Sunrise", clock(panchanga.sunrise)),
                        ("sunset", "Sunset", clock(panchanga.sunset)),
                        ("clock", "Daylight", panchanga.daylightText),
                    ], id: \.1) { item in
                        VStack(alignment: .leading, spacing: 1) {
                            Label(item.1, systemImage: item.0)
                                .font(.caption2).foregroundStyle(.tertiary)
                            Text(verbatim: item.2).font(.callout.weight(.medium)).monospacedDigit()
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                    }
                }
                if let rahu = panchanga.rahuKaal {
                    Divider().opacity(0.5)
                    HStack(alignment: .top, spacing: Theme.Space.s) {
                        Image(systemName: "exclamationmark.circle")
                            .font(.caption).foregroundStyle(Theme.Palette.holiday).frame(width: 16)
                        VStack(alignment: .leading, spacing: 1) {
                            Text(verbatim: "Rahu Kaal  \(clock(rahu.start))–\(clock(rahu.end))")
                                .font(.callout.weight(.medium)).monospacedDigit()
                            Text(verbatim: "Traditionally avoided for starting something new.")
                                .font(.caption2).foregroundStyle(.secondary)
                        }
                    }
                }
                Text(verbatim: "Times computed for Kathmandu.")
                    .font(.caption2).foregroundStyle(.tertiary)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .cardSection()
        }
    }

    private func clock(_ date: Date) -> String {
        NepalTime.displayFormatter("HH:mm").string(from: date)
    }
}
