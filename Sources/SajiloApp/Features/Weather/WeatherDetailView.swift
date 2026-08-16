import SwiftUI

/// PRD §5.4: current conditions plus today, tomorrow, and the five-day
/// forecast, over a backdrop tinted by the time of day at the location.
struct WeatherDetailView: View {
    let model: AppModel
    /// Whether this route is on screen. Drives the animated backdrop, which
    /// must not keep running while the layer sits hidden behind the dashboard.
    let isActive: Bool
    let onBack: () -> Void

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        VStack(spacing: 0) {
            hero
            body(for: model.weather)
        }
    }

    private var phase: SkyPhase {
        SkyPhase.current(sunrise: model.weather?.sunrise, sunset: model.weather?.sunset)
    }

    // MARK: - Hero

    private var hero: some View {
        ZStack(alignment: .top) {
            LinearGradient(sky: phase)

            if let weather = model.weather {
                WeatherAtmosphereView(
                    condition: weather.condition,
                    phase: phase,
                    isActive: isActive
                )
            }

            VStack(alignment: .leading, spacing: Theme.Space.xs) {
                HStack(spacing: Theme.Space.s) {
                    Button(L10n.back, systemImage: "chevron.left", action: onBack)
                        .labelStyle(.iconOnly)
                        .buttonStyle(GlassIconButtonStyle())
                        .accessibilityLabel("Back to dashboard")

                    Text(model.selectedWeatherLocation.displayName)
                        .font(.headline)

                    Spacer(minLength: 0)

                    Button(L10n.refresh, systemImage: "arrow.clockwise") {
                        Task { await model.refreshWeather() }
                    }
                    .labelStyle(.iconOnly)
                    .buttonStyle(GlassIconButtonStyle())
                    .disabled(model.isWeatherLoading)
                    .accessibilityLabel("Refresh weather")
                }

                if let weather = model.weather {
                    Text(weather.temperatureText)
                        .font(.system(size: 54, weight: .semibold, design: .rounded))
                        .contentTransition(.numericText())

                    Label(weather.condition.title, systemImage: weather.condition.symbolName)
                        .font(.callout.weight(.medium))

                    Text("\(weather.apparentTemperatureText) · \(weather.rangeText) · \(weather.precipitationText)")
                        .font(.caption)
                        .opacity(0.85)
                } else {
                    Text(model.isWeatherLoading ? "Loading…" : "Unavailable")
                        .font(.system(size: 34, weight: .semibold, design: .rounded))
                    Text(model.weatherError ?? "Pull the latest reading with the refresh button.")
                        .font(.caption)
                        .opacity(0.85)
                }
            }
            .foregroundStyle(.white)
            .padding(Theme.Space.m)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .frame(height: 210)
        .clipped()
        .animation(reduceMotion ? nil : .snappy(duration: 0.3), value: model.weather)
        .accessibilityElement(children: .contain)
        .accessibilityLabel(heroAccessibilityLabel)
    }

    private var heroAccessibilityLabel: String {
        guard let weather = model.weather else {
            return "\(model.selectedWeatherLocation.displayName) weather unavailable"
        }
        return "\(model.selectedWeatherLocation.displayName), \(weather.temperatureText), "
            + "\(weather.condition.title), \(weather.apparentTemperatureText), "
            + "\(weather.rangeText), \(weather.precipitationText). Currently \(phase.accessibilityDescription)."
    }

    // MARK: - Forecast

    @ViewBuilder
    private func body(for weather: WeatherSnapshot?) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Theme.Space.m) {
                if let weather {
                    // Above the forecast: on a bad-air day this is the thing
                    // people opened the panel for.
                    if let airQuality = weather.airQuality {
                        AirQualityPanel(airQuality: airQuality)
                    }

                    if let tomorrow = weather.tomorrow {
                        VStack(alignment: .leading, spacing: Theme.Space.xs) {
                            Text(L10n.tomorrow)
                                .font(.caption.weight(.semibold))
                                .foregroundStyle(.secondary)
                            ForecastRow(forecast: tomorrow, showsWeekday: false)
                        }
                        .cardSection()
                    }

                    if weather.daily.count > 1 {
                        VStack(alignment: .leading, spacing: Theme.Space.xs) {
                            Text("Next \(weather.daily.count) days")
                                .font(.caption.weight(.semibold))
                                .foregroundStyle(.secondary)
                            ForEach(weather.daily) { day in
                                ForecastRow(forecast: day, showsWeekday: true)
                            }
                        }
                        .cardSection()
                    }

                    HStack(spacing: Theme.Space.xs) {
                        Text(AppModel.freshnessText(for: weather.observedAt))
                        Text("·")
                        Text("Open-Meteo")
                    }
                    .font(.caption2)
                    .foregroundStyle(.tertiary)
                } else {
                    Label(
                        "No cached reading yet. Sajilo keeps the last successful one and shows it offline.",
                        systemImage: "wifi.slash"
                    )
                    .font(.callout)
                    .foregroundStyle(.secondary)
                    .cardSection()
                }

                Spacer(minLength: 0)
            }
            .padding(Theme.Space.m)
        }
        .softScroll()
    }
}

