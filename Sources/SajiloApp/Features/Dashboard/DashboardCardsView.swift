import AppKit
import SwiftUI

// MARK: - Cards

struct DashboardCardsView: View {
    let cards: [DashboardCard]
    let weather: WeatherSnapshot?
    let forexTrend: [Double]?
    let isActive: Bool
    let openWeather: () -> Void
    let openForex: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Space.s) {
            HStack(spacing: Theme.Space.m) {
                ForEach(cards) { card in
                    DashboardCardView(card: card, weather: weather, forexTrend: forexTrend, isActive: isActive, openWeather: openWeather, openForex: openForex)
                }
            }

            if let weatherCard = cards.first(where: { card in
                if case .weather = card.kind { return true }
                return false
            }) {
                HStack(spacing: Theme.Space.xs) {
                    Text(weatherCard.freshness)
                    Spacer(minLength: 0)
                    Link("Open-Meteo", destination: URL(string: "https://open-meteo.com/")!)
                }
                .font(.caption2)
                .foregroundStyle(.secondary)
            } else if let freshness = cards.first?.freshness {
                Text(freshness)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
        }
    }
}

private struct DashboardCardView: View {
    let card: DashboardCard
    let weather: WeatherSnapshot?
    let forexTrend: [Double]?
    let isActive: Bool
    let openWeather: () -> Void
    let openForex: () -> Void

    var body: some View {
        switch card.kind {
        case .weather:
            Button(action: openWeather) {
                content
            }
            .buttonStyle(.plain)
            .accessibilityLabel("\(card.title), \(card.primaryValue). \(card.detail). \(card.freshness)")
            .accessibilityHint("Open the weather forecast")
        case .forex:
            Button(action: openForex) {
                content
            }
            .buttonStyle(.plain)
            .accessibilityLabel("\(card.title), \(card.primaryValue). \(card.detail). \(card.freshness)")
            .accessibilityHint("Open exchange rates")
        }
    }

    private var content: some View {
        VStack(alignment: .leading, spacing: Theme.Space.xs) {
            HStack(spacing: Theme.Space.xs) {
                Image(systemName: card.symbol)
                    .font(.system(size: 11))
                    .foregroundStyle(card.kind.tint)
                    .accessibilityHidden(true)
                Text(card.title)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }

            Text(card.primaryValue)
                .font(.title3.weight(.semibold))

            Text(card.detail)
                .font(.caption2)
                .foregroundStyle(.secondary)
                .lineLimit(1)
        }
        .frame(maxWidth: .infinity, minHeight: 62, alignment: .topLeading)
        .cardSection(padding: Theme.Space.s) { atmosphere }
    }

    /// A miniature of the detail hero: a faint sky wash so time of day reads at
    /// a glance, plus the same precipitation at a fraction of the density.
    ///
    /// Kept deliberately low-contrast — the card sits next to the calendar, and
    /// the popover should stay calm. Text keeps its normal colours rather than
    /// going white, so nothing here can hurt legibility.
    @ViewBuilder
    private var atmosphere: some View {
        if card.kind == .forex, let forexTrend {
            SparklineView(values: forexTrend)
                // Bottom third only, so it never runs behind the rate itself.
                .frame(height: 22)
                .frame(maxHeight: .infinity, alignment: .bottom)
                .padding(.horizontal, -Theme.Space.s)
                .padding(.bottom, -Theme.Space.s)
                .accessibilityHidden(true)
        } else if card.kind == .weather, let weather {
            let phase = SkyPhase.current(sunrise: weather.sunrise, sunset: weather.sunset)

            ZStack {
                LinearGradient(sky: phase)
                    .opacity(0.11)

                WeatherAtmosphereView(
                    condition: weather.condition,
                    phase: phase,
                    isActive: isActive,
                    tint: Theme.Palette.particle,
                    densityScale: 0.16
                )
            }
            .accessibilityHidden(true)
        }
    }
}
