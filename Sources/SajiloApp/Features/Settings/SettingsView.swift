import SwiftUI

/// Settings as a route inside the popover rather than a separate window.
///
/// PRD §4.3 asks for a standard macOS Settings window; this deliberately
/// departs from that. The whole surface is four short sections, and a separate
/// window meant leaving the popover to change something you were looking at in
/// it. Everything here is a preference, not a workflow, so nothing is deep
/// enough to need a window of its own.
struct SettingsView: View {
    @Bindable var model: AppModel
    let onBack: () -> Void

    var body: some View {
        VStack(spacing: 0) {
            header

            ScrollView {
                VStack(alignment: .leading, spacing: Theme.Space.m) {
                    SettingsSection("Menu bar") {
                        // Each option renders against today's date, so the
                        // picker previews exactly what appears in the menu bar.
                        Picker("Display", selection: $model.selectedMenuBarFormat) {
                            ForEach(AppModel.MenuBarFormat.allCases) { format in
                                Text(verbatim: format.title(for: model.today)).tag(format)
                            }
                        }
                    }

                    SettingsSection("Modules") {
                        Toggle("Weather", isOn: $model.isWeatherEnabled)
                        Toggle("Forex", isOn: $model.isForexEnabled)
                    }

                    SettingsSection("Weather location") {
                        Picker("City", selection: $model.selectedWeatherLocation) {
                            ForEach(WeatherLocation.allCases) { location in
                                Text(verbatim: "\(location.displayName) · \(location.nepaliName)")
                                    .tag(location)
                            }
                        }
                    }

                    SettingsSection("Forex favourites") {
                        ForEach(ForexCurrency.selectable, id: \.self) { code in
                            Toggle(
                                "\(code) · \(ForexCurrency.name(for: code))",
                                isOn: binding(for: code)
                            )
                        }
                    }

                    SettingsSection("Data") {
                        SettingsRow(
                            "Calendar",
                            value: "BS \(BikramSambatCalendar.supportedNepaliYears.lowerBound)–\(BikramSambatCalendar.supportedNepaliYears.upperBound)"
                        )
                        SettingsRow(
                            "Festivals",
                            value: "BS \(CalendarEventStore.supportedYears.lowerBound)–\(CalendarEventStore.supportedYears.upperBound)"
                        )
                        SettingsRow("Weather source", value: "Open-Meteo")
                        SettingsRow("Rates source", value: "Nepal Rastra Bank")
                        SettingsRow("Festival source", value: "nepalicalendar.rat32.com")
                    }

                    Text("Calendar conversion and festivals are bundled and work offline. Weather comes from Open-Meteo and is cached, so the last reading stays visible when the network is unavailable.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .padding(Theme.Space.m)
            }
        }
    }

    /// Keeps the user's chosen order rather than the catalogue's: the first
    /// favourite is what the dashboard card shows.
    private func binding(for code: String) -> Binding<Bool> {
        Binding(
            get: { model.forexFavourites.contains(code) },
            set: { isOn in
                var favourites = model.forexFavourites
                if isOn {
                    guard !favourites.contains(code) else { return }
                    favourites.append(code)
                } else {
                    favourites.removeAll { $0 == code }
                }
                model.forexFavourites = favourites
            }
        )
    }

    private var header: some View {
        HStack(spacing: Theme.Space.s) {
            Button("Back", systemImage: "chevron.left", action: onBack)
                .labelStyle(.iconOnly)
                .buttonStyle(IconButtonStyle())
                .accessibilityLabel("Back to dashboard")

            Text("Settings")
                .font(.headline)

            Spacer(minLength: 0)
        }
        .routeHeader()
    }
}

/// A titled group of controls in the popover's card language, rather than
/// `Form`, whose grouped style is built for a full-width settings window.
private struct SettingsSection<Content: View>: View {
    let title: String
    @ViewBuilder let content: Content

    init(_ title: String, @ViewBuilder content: () -> Content) {
        self.title = title
        self.content = content()
    }

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Space.xs) {
            Text(title)
                .font(.caption.weight(.semibold))
                .foregroundStyle(.secondary)

            VStack(alignment: .leading, spacing: Theme.Space.s) {
                content
            }
            .cardSection()
        }
    }
}

private struct SettingsRow: View {
    let label: String
    let value: String

    init(_ label: String, value: String) {
        self.label = label
        self.value = value
    }

    var body: some View {
        HStack(spacing: Theme.Space.s) {
            Text(label)
            Spacer(minLength: Theme.Space.s)
            Text(value)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.trailing)
        }
        .font(.callout)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(label): \(value)")
    }
}

#if DEBUG
#Preview("Settings") {
    SettingsView(model: .preview(), onBack: {})
        .frame(width: Theme.Metric.popoverWidth, height: 600)
        .background(.regularMaterial)
}
#endif
