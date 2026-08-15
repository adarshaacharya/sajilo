import SwiftUI

struct SettingsView: View {
    @Bindable var model: AppModel

    var body: some View {
        TabView {
            Form {
                Section("Menu bar") {
                    // Each option renders against today's date, so the picker
                    // previews exactly what appears in the menu bar.
                    Picker("Display", selection: $model.selectedMenuBarFormat) {
                        ForEach(AppModel.MenuBarFormat.allCases) { format in
                            Text(verbatim: format.title(for: model.today)).tag(format)
                        }
                    }
                }

                Section("Modules") {
                    Toggle("Weather", isOn: $model.isWeatherEnabled)
                    Toggle("Forex", isOn: $model.isForexEnabled)
                }
            }
            .formStyle(.grouped)
            .tabItem { Label("General", systemImage: "gearshape") }

            Form {
                Section("Location") {
                    LabeledContent("Weather") {
                        Text("Kathmandu")
                            .foregroundStyle(.secondary)
                    }
                }

                Section("Data") {
                    LabeledContent("Calendar range") {
                        Text(verbatim: "BS \(BikramSambatCalendar.supportedNepaliYears.lowerBound)–\(BikramSambatCalendar.supportedNepaliYears.upperBound)")
                            .foregroundStyle(.secondary)
                    }
                    Text("Calendar conversion is bundled and works offline. Weather and forex cards show prototype values until their cached providers are added.")
                        .font(.callout)
                        .foregroundStyle(.secondary)
                }
            }
            .formStyle(.grouped)
            .tabItem { Label("Data", systemImage: "externaldrive") }
        }
        .padding()
    }
}
