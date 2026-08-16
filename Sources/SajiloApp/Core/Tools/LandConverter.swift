import Foundation

/// Nepal's two land systems plus metric and imperial.
///
/// The hill system (ropani–aana–paisa–daam) and the Terai system
/// (bigha–kattha–dhur) are unrelated to each other; both are defined here in
/// square feet, which is the only unit they share exactly. Every constant below
/// is exact rather than rounded — one ropani is 74 ft × 74 ft, and the rest
/// divide down from there without remainder.
enum LandUnit: String, CaseIterable, Identifiable, Sendable {
    // Hill system, used across the Kathmandu Valley and the hills.
    case ropani
    case aana
    case paisa
    case daam
    // Terai system.
    case bigha
    case kattha
    case dhur
    // Everything else.
    case squareFeet
    case squareMetre

    var id: String { rawValue }

    /// One of this unit, in square feet.
    var squareFeet: Double {
        switch self {
        case .ropani: 5476            // 74 ft × 74 ft
        case .aana: 342.25            // ropani / 16
        case .paisa: 85.5625          // aana / 4
        case .daam: 21.390625         // paisa / 4
        case .bigha: 72_900           // 20 kattha
        case .kattha: 3_645           // bigha / 20
        case .dhur: 182.25            // kattha / 20
        case .squareFeet: 1
        case .squareMetre: 10.763_910_4
        }
    }

    var displayName: String {
        switch self {
        case .ropani: "Ropani"
        case .aana: "Aana"
        case .paisa: "Paisa"
        case .daam: "Daam"
        case .bigha: "Bigha"
        case .kattha: "Kattha"
        case .dhur: "Dhur"
        case .squareFeet: "sq ft"
        case .squareMetre: "m²"
        }
    }

    var nepaliName: String {
        switch self {
        case .ropani: "रोपनी"
        case .aana: "आना"
        case .paisa: "पैसा"
        case .daam: "दाम"
        case .bigha: "बिघा"
        case .kattha: "कठ्ठा"
        case .dhur: "धुर"
        case .squareFeet: "वर्ग फिट"
        case .squareMetre: "वर्ग मिटर"
        }
    }

    static let hillSystem: [LandUnit] = [.ropani, .aana, .paisa, .daam]
    static let teraiSystem: [LandUnit] = [.bigha, .kattha, .dhur]
}

enum LandConverter {
    static func convert(_ value: Double, from source: LandUnit, to target: LandUnit) -> Double {
        value * source.squareFeet / target.squareFeet
    }

    /// Land is quoted as a compound figure — "2-3-1-0" means 2 ropani, 3 aana,
    /// 1 paisa, 0 daam — so a single decimal is rarely what anyone wants.
    struct HillArea: Equatable, Sendable {
        var ropani = 0
        var aana = 0
        var paisa = 0
        var daam = 0.0

        /// The form used on deeds and in listings.
        var compact: String {
            "\(ropani)-\(aana)-\(paisa)-\(formatted(daam))"
        }
    }

    struct TeraiArea: Equatable, Sendable {
        var bigha = 0
        var kattha = 0
        var dhur = 0.0

        var compact: String {
            "\(bigha)-\(kattha)-\(formatted(dhur))"
        }
    }

    static func hillArea(squareFeet: Double) -> HillArea {
        var remaining = max(0, squareFeet)
        var area = HillArea()

        area.ropani = Int(remaining / LandUnit.ropani.squareFeet)
        remaining -= Double(area.ropani) * LandUnit.ropani.squareFeet
        area.aana = Int(remaining / LandUnit.aana.squareFeet)
        remaining -= Double(area.aana) * LandUnit.aana.squareFeet
        area.paisa = Int(remaining / LandUnit.paisa.squareFeet)
        remaining -= Double(area.paisa) * LandUnit.paisa.squareFeet
        // Daam is the smallest unit, so the remainder stays fractional rather
        // than being rounded away — that residue is real land.
        area.daam = remaining / LandUnit.daam.squareFeet
        return area
    }

    static func teraiArea(squareFeet: Double) -> TeraiArea {
        var remaining = max(0, squareFeet)
        var area = TeraiArea()

        area.bigha = Int(remaining / LandUnit.bigha.squareFeet)
        remaining -= Double(area.bigha) * LandUnit.bigha.squareFeet
        area.kattha = Int(remaining / LandUnit.kattha.squareFeet)
        remaining -= Double(area.kattha) * LandUnit.kattha.squareFeet
        area.dhur = remaining / LandUnit.dhur.squareFeet
        return area
    }
}

private func formatted(_ value: Double) -> String {
    // Whole numbers read as whole numbers; a residue keeps two places.
    value.rounded() == value ? String(Int(value)) : String(format: "%.2f", value)
}
