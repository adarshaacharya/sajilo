import Foundation

/// Nepal Oil Corporation's retail price for one fuel.
///
/// NOC revises prices on a schedule rather than continuously, so a price is
/// effective from a date and stands until the next revision. `change` compares
/// against the revision before it, which is the number people actually notice.
struct FuelPrice: Codable, Equatable, Sendable, Identifiable {
    let fuel: Fuel
    let price: Double
    let previousPrice: Double

    var id: String { fuel.rawValue }

    var change: Double { price - previousPrice }
    var isUp: Bool { change > 0 }
    var isUnchanged: Bool { abs(change) < 0.005 }

    var priceText: String { "Rs \(NepaliNumberFormatter.grouped(Int(price.rounded())))" }

    var changeText: String {
        guard !isUnchanged else { return "No change" }
        return String(format: "%@%.0f", isUp ? "+" : "−", abs(change))
    }
}

enum Fuel: String, Codable, Equatable, Sendable, CaseIterable, Identifiable {
    var id: String { rawValue }

    case petrol
    case diesel
    case kerosene
    case lpg

    var displayName: String {
        switch self {
        case .petrol: "Petrol"
        case .diesel: "Diesel"
        case .kerosene: "Kerosene"
        case .lpg: "LPG cylinder"
        }
    }

    var nepaliName: String {
        switch self {
        case .petrol: "पेट्रोल"
        case .diesel: "डिजेल"
        case .kerosene: "मट्टितेल"
        case .lpg: "ग्यास सिलिन्डर"
        }
    }

    var unitLabel: String {
        switch self {
        case .petrol, .diesel, .kerosene: "per litre"
        // NOC quotes the 14.2 kg domestic cylinder, not a per-kg figure.
        case .lpg: "per cylinder"
        }
    }

    var symbolName: String {
        switch self {
        case .petrol: "fuelpump.fill"
        case .diesel: "truck.box.fill"
        case .kerosene: "flame.fill"
        case .lpg: "cylinder.fill"
        }
    }

    /// The column heading NOC uses, lowercased.
    var columnHeading: String {
        switch self {
        case .petrol: "petrol"
        case .diesel: "diesel"
        case .kerosene: "kerosene"
        case .lpg: "lpg"
        }
    }
}

struct FuelPriceSnapshot: Codable, Equatable, Sendable {
    let prices: [FuelPrice]
    /// The date NOC's current rate took effect, not when Sajilo fetched it.
    let effectiveFrom: Date
    let fetchedAt: Date

    func price(for fuel: Fuel) -> FuelPrice? {
        prices.first { $0.fuel == fuel }
    }

    var headline: FuelPrice? { price(for: .petrol) ?? prices.first }
}
