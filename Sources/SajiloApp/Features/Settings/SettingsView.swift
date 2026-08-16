import SwiftUI

/// Settings as a route inside the popover rather than a separate window.
///
/// PRD §4.3 asks for a standard macOS Settings window; this deliberately
/// departs from that. The whole surface is four short sections, and a separate
/// window meant leaving the popover to change something you were looking at in
/// it. Everything here is a preference, not a workflow, so nothing is deep
/// enough to need a window of its own.
struct SettingsView: View {
    @Environment(\.appUpdater) private var appUpdater
    @Bindable var model: AppModel
    let onBack: () -> Void

    var body: some View {
        VStack(spacing: 0) {
            header

            ScrollView {
                VStack(alignment: .leading, spacing: Theme.Space.m) {
                    SettingsSection(L10n.language) {
                        Picker(L10n.language, selection: $model.appLanguage) {
                            ForEach(AppLanguage.allCases) { language in
                                Text(language.title).tag(language)
                            }
                        }
                    }

                    SettingsSection(L10n.general) {
                        Toggle(
                            L10n.launchAtLogin,
                            isOn: Binding(
                                get: { model.launchAtLogin.isEnabled },
                                set: { model.setLaunchAtLogin($0) }
                            )
                        )
                        .disabled(model.launchAtLogin == .unavailable)

                        if let error = model.launchAtLoginError {
                            Text(verbatim: error)
                                .font(.caption2)
                                .foregroundStyle(.secondary)
                                .fixedSize(horizontal: false, vertical: true)
                        } else if let note = launchAtLoginNote {
                            Text(note)
                                .font(.caption2)
                                .foregroundStyle(.secondary)
                                .fixedSize(horizontal: false, vertical: true)
                        }

                        Toggle(L10n.showDockIcon, isOn: $model.showsDockIcon)
                    }

                    SettingsSection(L10n.updates) {
                        Button(L10n.checkForUpdates) {
                            appUpdater?.checkForUpdates()
                        }
                        .disabled(appUpdater == nil)
                    }

                    SettingsSection(L10n.numerals) {
                        Picker(L10n.numerals, selection: $model.numeralStyle) {
                            ForEach(NumeralStyle.allCases) { style in
                                // Each option shows itself, so the difference
                                // between ३१ and 31 is visible before choosing.
                                Text(verbatim: "\(String(localized: style.displayName)) · \(style.sample)")
                                    .tag(style)
                            }
                        }
                    }

                    SettingsSection(L10n.menuBar) {
                        // Each option renders against today's date, so the
                        // picker previews exactly what appears in the menu bar.
                        Picker(L10n.display, selection: $model.selectedMenuBarFormat) {
                            ForEach(AppModel.MenuBarFormat.allCases) { format in
                                Text(verbatim: format.title(for: model.today)).tag(format)
                            }
                        }
                    }

                    SettingsSection(L10n.modules) {
                        Toggle(L10n.weather, isOn: $model.isWeatherEnabled)
                        Toggle(L10n.forex, isOn: $model.isForexEnabled)
                        Toggle(L10n.news, isOn: $model.isNewsEnabled)
                        Toggle(L10n.settingsBazar, isOn: $model.isBazarEnabled)
                    }

                    SettingsSection(L10n.weatherLocation) {
                        Picker(L10n.city, selection: $model.selectedWeatherLocation) {
                            ForEach(WeatherLocation.allCases) { location in
                                Text(verbatim: "\(location.displayName) · \(location.nepaliName)")
                                    .tag(location)
                            }
                        }
                    }

                    SettingsSection(L10n.reminders) {
                        Toggle(
                            L10n.holidayTomorrow,
                            isOn: Binding(
                                get: { model.notificationOptions.eveOfPublicHoliday },
                                set: { model.notificationOptions.eveOfPublicHoliday = $0 }
                            )
                        )
                        Toggle(
                            L10n.festivalTomorrow,
                            isOn: Binding(
                                get: { model.notificationOptions.eveOfFestival },
                                set: { model.notificationOptions.eveOfFestival = $0 }
                            )
                        )

                        if let note = notificationNote {
                            Text(note)
                                .font(.caption2)
                                .foregroundStyle(.secondary)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                    }

                    SettingsSection(L10n.forexFavourites) {
                        ForEach(ForexCurrency.selectable, id: \.self) { code in
                            Toggle(
                                "\(code) · \(ForexCurrency.name(for: code))",
                                isOn: binding(for: code)
                            )
                        }
                    }

                    SettingsSection(L10n.data) {
                        SettingsRow(
                            L10n.calendarRange,
                            value: "BS \(BikramSambatCalendar.supportedNepaliYears.lowerBound)–\(BikramSambatCalendar.supportedNepaliYears.upperBound)"
                        )
                        SettingsRow(
                            L10n.festivalsRange,
                            value: "BS \(CalendarEventStore.supportedYears.lowerBound)–\(CalendarEventStore.supportedYears.upperBound)"
                        )
                        SettingsRow(L10n.weatherSource, value: "Open-Meteo")
                        SettingsRow(L10n.ratesSource, value: "Nepal Rastra Bank")
                        SettingsRow(L10n.festivalSource, value: "nepalicalendar.rat32.com")
                        SettingsRow(L10n.bazarSource, value: "FENEGOSIDA · Nepal Oil Corporation")
                    }
                }
                .padding(Theme.Space.m)
            }
            .softScroll()
        }
        // Reads the current permission; it never prompts, so opening Settings
        // cannot trigger a system dialog.
        .task { await model.refreshNotificationAuthorization() }
    }

    /// A reminder switched on but denied at the system level would otherwise
    /// look enabled and never fire.
    private var notificationNote: LocalizedStringResource? {
        guard model.notificationOptions.isAnyEnabled else {
            return L10n.reminderOffNote
        }
        switch model.notificationAuthorization {
        case .denied:
            return L10n.reminderDeniedNote
        case .notDetermined:
            return L10n.reminderPermissionNote
        case .authorized:
            return L10n.reminderEnabledNote
        }
    }

    /// Explains the states a plain on/off toggle cannot: macOS may hold the
    /// registration pending approval, or refuse it outright for an app running
    /// outside /Applications.
    private var launchAtLoginNote: LocalizedStringResource? {
        switch model.launchAtLogin {
        case .requiresApproval:
            return L10n.launchApprovalNote
        case .unavailable:
            return L10n.launchUnavailableNote
        case .enabled, .disabled:
            return nil
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
            Button(L10n.back, systemImage: "chevron.left", action: onBack)
                .labelStyle(.iconOnly)
                .buttonStyle(IconButtonStyle())
                .accessibilityLabel(L10n.backToDashboard)

            Text(L10n.settings)
                .font(.headline)

            Spacer(minLength: 0)
        }
        .routeHeader()
    }
}

/// A titled group of controls in the popover's card language, rather than
/// `Form`, whose grouped style is built for a full-width settings window.
private struct SettingsSection<Content: View>: View {
    let title: LocalizedStringResource
    @ViewBuilder let content: Content

    init(_ title: LocalizedStringResource, @ViewBuilder content: () -> Content) {
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
    let label: LocalizedStringResource
    let value: String

    init(_ label: LocalizedStringResource, value: String) {
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
        .accessibilityLabel("\(String(localized: label)): \(value)")
    }
}

#if DEBUG
#Preview("Settings") {
    SettingsView(model: .preview(), onBack: {})
        .frame(width: Theme.Metric.popoverWidth, height: 600)
        .background(.regularMaterial)
}
#endif
