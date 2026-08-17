import Foundation
import Testing
@testable import SajiloApp

struct WeightConverterTests {
    /// A tola is 3/8 of a troy ounce exactly. Jewellers quote 11.664 g; the
    /// exact value is kept so large quantities do not drift.
    @Test func tolaIsThreeEighthsOfATroyOunce() {
        #expect(abs(WeightUnit.tola.grams - WeightUnit.ounce.grams * 3 / 8) < 0.000_001)
        #expect(abs(WeightUnit.tola.grams - 11.6638) < 0.0001)
    }

    /// Gold is quoted per tola and per 10 g, so this is the conversion people
    /// actually do at the counter.
    @Test func convertsTolaToTenGram() {
        let tenGrams = WeightConverter.convert(1, from: .tola, to: .tenGram)
        #expect(abs(tenGrams - 1.16638) < 0.0001)

        let tolas = WeightConverter.convert(1, from: .tenGram, to: .tola)
        #expect(abs(tolas - 0.857_39) < 0.0001)
    }

    @Test func roundTripsEveryUnit() {
        for unit in WeightUnit.allCases {
            let grams = WeightConverter.convert(7.5, from: unit, to: .gram)
            #expect(abs(WeightConverter.convert(grams, from: .gram, to: unit) - 7.5) < 0.000_001)
            #expect(!unit.displayName.isEmpty)
            #expect(!unit.nepaliName.isEmpty)
        }
    }
}

struct FinanceCalculatorTests {
    @Test func addsVATToAQuotedPrice() {
        let result = FinanceCalculator.addingVAT(to: 1_000)

        #expect(abs(result.vat - 130) < 0.000_001)
        #expect(abs(result.total - 1_130) < 0.000_001)
    }

    /// The common mistake: taking 13% *of the total* overstates the tax. On a
    /// Rs 1,130 bill the VAT is 130, not 146.90.
    @Test func extractsVATFromAnInclusivePrice() {
        let result = FinanceCalculator.removingVAT(from: 1_130)

        #expect(abs(result.base - 1_000) < 0.000_001)
        #expect(abs(result.vat - 130) < 0.000_001)
        #expect(abs(result.vat - 1_130 * 0.13) > 1, "must not be 13% of the total")
    }

    @Test func vatRoundTrips() {
        let added = FinanceCalculator.addingVAT(to: 4_567.89)
        let removed = FinanceCalculator.removingVAT(from: added.total)

        #expect(abs(removed.base - 4_567.89) < 0.000_001)
    }

    @Test func usesNepalsStandardRate() {
        #expect(FinanceCalculator.vatRate == 0.13)
    }

    @Test func computesSimpleInterest() {
        let result = FinanceCalculator.simpleInterest(principal: 100_000, annualRatePercent: 12, years: 2)

        #expect(abs(result.interest - 24_000) < 0.000_001)
        #expect(abs(result.total - 124_000) < 0.000_001)
    }

    @Test func handlesFractionalTerms() {
        let halfYear = FinanceCalculator.simpleInterest(principal: 50_000, annualRatePercent: 10, years: 0.5)
        #expect(abs(halfYear.interest - 2_500) < 0.000_001)

        let zero = FinanceCalculator.simpleInterest(principal: 50_000, annualRatePercent: 0, years: 3)
        #expect(zero.interest == 0)
        #expect(zero.total == 50_000)
    }
}

struct NepaliNumberFormatterTests {
    /// `NumberFormatter` groups uniformly in threes and would render this as
    /// 12,500,000. South Asian grouping is what makes lakh and crore readable.
    @Test(arguments: [
        (100, "100"),
        (1_000, "1,000"),
        (10_000, "10,000"),
        (100_000, "1,00,000"),
        (1_000_000, "10,00,000"),
        (12_500_000, "1,25,00,000"),
        (1_234_567_890, "1,23,45,67,890")
    ])
    func groupsInTheSouthAsianStyle(value: Int, expected: String) {
        #expect(NepaliNumberFormatter.grouped(value) == expected)
    }

    @Test func handlesZeroAndNegatives() {
        #expect(NepaliNumberFormatter.grouped(0) == "0")
        #expect(NepaliNumberFormatter.grouped(-1_00_000) == "-1,00,000")
    }

    @Test func preservesPublishedMarketDecimals() {
        #expect(NepaliNumberFormatter.grouped(722.90, fractionDigits: 2) == "722.90")
        #expect(NepaliNumberFormatter.grouped(4_275_675_402.84, fractionDigits: 2) == "4,27,56,75,402.84")
        #expect(NepaliNumberFormatter.grouped(-20.70, fractionDigits: 2) == "-20.70")
    }

    @Test func describesTheScaleAsItIsSpoken() {
        #expect(NepaliNumberFormatter.scaleDescription(12_500_000) == "1 crore 25 lakh")
        #expect(NepaliNumberFormatter.scaleDescription(500_000) == "5 lakh")
        #expect(NepaliNumberFormatter.scaleDescription(10_000_000) == "1 crore")
    }

    /// Below a lakh there is no scale word to add, so it stays silent rather
    /// than saying "0 lakh".
    @Test func omitsTheScaleBelowALakh() {
        #expect(NepaliNumberFormatter.scaleDescription(99_999) == nil)
        #expect(NepaliNumberFormatter.scaleDescription(0) == nil)
    }
}
