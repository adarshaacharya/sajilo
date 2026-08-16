import Foundation
import Testing
@testable import SajiloApp

struct LandConverterTests {
    /// The two systems are defined by these subdivisions; if any drift, every
    /// conversion downstream is wrong.
    @Test func subdivisionsAreExact() {
        #expect(LandUnit.ropani.squareFeet == 16 * LandUnit.aana.squareFeet)
        #expect(LandUnit.aana.squareFeet == 4 * LandUnit.paisa.squareFeet)
        #expect(LandUnit.paisa.squareFeet == 4 * LandUnit.daam.squareFeet)

        #expect(LandUnit.bigha.squareFeet == 20 * LandUnit.kattha.squareFeet)
        #expect(LandUnit.kattha.squareFeet == 20 * LandUnit.dhur.squareFeet)
    }

    /// One ropani is 74 ft square — the definition everything else divides from.
    @Test func ropaniIsSeventyFourFeetSquare() {
        #expect(LandUnit.ropani.squareFeet == 74 * 74)
        #expect(LandUnit.bigha.squareFeet == 72_900)
    }

    @Test func convertsWithinTheHillSystem() {
        #expect(LandConverter.convert(1, from: .ropani, to: .aana) == 16)
        #expect(LandConverter.convert(1, from: .ropani, to: .paisa) == 64)
        #expect(LandConverter.convert(1, from: .ropani, to: .daam) == 256)
        #expect(LandConverter.convert(16, from: .aana, to: .ropani) == 1)
    }

    @Test func convertsWithinTheTeraiSystem() {
        #expect(LandConverter.convert(1, from: .bigha, to: .kattha) == 20)
        #expect(LandConverter.convert(1, from: .bigha, to: .dhur) == 400)
        #expect(LandConverter.convert(20, from: .kattha, to: .bigha) == 1)
    }

    /// The systems are unrelated, so a cross conversion is the one people
    /// cannot do in their head. 1 bigha ≈ 13.31 ropani.
    @Test func convertsBetweenTheTwoSystems() {
        // 72,900 / 5,476 = 13.31264…, the figure usually quoted as "13.31".
        let ropani = LandConverter.convert(1, from: .bigha, to: .ropani)
        #expect(abs(ropani - 13.312_637) < 0.000_01)

        let bigha = LandConverter.convert(ropani, from: .ropani, to: .bigha)
        #expect(abs(bigha - 1) < 0.000_001, "the cross conversion must round trip")
    }

    @Test func convertsToMetricAndImperial() {
        #expect(LandConverter.convert(1, from: .ropani, to: .squareFeet) == 5476)
        let metres = LandConverter.convert(1, from: .ropani, to: .squareMetre)
        #expect(abs(metres - 508.737) < 0.01, "1 ropani ≈ 508.74 m²")
    }

    /// Land is quoted compound — "2-3-1-0" — not as a decimal.
    @Test func decomposesIntoTheQuotedHillForm() {
        let squareFeet = 2 * 5476.0 + 3 * 342.25 + 1 * 85.5625
        let area = LandConverter.hillArea(squareFeet: squareFeet)

        #expect(area.ropani == 2)
        #expect(area.aana == 3)
        #expect(area.paisa == 1)
        #expect(abs(area.daam) < 0.0001)
        #expect(area.compact == "2-3-1-0")
    }

    @Test func decomposesIntoTheQuotedTeraiForm() {
        let squareFeet = 1 * 72_900.0 + 5 * 3_645 + 7 * 182.25
        let area = LandConverter.teraiArea(squareFeet: squareFeet)

        #expect(area.bigha == 1)
        #expect(area.kattha == 5)
        #expect(abs(area.dhur - 7) < 0.0001)
        #expect(area.compact == "1-5-7")
    }

    /// The residue below one daam is real land and must not be rounded away.
    @Test func keepsTheRemainderBelowTheSmallestUnit() {
        let area = LandConverter.hillArea(squareFeet: 5476 + 10)
        #expect(area.ropani == 1)
        #expect(area.aana == 0)
        #expect(area.daam > 0, "10 sq ft of remainder must survive")
    }

    @Test func handlesZeroAndNegativeInput() {
        #expect(LandConverter.hillArea(squareFeet: 0).compact == "0-0-0-0")
        #expect(LandConverter.teraiArea(squareFeet: -100).compact == "0-0-0")
    }

    @Test func roundTripsThroughEveryUnit() {
        for unit in LandUnit.allCases {
            let squareFeet = LandConverter.convert(3, from: unit, to: .squareFeet)
            let back = LandConverter.convert(squareFeet, from: .squareFeet, to: unit)
            #expect(abs(back - 3) < 0.000_001, "\(unit) round trip")
            #expect(!unit.displayName.isEmpty)
            #expect(!unit.nepaliName.isEmpty)
        }
    }
}
