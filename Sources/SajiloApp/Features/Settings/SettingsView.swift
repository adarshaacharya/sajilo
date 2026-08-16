import SwiftUI

/// Settings as a route inside the popover rather than a separate window.
///
/// PRD §4.3 asks for a standard macOS Settings window; this deliberately
/// departs from that. Everything here is a preference rather than a workflow,
/// and a separate window meant leaving the popover to change something you were
/// looking at in it.
///
/// The screen is split three ways because it had grown to ten equal-weight
/// cards in no particular order — language near the top, numerals five cards
/// below it, and each module's own settings stranded in separate sections
/// further down again. Now a module's settings live *inside* that module's row
/// and appear only when it is switched on, which removes two whole sections and
/// makes the relationship obvious instead of implied.
struct SettingsView: View {
    @Environment(\.appUpdater) private var appUpdater
    @Bindable var model: AppModel
    let onBack: () -> Void

    @State private var tab: Tab = .display
    @State private var backupDocument: SajiloBackupDocument?
    @State private var isExportingBackup = false
    @State private var isImportingBackup = false
    @State private var backupMessage: String?
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    enum Tab: String, CaseIterable, Identifiable {
        case display, modules, system
        var id: String { rawValue }

        var title: LocalizedStringResource {
            switch self {
            case .display: L10n.settingsTabDisplay
            case .modules: L10n.settingsTabModules
            case .system: L10n.settingsTabSystem
            }
        }
    }

    var body: some View {
        VStack(spacing: 0) {
            header

            ScrollView {
                SettingsContent(
                    model: model,
                    tab: $tab,
                    appUpdater: appUpdater,
                    backupDocument: $backupDocument,
                    isExportingBackup: $isExportingBackup,
                    isImportingBackup: $isImportingBackup,
                    backupMessage: $backupMessage
                )
                .padding(Theme.Space.m)
            }
            .softScroll()
        }
        .animation(reduceMotion ? nil : .snappy(duration: 0.22), value: tab)
        // Reads the current permission; it never prompts, so opening Settings
        // cannot trigger a system dialog.
        .task { await model.refreshNotificationAuthorization() }
        .modifier(BackupFileHandling(
            model: model,
            document: $backupDocument,
            isExporting: $isExportingBackup,
            isImporting: $isImportingBackup,
            message: $backupMessage
        ))
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

/// The scrollable body, outside the `ScrollView` so it can be rendered on its
/// own. `ImageRenderer` does not draw scrolled content, and a settings screen
/// this size is worth being able to look at without a running app.
struct SettingsContent: View {
    @Bindable var model: AppModel
    @Binding var tab: SettingsView.Tab
    let appUpdater: AppUpdater?
    @Binding var backupDocument: SajiloBackupDocument?
    @Binding var isExportingBackup: Bool
    @Binding var isImportingBackup: Bool
    @Binding var backupMessage: String?

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Space.m) {
            Picker(L10n.settings, selection: $tab) {
                ForEach(SettingsView.Tab.allCases) { Text($0.title).tag($0) }
            }
            .pickerStyle(.segmented)
            .labelsHidden()

            switch tab {
            case .display: displayTab
            case .modules: modulesTab
            case .system: systemTab
            }

            Spacer(minLength: 0)
        }
    }

    // MARK: - Display

