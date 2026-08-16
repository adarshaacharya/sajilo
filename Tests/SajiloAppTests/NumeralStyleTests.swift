import Foundation
import Testing
@testable import SajiloApp

@MainActor
struct NumeralStyleTests {
    @Test func rendersBothDigitSystems() {
        #expect(NumeralStyle.devanagari.string(from: 2083) == "२०८३")
        #expect(NumeralStyle.latin.string(from: 2083) == "2083")
        #expect(NumeralStyle.devanagari.string(from: 4, paddedTo: 2) == "०४")
        #expect(NumeralStyle.latin.string(from: 4, paddedTo: 2) == "04")
    }

    @Test func formatsASlashedDate() {
        let date = NepaliDate(year: 2083, month: 4, day: 31)
        #expect(NumeralStyle.devanagari.slashedDate(date) == "२०८३/०४/३१")
        #expect(NumeralStyle.latin.slashedDate(date) == "2083/04/31")
    }

    /// The picker previews itself, so each option must render in its own digits.
    @Test func eachOptionSamplesItself() {
        #expect(NumeralStyle.devanagari.sample == "२०८३")
        #expect(NumeralStyle.latin.sample == "2083")
        #expect(NumeralStyle.allCases.allSatisfy { !String(localized: $0.displayName).isEmpty })
    }

    @Test func defaultsToDevanagariAndPersists() {
        let defaults = makeDefaults()
        let model = makeModel(defaults: defaults)
        #expect(model.numeralStyle == .devanagari)

        model.numeralStyle = .latin

        #expect(makeModel(defaults: defaults).numeralStyle == .latin)
    }

    /// The menu-bar label is built outside the view hierarchy, so it has to
    /// take the preference explicitly rather than read the environment.
    @Test func menuBarTitleFollowsThePreference() {
        let model = makeModel()
        model.selectedMenuBarFormat = .nepaliLong

        model.numeralStyle = .devanagari
        let devanagari = model.menuBarTitle
        model.numeralStyle = .latin
        let latin = model.menuBarTitle

        #expect(devanagari != latin)
        #expect(devanagari.contains("२०८३"))
        #expect(latin.contains("2083"))
        // Month names stay Devanagari either way — this is a numeral setting,
        // not a translation.
        #expect(latin.contains(model.today.nepaliMonthName))
    }

    @Test func numericMenuBarFormatFollowsThePreference() {
        let model = makeModel()
        model.selectedMenuBarFormat = .numeric

        model.numeralStyle = .latin
        #expect(model.menuBarTitle == NumeralStyle.latin.slashedDate(model.today))

        model.numeralStyle = .devanagari
        #expect(model.menuBarTitle == NumeralStyle.devanagari.slashedDate(model.today))
    }

    /// `englishShort` was already Latin by definition; the preference must not
    /// turn its month name into digits or otherwise disturb it.
    @Test func englishShortFormatIsUnaffected() {
        let model = makeModel()
        model.selectedMenuBarFormat = .englishShort

        model.numeralStyle = .devanagari
        let a = model.menuBarTitle
        model.numeralStyle = .latin

        #expect(a == model.menuBarTitle)
        #expect(a.contains(model.today.englishMonthName))
    }

    private func makeModel(defaults: UserDefaults? = nil) -> AppModel {
        AppModel(
            now: Date(timeIntervalSince1970: 1_786_838_400),
            defaults: defaults ?? makeDefaults(),
            autoLoadWeather: false
        )
    }

    private func makeDefaults() -> UserDefaults {
        let suite = "com.sajilo.tests.numerals.\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suite)!
        defaults.removePersistentDomain(forName: suite)
        return defaults
    }
}
