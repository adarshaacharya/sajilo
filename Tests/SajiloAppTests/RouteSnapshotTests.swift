import AppKit
import SwiftUI
import Testing
@testable import SajiloApp

/// Renders a route to a PNG so it can be looked at without launching the app.
///
/// Off unless `SAJILO_RENDER=1`, so `swift test` stays fast and writes nothing:
///
///     SAJILO_RENDER=1 SAJILO_RENDER_OUT=/tmp swift test --filter RouteSnapshot
///
/// `ImageRenderer` does not draw scrolled content, which is why the route bodies
/// are factored out of their `ScrollView`. It also cannot draw `Link` or
/// `.buttonStyle(.link)` — those come out as yellow placeholders and are fine in
/// the running app.
@MainActor
@Suite(.enabled(if: ProcessInfo.processInfo.environment["SAJILO_RENDER"] == "1"))
struct RouteSnapshotTests {
    @Test(arguments: SettingsView.Tab.allCases)
    func settings(tab: SettingsView.Tab) throws {
        let model = AppModel(
            defaults: UserDefaults(suiteName: "com.sajilo.render.\(UUID().uuidString)")!,
            autoLoadWeather: false
        )
        try shoot(
            SettingsContent(
                model: model,
                tab: .constant(tab),
                appUpdater: nil,
                backupDocument: .constant(nil),
                isExportingBackup: .constant(false),
                isImportingBackup: .constant(false),
                backupMessage: .constant(nil)
            ),
            named: "settings-\(tab.rawValue)"
        )
    }

    @Test func rashifal() async throws {
        let model = AppModel(
            defaults: UserDefaults(suiteName: "com.sajilo.render.\(UUID().uuidString)")!,
            rashifalProvider: RenderStub(),
            autoLoadWeather: false
        )
        await model.refreshRashifalIfStale()
        model.selectedRashi = .vrish
        try shoot(RashifalContent(model: model, viewing: .constant(nil)), named: "rashifal")
    }

    private func shoot(_ view: some View, named name: String) throws {
        let wrapped = view
            .padding(Theme.Space.m)
            .frame(width: Theme.Metric.popoverWidth)
            .background(Color(nsColor: .windowBackgroundColor))

        let renderer = ImageRenderer(content: wrapped)
        renderer.scale = 2
        let image = try #require(renderer.nsImage)
        let tiff = try #require(image.tiffRepresentation)
        let rep = try #require(NSBitmapImageRep(data: tiff))
        let png = try #require(rep.representation(using: .png, properties: [:]))
        let directory = ProcessInfo.processInfo.environment["SAJILO_RENDER_OUT"] ?? NSTemporaryDirectory()
        try png.write(to: URL(fileURLWithPath: "\(directory)/\(name).png"))
    }
}

private struct RenderStub: RashifalProviding {
    func todaysRashifal() async throws -> RashifalSnapshot {
        RashifalSnapshot(
            readings: RashiSign.allCases.map {
                Rashifal(sign: $0, prediction: "आकस्मिक धनलाभका योग छन्। व्यापार व्यवसायमा आफन्तको विश्वास गर्नाले नुकसान हुनसक्छ। स्वास्थ्यको लागि पौष्टिक आहारको सेवन गर्नुहोस्।")
            },
            publishedOn: NepaliDate(year: 2083, month: 4, day: 31),
            fetchedAt: .now
        )
    }
}
