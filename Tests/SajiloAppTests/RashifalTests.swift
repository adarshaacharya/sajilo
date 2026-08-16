import Foundation
import Testing
@testable import SajiloApp

struct RashifalTests {
    /// Shaped like the real page: a title carrying the Bikram Sambat date, then
    /// a heading and a paragraph per sign, with nav chrome in between.
    private static func page(
        title: String = "आजको राशिफल साउन ३१, २०८३ — Daily Rashifal",
        signs: [RashiSign] = RashiSign.allCases
    ) -> String {
        let sections = signs.map { sign in
            """
            <div class="card">
              <a href="/rashifal/\(sign.rawValue)">थप</a>
              <h3>\(sign.nepaliName)</h3>
              <p>\(sign.nepaliName) को आजको राशिफल: कार्यक्षेत्रमा दिन अनुकूल रहनेछ। \
            आर्थिक स्थिति सन्तोषजनक रहनेछ। आजको शुभ रंग सेतो हो।</p>
            </div>
            """
        }.joined(separator: "\n")

        return """
        <html><head><title>\(title)</title>
        <script>var x = "मेष";</script>
        <style>.a{content:"वृष"}</style>
        </head><body><nav>गृहपृष्ठ</nav>\(sections)</body></html>
        """
    }

    @Test func readsAllTwelveSigns() throws {
        let snapshot = try HamroPatroRashifalProvider.parse(Self.page(), fetchedAt: .now)

        #expect(snapshot.readings.count == 12)
        #expect(Set(snapshot.readings.map(\.sign)) == Set(RashiSign.allCases))
        for reading in snapshot.readings {
            #expect(reading.prediction.contains("कार्यक्षेत्रमा"))
        }
    }

    @Test func keepsTheSignsInCanonicalOrder() throws {
        let snapshot = try HamroPatroRashifalProvider.parse(Self.page(), fetchedAt: .now)
        #expect(snapshot.readings.map(\.sign) == RashiSign.allCases)
        #expect(RashiSign.allCases.first == .mesh)
        #expect(RashiSign.allCases.last == .meen)
    }

    /// A partial page means the markup moved. Twelve or nothing — four signs
    /// shown while eight vanish silently is worse than saying it is down.
    @Test func refusesAPartialPage() {
        let short = Self.page(signs: [.mesh, .vrish, .mithun])

        #expect(throws: RashifalProviderError.incompleteReading(found: 3)) {
            try HamroPatroRashifalProvider.parse(short, fetchedAt: .now)
        }
        #expect(throws: RashifalProviderError.incompleteReading(found: 0)) {
            try HamroPatroRashifalProvider.parse("<html><body>बन्द</body></html>", fetchedAt: .now)
        }
    }

    /// Sign names appear inside inline scripts and styles on the real page.
    /// Reading those as content would attach a stray fragment to a sign.
    @Test func ignoresSignNamesInsideScriptsAndStyles() throws {
        let snapshot = try HamroPatroRashifalProvider.parse(Self.page(), fetchedAt: .now)
        let mesh = try #require(snapshot.reading(for: .mesh))
        #expect(!mesh.prediction.contains("var x"))
        #expect(mesh.prediction.contains("कार्यक्षेत्रमा"))
    }

    /// Short runs near the heading — "थप", nav items, a lucky colour on its own
    /// line — must not be mistaken for the reading.
    @Test func skipsShortRunsBeforeTheParagraph() throws {
        let snapshot = try HamroPatroRashifalProvider.parse(Self.page(), fetchedAt: .now)
        let tula = try #require(snapshot.reading(for: .tula))
        #expect(tula.prediction != "थप")
        #expect(tula.prediction.count > 60)
    }

    @Test func readsThePublishedBikramSambatDate() throws {
        let snapshot = try HamroPatroRashifalProvider.parse(Self.page(), fetchedAt: .now)
        let published = try #require(snapshot.publishedOn)

        #expect(published.year == 2083)
        #expect(published.month == 4)
        #expect(published.day == 31)
    }

    /// Without a readable date the reading must not silently claim to be
    /// today's — a cached one can be a day old after midnight.
    @Test(arguments: ["<html><title>राशिफल</title></html>", "<html><title>आजको राशिफल</title></html>"])
    func leavesTheDateUnsetRatherThanAssumingToday(html: String) {
        #expect(HamroPatroRashifalProvider.publishedDate(in: html) == nil)
    }

    /// The reading is reproduced as published — not trimmed or reflowed.
    @Test func carriesThePredictionVerbatim() throws {
        let exact = "मेष को आजको राशिफल: कार्यक्षेत्रमा दिन अनुकूल रहनेछ। आर्थिक स्थिति सन्तोषजनक रहनेछ। आजको शुभ रंग सेतो हो।"
        let snapshot = try HamroPatroRashifalProvider.parse(Self.page(), fetchedAt: .now)
        #expect(snapshot.reading(for: .mesh)?.prediction == exact)
    }
}

struct RashiSignTests {
    /// The twelve rashi line up with the twelve Bikram Sambat months, because
    /// a BS month is the span the sun spends in one rashi.
    @Test func thereAreTwelveMatchingTheCalendarMonths() {
        #expect(RashiSign.allCases.count == NepaliMonth.allCases.count)
    }

    @Test func everySignIsNamedInAllThreeForms() {
        for sign in RashiSign.allCases {
            #expect(!sign.nepaliName.isEmpty)
            #expect(!sign.romanName.isEmpty)
            #expect(!sign.westernName.isEmpty)
            #expect(!sign.glyph.isEmpty)
            #expect(!sign.namingSyllables.isEmpty)
        }
        #expect(Set(RashiSign.allCases.map(\.nepaliName)).count == 12, "no duplicate Nepali names")
        #expect(Set(RashiSign.allCases.map(\.westernName)).count == 12)
    }

    @Test func mapsNepaliNamesToTheRightWesternSign() {
        #expect(RashiSign.mesh.westernName == "Aries")
        #expect(RashiSign.karkat.westernName == "Cancer")
        #expect(RashiSign.meen.westernName == "Pisces")
    }
}
