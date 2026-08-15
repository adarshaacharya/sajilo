import Foundation
import Testing
@testable import SajiloApp

@MainActor
struct DateConverterStoreTests {
    @Test func convertsBikramSambatToGregorianAndKeepsBothCalendars() {
        let store = makeStore(mode: .bsToAD, year: "2083", month: "04", day: "30")

        let outcome = store.outcome
        #expect(store.errorMessage == nil)
        #expect(outcome?.nepali == NepaliDate(year: 2083, month: 4, day: 30))
        #expect(outcome?.gregorianLongText == "Saturday, August 15, 2026")
        #expect(outcome?.isSaturday == true)
    }

    @Test func convertsGregorianToBikramSambat() {
        let store = makeStore(mode: .adToBS, year: "2026", month: "08", day: "15")

        #expect(store.errorMessage == nil)
        #expect(store.outcome?.nepali == NepaliDate(year: 2083, month: 4, day: 30))
    }

    /// PRD §5.2 requires all three copy representations.
    @Test func offersEveryCopyFormat() throws {
        let store = makeStore(mode: .bsToAD, year: "2083", month: "04", day: "30")
        let outcome = try #require(store.outcome)

        #expect(outcome.text(for: .nepaliNumerals) == "२०८३/०४/३०")
        #expect(outcome.text(for: .englishNumerals) == "2083/04/30")
        #expect(outcome.text(for: .longDate) == "Saturday, August 15, 2026")
    }

    /// Swapping must land on the same instant, not reset to today.
    @Test func swapPreservesTheDateAcrossDirections() {
        let store = makeStore(mode: .bsToAD, year: "2083", month: "04", day: "30")

        store.swap()

        #expect(store.mode == .adToBS)
        #expect(store.yearText == "2026")
        #expect(store.monthText == "08")
        #expect(store.dayText == "15")
        #expect(store.outcome?.nepali == NepaliDate(year: 2083, month: 4, day: 30))
    }

    @Test func swappingTwiceReturnsToTheOriginalInput() {
        let store = makeStore(mode: .bsToAD, year: "2083", month: "04", day: "30")

        store.swap()
        store.swap()

        #expect(store.mode == .bsToAD)
        #expect(store.outcome?.nepali == NepaliDate(year: 2083, month: 4, day: 30))
    }

    @Test func attachesBundledEventDataToTheResult() throws {
        let store = makeStore(mode: .bsToAD, year: "2083", month: "04", day: "01")
        let outcome = try #require(store.outcome)

        #expect(outcome.event?.tithi == "तृतीया")
        #expect(outcome.event?.name == "साउन संक्रान्ती, लुतो फाल्ने एवं राँको बाल्ने")
    }

    /// A day the source grid truncated must simply carry no event, not crash or
    /// borrow a neighbour's.
    @Test func leavesEventEmptyForATruncatedSourceDay() throws {
        let store = makeStore(mode: .bsToAD, year: "2083", month: "04", day: "31")
        let outcome = try #require(store.outcome)

        #expect(outcome.nepali == NepaliDate(year: 2083, month: 4, day: 31))
        #expect(outcome.event == nil)
    }

    @Test func reportsNonNumericInput() {
        let store = makeStore(mode: .bsToAD, year: "twenty", month: "04", day: "30")

        #expect(store.outcome == nil)
        #expect(store.errorMessage != nil)
    }

    @Test func reportsDatesOutsideTheSupportedRange() {
        let store = makeStore(mode: .bsToAD, year: "2095", month: "01", day: "01")

        #expect(store.outcome == nil)
        #expect(store.errorMessage != nil)
    }

    @Test func rejectsAnImpossibleDayForTheMonth() {
        // BS 2083-04 has 31 days.
        let store = makeStore(mode: .bsToAD, year: "2083", month: "04", day: "32")

        #expect(store.outcome == nil)
        #expect(store.errorMessage != nil)
    }

    private func makeStore(
        mode: ConverterMode,
        year: String,
        month: String,
        day: String
    ) -> DateConverterStore {
        let store = DateConverterStore()
        store.mode = mode
        store.yearText = year
        store.monthText = month
        store.dayText = day
        store.convert()
        return store
    }
}