    private var displayTab: some View {
        VStack(alignment: .leading, spacing: Theme.Space.m) {
            // Language and numerals are one decision in two parts — which words
            // and which digits — so they sit together rather than five cards
            // apart as they used to.
            SettingsSection(L10n.settingsAppearance) {
                Picker(L10n.language, selection: $model.appLanguage) {
                    ForEach(AppLanguage.allCases) { Text($0.title).tag($0) }
                }
                Picker(L10n.numerals, selection: $model.numeralStyle) {
                    ForEach(NumeralStyle.allCases) { style in
                        // Each option shows itself, so the difference between
                        // ३१ and 31 is visible before choosing.
                        Text(verbatim: "\(String(localized: style.displayName)) · \(style.sample)")
                            .tag(style)
                    }
                }
            }

            SettingsSection(L10n.menuBar) {
                // Each option renders against today's date, so the picker
                // previews exactly what appears in the menu bar.
                Picker(L10n.settingsFormat, selection: $model.selectedMenuBarFormat) {
                    ForEach(AppModel.MenuBarFormat.allCases) { format in
                        if format == .custom {
                            Text(L10n.menuBarCustom).tag(format)
                        } else {
                            Text(verbatim: model.menuBarTitle(for: format)).tag(format)
                        }
                    }
                }

                if model.selectedMenuBarFormat == .custom {
                    Toggle(L10n.menuBarShowFlag, isOn: $model.customMenuBarShowsFlag)
                    Toggle(L10n.menuBarShowYear, isOn: $model.customMenuBarShowsYear)
                }
            }
        }
    }

    // MARK: - Modules

    /// Each module is one row that owns its own settings.
    ///
    /// The city picker only matters when weather is on, and the currency list
    /// only when rates are — so both appear under their own switch rather than
    /// as separate top-level sections a reader has to connect for themselves.
    private var modulesTab: some View {
        VStack(alignment: .leading, spacing: Theme.Space.xs) {
            ModuleRow(
                title: L10n.weather,
                note: L10n.moduleWeatherNote,
                symbol: "cloud.sun",
                isOn: $model.isWeatherEnabled
            ) {
                Picker(L10n.city, selection: $model.selectedWeatherLocation) {
                    ForEach(WeatherLocation.allCases) { location in
                        Text(verbatim: "\(location.displayName) · \(location.nepaliName)")
                            .tag(location)
                    }
                }
                .labelsHidden()
            }

            ModuleRow(
                title: L10n.forex,
                note: L10n.moduleForexNote,
                symbol: "banknote",
                isOn: $model.isForexEnabled
            ) {
                CurrencyPicker(
                    selected: model.forexFavourites,
                    toggle: { model.forexFavourites = Self.toggling($0, in: model.forexFavourites) }
                )
            }

            ModuleRow(title: L10n.news, note: L10n.moduleNewsNote, symbol: "newspaper", isOn: $model.isNewsEnabled)
            ModuleRow(title: L10n.settingsBazar, note: L10n.moduleBazarNote, symbol: "storefront", isOn: $model.isBazarEnabled)
            ModuleRow(title: L10n.settingsRashifal, note: L10n.moduleRashifalNote, symbol: "sparkles", isOn: $model.isRashifalEnabled)
            ModuleRow(title: L10n.settingsRadio, note: L10n.moduleRadioNote, symbol: "dot.radiowaves.left.and.right", isOn: $model.isRadioEnabled)

            if !model.isAnyModuleEnabled {
                Text(L10n.settingsNothingEnabled)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.top, Theme.Space.xs)
            }
        }
    }

    /// Order is the user's, not the catalogue's: the first favourite is what the
    /// dashboard card shows, so a newly picked currency appends rather than
    /// slotting in alphabetically.
    private static func toggling(_ code: String, in favourites: [String]) -> [String] {
        var updated = favourites
        if let index = updated.firstIndex(of: code) {
            updated.remove(at: index)
        } else {
            updated.append(code)
        }
        return updated
    }

    // MARK: - System

    private var systemTab: some View {
        VStack(alignment: .leading, spacing: Theme.Space.m) {
            SettingsSection(L10n.settingsStartup, footnote: launchNote) {
                Toggle(
                    L10n.launchAtLogin,
                    isOn: Binding(
                        get: { model.launchAtLogin.isEnabled },
                        set: { model.setLaunchAtLogin($0) }
                    )
                )
                Toggle(L10n.showDockIcon, isOn: $model.showsDockIcon)
            }

            SettingsSection(L10n.reminders, footnote: notificationNote) {
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
            }

            SettingsSection(L10n.backup, footnote: L10n.backupNote) {
                HStack(spacing: Theme.Space.s) {
                    Button(L10n.exportData, systemImage: "square.and.arrow.up") {
                        do {
                            backupDocument = SajiloBackupDocument(data: try model.exportBackup())
                            isExportingBackup = true
                        } catch {
                            backupMessage = error.localizedDescription
                        }
                    }
                    Button(L10n.importData, systemImage: "square.and.arrow.down") {
                        isImportingBackup = true
                    }
                    Spacer(minLength: 0)
                }
            }

            SettingsSection(L10n.updates) {
                HStack(spacing: Theme.Space.s) {
                    Button(L10n.checkForUpdates) { appUpdater?.checkForUpdates() }
                        .disabled(appUpdater == nil)
                    Spacer(minLength: 0)
                    Text(verbatim: model.appVersionText)
                        .font(.caption2)
                        .foregroundStyle(.tertiary)
                }
            }
        }
    }

    /// A reminder switched on but denied at the system level would otherwise
    /// look enabled and never fire.
    private var notificationNote: LocalizedStringResource? {
        guard model.notificationOptions.isAnyEnabled else { return L10n.reminderOffNote }
        switch model.notificationAuthorization {
        case .denied: return L10n.reminderDeniedNote
        case .notDetermined: return L10n.reminderPermissionNote
        case .authorized: return L10n.reminderEnabledNote
        }
    }

    /// Explains the states a plain on/off toggle cannot: macOS may hold the
    /// registration pending approval, or fail to find a previous one. A
    /// `.notFound` status is not enough to disable the control — a
    /// freshly-installed app can still register successfully when switched on.
    private var launchNote: LocalizedStringResource? {
        if model.launchAtLoginError != nil { return nil }
        switch model.launchAtLogin {
        case .requiresApproval: return L10n.launchApprovalNote
        case .unavailable: return L10n.launchUnavailableNote
        case .enabled, .disabled: return nil
        }
    }

}

