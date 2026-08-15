import Testing
@testable import SajiloApp

struct NepaliNumeralsTests {
    @Test(arguments: [
        (0, "०"),
        (7, "७"),
        (30, "३०"),
        (2083, "२०८३")
    ])
    func convertsArabicDigitsToNepaliDigits(input: Int, expected: String) {
        #expect(NepaliNumerals.string(from: input) == expected)
    }

    @Test func padsThenConvertsDigits() {
        #expect(NepaliNumerals.string(from: 4, paddedTo: 2) == "०४")
    }

    @Test func convertsNepaliDigitsBackToArabicDigits() {
        #expect(NepaliNumerals.arabicString(from: "२०८३/०४/३०") == "2083/04/30")
    }
}
