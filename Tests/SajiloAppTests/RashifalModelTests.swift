import Foundation
import Testing
@testable import SajiloApp

@MainActor
struct RashifalModelTests {
    @Test func noSignIsChosenUntilTheReaderPicksOne() {
        // Rashi is the moon sign from a birth chart, so there is nothing to
        // infer it from. Defaulting to one would hand most people the wrong
        // reading and look authoritative doing it.
        #expect(makeModel().selectedRashi == nil)
        #expect(makeModel().myRashifal == nil)
    }

    @Test func theChosenSignSurvivesRelaunch() {
        let defaults = Self.makeDefaults()
        makeModel(defaults: defaults).selectedRashi = .karkat

        #expect(makeModel(defaults: defaults).selectedRashi == .karkat)
    }

    @Test func servesTheReadingForTheChosenSign() async {
        let model = makeModel()
        await model.refreshRashifalIfStale()
        model.selectedRashi = .tula

        #expect(model.myRashifal?.sign == .tula)
        #expect(model.myRashifal?.prediction.contains("तुला") == true)
        #expect(model.rashifal?.readings.count == 12)
    }

    /// The source publishes each morning, so a reading fetched yesterday is
    /// still cached after midnight. It must be shown as an earlier day's rather
    /// than passing as today's.
    @Test func flagsAReadingWrittenForAnotherDay() async {
        let model = makeModel(provider: StubRashifalProvider(publishedOn: NepaliDate(year: 2083, month: 4, day: 29)))
        await model.refreshRashifalIfStale()

        #expect(model.isRashifalFromToday == false)
    }

    @Test func treatsTodaysReadingAsCurrent() async {
        let model = makeModel()
        let today = model.today
        let fresh = makeModel(provider: StubRashifalProvider(publishedOn: today))
        await fresh.refreshRashifalIfStale()

        #expect(fresh.isRashifalFromToday)
    }

    /// A source that stops publishing a date must not be reported as stale on
    /// every launch — unknown is treated as current, and the reading still
    /// carries its own published line when there is one.
    @Test func treatsAnUndatedReadingAsCurrent() async {
        let model = makeModel(provider: StubRashifalProvider(publishedOn: nil))
        await model.refreshRashifalIfStale()

        #expect(model.isRashifalFromToday)
    }

    @Test func aDisabledRashifalNeverFetches() async {
        let provider = StubRashifalProvider()
        let model = makeModel(provider: provider)
        model.isRashifalEnabled = false

        await model.refreshRashifalIfStale()

        #expect(provider.callCount == 0)
        #expect(model.rashifal == nil)
    }

    @Test func rashifalIsOnByDefaultAndStaysOffOnceTurnedOff() {
        let defaults = Self.makeDefaults()
        #expect(makeModel().isRashifalEnabled)

        makeModel(defaults: defaults).isRashifalEnabled = false
        #expect(makeModel(defaults: defaults).isRashifalEnabled == false)
    }

    /// A partial page is reported in the route's own words rather than as a
    /// raw networking failure.
    @Test func explainsAnUnreadablePage() async {
        let model = makeModel(provider: FailingRashifalProvider())
        await model.refreshRashifalIfStale()

        #expect(model.rashifal == nil)
        #expect(model.rashifalError == "Today's rashifal could not be read from Hamro Patro")
    }

    @Test func aWarmCacheIsNotRefetched() async {
        let provider = StubRashifalProvider()
        let model = makeModel(defaults: Self.makeDefaults(), provider: provider)

        await model.refreshRashifalIfStale()
        await model.refreshRashifalIfStale()
        #expect(provider.callCount == 1)

        await model.refreshRashifal()
        #expect(provider.callCount == 2, "the Refresh button ignores staleness")
    }

    // MARK: - Fixtures

    private func makeModel(
        defaults: UserDefaults? = nil,
        provider: any RashifalProviding = StubRashifalProvider()
    ) -> AppModel {
        AppModel(
            now: Date(timeIntervalSince1970: 1_786_838_400),
            defaults: defaults ?? Self.makeDefaults(),
            rashifalProvider: provider,
            autoLoadWeather: false
        )
    }

    private static func makeDefaults() -> UserDefaults {
        let suite = "com.sajilo.tests.rashifal.\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suite)!
        defaults.removePersistentDomain(forName: suite)
        return defaults
    }
}

private final class StubRashifalProvider: RashifalProviding, @unchecked Sendable {
    private(set) var callCount = 0
    private let publishedOn: NepaliDate?

    init(publishedOn: NepaliDate? = NepaliDate(year: 2083, month: 4, day: 31)) {
        self.publishedOn = publishedOn
    }

    func todaysRashifal() async throws -> RashifalSnapshot {
        callCount += 1
        return RashifalSnapshot(
            readings: RashiSign.allCases.map {
                Rashifal(sign: $0, prediction: "\($0.nepaliName) को आजको राशिफल: दिन अनुकूल रहनेछ।")
            },
            publishedOn: publishedOn,
            fetchedAt: .now
        )
    }
}

private struct FailingRashifalProvider: RashifalProviding {
    func todaysRashifal() async throws -> RashifalSnapshot {
        throw RashifalProviderError.incompleteReading(found: 3)
    }
}