private struct ForecastRow: View {
    let forecast: DailyForecast
    let showsWeekday: Bool

    var body: some View {
        HStack(spacing: Theme.Space.s) {
            if showsWeekday {
                Text(Self.weekdayFormatter.string(from: forecast.date))
                    .font(.callout)
                    .frame(width: 42, alignment: .leading)
            }

            Image(systemName: forecast.condition.symbolName)
                .font(.callout)
                .foregroundStyle(.secondary)
                .frame(width: 22)

            Text(forecast.condition.title)
                .font(.caption)
                .foregroundStyle(.secondary)
                .lineLimit(1)

            Spacer(minLength: Theme.Space.xs)

            if forecast.precipitationChance > 0 {
                Label("\(forecast.precipitationChance)%", systemImage: "drop.fill")
                    .font(.caption2)
                    .foregroundStyle(.blue)
                    .labelStyle(.titleAndIcon)
                    .imageScale(.small)
            }

            Text("\(forecast.highText) / \(forecast.lowText)")
                .font(.callout.weight(.medium))
                .monospacedDigit()
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel(accessibilityLabel)
    }

    private var accessibilityLabel: String {
        let day = Self.weekdayFormatter.string(from: forecast.date)
        return "\(day): \(forecast.condition.title), high \(forecast.highText), low \(forecast.lowText), "
            + "\(forecast.precipitationChance)% chance of rain"
    }

    private static let weekdayFormatter = NepalTime.displayFormatter("EEE")
}

/// An icon button legible on top of the sky gradient, where the standard
/// secondary foreground would disappear.
private struct GlassIconButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        GlassIconBody(configuration: configuration)
    }

    private struct GlassIconBody: View {
        let configuration: Configuration
        @State private var isHovering = false

        var body: some View {
            configuration.label
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(.white)
                .frame(width: 26, height: 26)
                .background(
                    .white.opacity(isHovering ? 0.28 : 0.16),
                    in: .rect(cornerRadius: Theme.Radius.day)
                )
                .opacity(configuration.isPressed ? 0.6 : 1)
                .onHover { isHovering = $0 }
                .animation(.easeOut(duration: 0.12), value: isHovering)
        }
    }
}

#if DEBUG
private func previewSnapshot(
    condition: WeatherCondition,
    sunriseHour: Int = 5,
    sunsetHour: Int = 18
) -> WeatherSnapshot {
    let day = Calendar.nepal.date(from: DateComponents(year: 2026, month: 8, day: 16))!
    return WeatherSnapshot(
        location: .kathmandu,
        temperatureCelsius: 20.9,
        apparentTemperatureCelsius: 24.8,
        precipitationChance: 62,
        highCelsius: 26.3,
        lowCelsius: 20.6,
        condition: condition,
        sunrise: Calendar.nepal.date(bySettingHour: sunriseHour, minute: 34, second: 0, of: day),
        sunset: Calendar.nepal.date(bySettingHour: sunsetHour, minute: 41, second: 0, of: day),
        daily: (0..<5).map { offset in
            DailyForecast(
                date: Calendar.nepal.date(byAdding: .day, value: offset, to: day)!,
                highCelsius: 26 + Double(offset),
                lowCelsius: 20 + Double(offset) / 2,
                condition: condition,
                precipitationChance: 100 - offset * 12
            )
        },
        observedAt: .now,
        fetchedAt: .now
    )
}

#Preview("Weather — showers") {
    WeatherDetailView(model: .previewWeather(previewSnapshot(condition: .showers)), isActive: true, onBack: {})
        .frame(width: Theme.Metric.popoverWidth, height: 600)
        .background(.regularMaterial)
}

#Preview("Weather — clear") {
    WeatherDetailView(model: .previewWeather(previewSnapshot(condition: .clear)), isActive: true, onBack: {})
        .frame(width: Theme.Metric.popoverWidth, height: 600)
        .background(.regularMaterial)
}

#Preview("Weather — snow") {
    WeatherDetailView(model: .previewWeather(previewSnapshot(condition: .snow)), isActive: true, onBack: {})
        .frame(width: Theme.Metric.popoverWidth, height: 600)
        .background(.regularMaterial)
}

#Preview("Weather — unavailable") {
    WeatherDetailView(model: .preview(), isActive: true, onBack: {})
        .frame(width: Theme.Metric.popoverWidth, height: 600)
        .background(.regularMaterial)
}
#endif
