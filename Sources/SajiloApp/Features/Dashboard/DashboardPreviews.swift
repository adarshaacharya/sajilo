import AppKit
import SwiftUI

#if DEBUG
private func previewDate(year: Int, month: Int, day: Int) -> Date {
    NepalTime.calendar.date(from: DateComponents(year: year, month: month, day: day))!
}

#Preview("Settings route") {
    let model = AppModel.preview(now: previewDate(year: 2026, month: 8, day: 15))
    return SettingsView(model: model, onBack: {})
        .frame(width: Theme.Metric.popoverWidth, height: 600)
        .background(.regularMaterial)
}

#Preview("Dashboard") {
    DashboardView(model: .preview(now: previewDate(year: 2026, month: 8, day: 15)))
}

/// The month calendar has to survive a six-row month without changing height;
/// Shrawan 2083 is the case that forced the fixed grid.
#Preview("Six-row month") {
    DashboardView(model: .preview(now: previewDate(year: 2026, month: 7, day: 17)))
}

/// Renders the provisional banner, which only appears past BS 2084.
#Preview("Provisional year") {
    let model = AppModel.preview(now: previewDate(year: 2026, month: 8, day: 15))
    model.moveMonth(by: 24)
    return DashboardView(model: model)
}

#Preview("Converter") {
    DateConverterView(onBack: {})
        .frame(width: Theme.Metric.popoverWidth)
        .background {
            Rectangle()
                .fill(.regularMaterial)
                .overlay(Theme.Palette.canvas)
        }
}

/// A day carrying a festival, tithi, and holiday flag from the bundled data.
#Preview("Day detail") {
    DayDetailView(date: NepaliDate(year: 2083, month: 4, day: 1), onBack: {})
        .frame(width: Theme.Metric.popoverWidth)
        .background {
            Rectangle()
                .fill(.regularMaterial)
                .overlay(Theme.Palette.canvas)
        }
}

/// A day the source grid truncated, so it has no event at all.
#Preview("Day detail — no event") {
    DayDetailView(date: NepaliDate(year: 2083, month: 4, day: 31), onBack: {})
        .frame(width: Theme.Metric.popoverWidth)
        .background {
            Rectangle()
                .fill(.regularMaterial)
                .overlay(Theme.Palette.canvas)
        }
}
#endif

#if DEBUG
// MARK: - Skin comparison
//
// One preview per skin so the three directions can be judged side by side
// rather than described. `Theme.skin` is set before the view is built.

@MainActor
private func skinnedDashboard(_ skin: Theme.Skin) -> some View {
    Theme.skin = skin
    return DashboardView(model: .preview(now: previewDate(year: 2026, month: 8, day: 15)))
}

#Preview("Skin — Himalayan Dusk") {
    skinnedDashboard(.himalayanDusk)
}

#Preview("Skin — Ink & Paper") {
    skinnedDashboard(.inkAndPaper)
}

#Preview("Skin — Mac Native") {
    skinnedDashboard(.macNative)
}
#endif
