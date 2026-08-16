import Foundation

/// Gold and silver as the Federation publishes them.
///
/// Rates are quoted per unit — per tola and per 10 grams — not per gram, in
/// spite of the field name the upstream API uses. `todayBaseRatePerGram` holds
/// 305,200 for one tola of gold, so reading it as a per-gram figure would be
/// out by more than an order of magnitude.
struct MetalRate: Codable, Equatable, Sendable, Identifiable {
    let metal: Metal
    let unit: MetalUnit
    let price: Double
    let previousPrice: Double

    var id: String { "\(metal.rawValue).\(unit.rawValue)" }

    var change: Double { price - previousPrice }
    var changePercent: Double { previousPrice > 0 ? change / previousPrice * 100 : 0 }
    var isUp: Bool { change > 0 }

    /// Derived rather than fetched: the Federation publishes tola and 10 g, and
    /// per-gram is what people divide down to at the counter.
    var pricePerGram: Double { price / unit.grams }

    var priceText: String { "Rs \(NepaliNumberFormatter.grouped(Int(price.rounded())))" }
    var perGramText: String { "Rs \(NepaliNumberFormatter.grouped(Int(pricePerGram.rounded())))/g" }
    var changeText: String {
        String(format: "%@%.2f%%", isUp ? "+" : "", changePercent)
    }
}

enum Metal: String, Codable, Equatable, Sendable, CaseIterable, Identifiable {
    var id: String { rawValue }

    case fineGold
    case tejabiGold
    case silver

    var displayName: String {
        switch self {
        case .fineGold: "Fine gold"
        case .tejabiGold: "Tejabi gold"
        case .silver: "Silver"
        }
    }

    var nepaliName: String {
        switch self {
        case .fineGold: "छापावाल सुन"
        case .tejabiGold: "तेजाबी सुन"
        case .silver: "असली चाँदी"
        }
    }

    var symbolName: String {
        switch self {
        case .fineGold, .tejabiGold: "circle.hexagongrid.fill"
        case .silver: "circle.grid.2x2.fill"
        }
    }
}

enum MetalUnit: String, Codable, Equatable, Sendable, CaseIterable, Identifiable {
    var id: String { rawValue }

    case tola
    case tenGram

    var grams: Double {
        switch self {
        case .tola: WeightUnit.tola.grams
        case .tenGram: 10
        }
    }

    var displayName: String {
        switch self {
        case .tola: "per tola"
        case .tenGram: "per 10 g"
        }
    }
}

struct MetalRateSnapshot: Codable, Equatable, Sendable {
    let rates: [MetalRate]
    /// The Federation's own publish time, not when Sajilo fetched it.
    let publishedAt: Date
    let fetchedAt: Date
    /// Gold price per tola over the last week, oldest first, for the trend line.
    var goldHistory: [Double] = []

    func rate(for metal: Metal, unit: MetalUnit) -> MetalRate? {
        rates.first { $0.metal == metal && $0.unit == unit }
    }

    var headline: MetalRate? {
        rate(for: .fineGold, unit: .tola) ?? rates.first
    }
}
