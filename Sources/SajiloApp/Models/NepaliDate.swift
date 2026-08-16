import Foundation

struct NepaliDate: Codable, Equatable, Hashable, Comparable, Sendable {
    let year: Int
    let month: Int
    let day: Int

    static func < (lhs: Self, rhs: Self) -> Bool {
        (lhs.year, lhs.month, lhs.day) < (rhs.year, rhs.month, rhs.day)
    }

    var nepaliMonthName: String {
        NepaliMonth(rawValue: month)?.nepaliName ?? ""
    }

    var englishMonthName: String {
        NepaliMonth(rawValue: month)?.englishName ?? ""
    }

    var nepaliNumerals: String {
        "\(NepaliNumerals.string(from: year))/\(NepaliNumerals.string(from: month, paddedTo: 2))/\(NepaliNumerals.string(from: day, paddedTo: 2))"
    }
}

enum NepaliMonth: Int, CaseIterable, Sendable {
    case baishakh = 1, jestha, asar, shrawan, bhadra, ashwin, kartik, mangsir, poush, magh, falgun, chaitra

    var nepaliName: String {
        ["बैशाख", "जेठ", "असार", "साउन", "भदौ", "असोज", "कार्तिक", "मंसिर", "पुष", "माघ", "फागुन", "चैत"][rawValue - 1]
    }

    var englishName: String {
        ["Baishakh", "Jestha", "Asar", "Shrawan", "Bhadra", "Ashwin", "Kartik", "Mangsir", "Poush", "Magh", "Falgun", "Chaitra"][rawValue - 1]
    }
}

enum NepaliNumerals {
    private static let digits = Array("०१२३४५६७८९")

    static func string(from value: Int, paddedTo length: Int? = nil) -> String {
        let source = if let length { String(format: "%0\(length)d", value) } else { String(value) }
        return String(source.map { character in
            guard let digit = character.wholeNumberValue else { return character }
            return digits[digit]
        })
    }

    static func arabicString(from value: String) -> String {
        let mapping = Dictionary(uniqueKeysWithValues: zip(digits, "0123456789"))
        return String(value.map { mapping[$0] ?? $0 })
    }
}
