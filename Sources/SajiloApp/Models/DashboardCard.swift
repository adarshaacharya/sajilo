import SwiftUI

struct DashboardCard: Identifiable, Equatable, Sendable {
    enum Kind: Sendable {
        case weather
        case forex

        /// Glyph tint. Cards carry colour only on their icon so the accent
        /// stays reserved for the calendar.
        var tint: Color {
            switch self {
            case .weather: .orange
            // A quoted rate is neutral information. Green and red are kept
            // for actual movement in the sparkline instead.
            case .forex: .secondary
            }
        }
    }

    let id: String
    let kind: Kind
    let title: String
    let primaryValue: String
    let detail: String
    let symbol: String
    let freshness: String
}