// MARK: - Pieces

/// A titled group of controls in the popover's card language, rather than
/// `Form`, whose grouped style is built for a full-width settings window.
private struct SettingsSection<Content: View>: View {
    let title: LocalizedStringResource
    let footnote: LocalizedStringResource?
    @ViewBuilder let content: Content

    init(
        _ title: LocalizedStringResource,
        footnote: LocalizedStringResource? = nil,
        @ViewBuilder content: () -> Content
    ) {
        self.title = title
        self.footnote = footnote
        self.content = content()
    }

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Space.xs) {
            Text(title)
                .font(.caption.weight(.semibold))
                .foregroundStyle(.secondary)

            VStack(alignment: .leading, spacing: Theme.Space.s) {
                content

                // Inside the card rather than under it: the note explains the
                // controls above, and floating it outside read as unrelated.
                if let footnote {
                    Text(footnote)
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            .cardSection()
        }
    }
}

/// One module: what it is, what it does, and its own settings underneath.
private struct ModuleRow<Detail: View>: View {
    let title: LocalizedStringResource
    let note: LocalizedStringResource
    let symbol: String
    @Binding var isOn: Bool
    @ViewBuilder var detail: Detail

    init(
        title: LocalizedStringResource,
        note: LocalizedStringResource,
        symbol: String,
        isOn: Binding<Bool>,
        @ViewBuilder detail: () -> Detail = { EmptyView() }
    ) {
        self.title = title
        self.note = note
        self.symbol = symbol
        self._isOn = isOn
        self.detail = detail()
    }

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Space.s) {
            HStack(alignment: .top, spacing: Theme.Space.s) {
                Image(systemName: symbol)
                    .font(.callout)
                    .foregroundStyle(isOn ? AnyShapeStyle(Theme.Palette.brand) : AnyShapeStyle(.tertiary))
                    .frame(width: 20)

                VStack(alignment: .leading, spacing: 1) {
                    Text(title)
                        .font(.callout.weight(.medium))
                    Text(note)
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }

                Spacer(minLength: Theme.Space.s)

                Toggle("", isOn: $isOn)
                    .labelsHidden()
                    .toggleStyle(.switch)
                    .controlSize(.mini)
                    .accessibilityLabel(title)
            }

            // Revealed only when the module is on, because that is the only
            // time it can affect anything.
            if isOn, !(detail is EmptyView) {
                detail.padding(.leading, 20 + Theme.Space.s)
            }
        }
        .cardSection(padding: Theme.Space.s)
    }
}

