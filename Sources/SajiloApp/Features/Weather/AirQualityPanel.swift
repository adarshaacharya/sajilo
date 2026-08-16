import SwiftUI

/// The AQI reading, its band on the EPA scale, and what to actually do about it.
struct AirQualityPanel: View {
    let airQuality: AirQuality

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Space.s) {
            HStack(alignment: .firstTextBaseline, spacing: Theme.Space.s) {
                Text(L10n.airQuality)
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.secondary)

                Spacer(minLength: 0)

                Text(verbatim: airQuality.indexText)
                    .font(.title3.weight(.semibold))
                    .monospacedDigit()
                    .foregroundStyle(airQuality.category.tint)
                    .contentTransition(.numericText())

                Text(airQuality.category.title)
                    .font(.caption.weight(.medium))
                    .foregroundStyle(airQuality.category.tint)
            }

            scale

            Text(airQuality.category.advice)
                .font(.caption)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)

            HStack(spacing: Theme.Space.m) {
                reading(L10n.pm25, airQuality.pm25Text)
                reading(L10n.pm10, airQuality.pm10Text)
                Spacer(minLength: 0)
            }
        }
        .cardSection()
        .accessibilityElement(children: .combine)
        .accessibilityLabel(
            "\(String(localized: L10n.airQuality)) \(airQuality.usAQI), "
                + "\(String(localized: airQuality.category.title)). "
                + "\(String(localized: airQuality.category.advice))"
        )
    }

    /// The whole scale, with today's position marked.
    ///
    /// A bare number means little without the bands around it — 93 reads very
    /// differently once you can see it sitting at the top of "moderate".
    private var scale: some View {
        GeometryReader { proxy in
            let bands = AQICategory.allCases

            ZStack(alignment: .leading) {
                HStack(spacing: 1) {
                    ForEach(bands, id: \.self) { band in
                        Rectangle()
                            .fill(band.tint.opacity(band == airQuality.category ? 0.9 : 0.28))
                    }
                }
                .clipShape(.capsule)

                // Clamped so a hazardous reading above 500 still lands inside
                // the bar rather than off the end of it.
                Capsule()
                    .fill(Theme.Palette.onBrandFill)
                    .frame(width: 2, height: 10)
                    .offset(x: min(max(position * proxy.size.width, 1), proxy.size.width - 2))
            }
        }
        .frame(height: 6)
        .accessibilityHidden(true)
    }

    /// 0–500 across six bands, as the EPA scale runs.
    private var position: Double {
        min(Double(airQuality.usAQI) / 500, 1)
    }

    private func reading(_ label: LocalizedStringResource, _ value: String) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(label)
                .font(.caption2)
                .foregroundStyle(.tertiary)
            Text(verbatim: value)
                .font(.caption.weight(.medium))
                .monospacedDigit()
        }
    }
}