/// Twelve currencies as chips rather than twelve switches.
///
/// A stack of toggles for a list this long is a wall; chips fit four to a row,
/// show the whole set at once, and read as a set of picks rather than twelve
/// unrelated decisions.
private struct CurrencyPicker: View {
    let selected: [String]
    let toggle: (String) -> Void

    private let columns = Array(
        repeating: GridItem(.flexible(), spacing: Theme.Space.xxs),
        count: 4
    )

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Space.xs) {
            Text(L10n.settingsCurrencies)
                .font(.caption2.weight(.medium))
                .foregroundStyle(.secondary)

            LazyVGrid(columns: columns, spacing: Theme.Space.xxs) {
                ForEach(ForexCurrency.selectable, id: \.self) { code in
                    let isOn = selected.contains(code)
                    Button { toggle(code) } label: {
                        Text(verbatim: code)
                            .font(.caption.weight(.medium))
                            .monospacedDigit()
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, Theme.Space.xxs)
                            .foregroundStyle(isOn ? AnyShapeStyle(Theme.Palette.onBrandFill) : AnyShapeStyle(.secondary))
                            .background(
                                isOn ? AnyShapeStyle(Theme.Palette.brandFill) : AnyShapeStyle(Theme.Palette.surface),
                                in: .rect(cornerRadius: Theme.Radius.day)
                            )
                    }
                    .buttonStyle(.plain)
                    .help(Text(verbatim: ForexCurrency.name(for: code)))
                    .accessibilityLabel(ForexCurrency.name(for: code))
                    .accessibilityAddTraits(isOn ? [.isSelected] : [])
                }
            }

            Text(L10n.settingsCurrenciesHint)
                .font(.caption2)
                .foregroundStyle(.tertiary)
                .fixedSize(horizontal: false, vertical: true)
        }
    }
}

/// The export and import plumbing, lifted out so the screen's body stays a
/// description of the layout rather than half file-dialog wiring.
private struct BackupFileHandling: ViewModifier {
    let model: AppModel
    @Binding var document: SajiloBackupDocument?
    @Binding var isExporting: Bool
    @Binding var isImporting: Bool
    @Binding var message: String?

    func body(content: Content) -> some View {
        content
            .fileExporter(
                isPresented: $isExporting,
                document: document,
                contentType: .json,
                defaultFilename: "Sajilo-backup"
            ) { result in
                if case let .failure(error) = result {
                    message = error.localizedDescription
                }
            }
            .fileImporter(
                isPresented: $isImporting,
                allowedContentTypes: [.json],
                allowsMultipleSelection: false
            ) { result in
                do {
                    let url = try result.get().first ?? { throw CocoaError(.fileReadNoSuchFile) }()
                    guard url.startAccessingSecurityScopedResource() else {
                        throw CocoaError(.fileReadNoPermission)
                    }
                    defer { url.stopAccessingSecurityScopedResource() }
                    try model.importBackup(Data(contentsOf: url))
                    message = String(localized: L10n.backupImported)
                } catch {
                    message = error.localizedDescription
                }
            }
            .alert(L10n.backup, isPresented: Binding(
                get: { message != nil },
                set: { if !$0 { message = nil } }
            )) {
                Button(L10n.ok) { message = nil }
            } message: {
                Text(verbatim: message ?? "")
            }
    }
}

#if DEBUG
#Preview("Settings") {
    SettingsView(model: .preview(), onBack: {})
        .frame(width: Theme.Metric.popoverWidth, height: 600)
        .background(.regularMaterial)
}
#endif
