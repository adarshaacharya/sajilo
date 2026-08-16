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
    @Test func reading() async throws { try await shot(pickSign: true, suffix: "reading") }
    @Test func finder() async throws { try await shot(pickSign: false, suffix: "finder") }

    private func shot(pickSign: Bool, suffix: String) async throws {
        let model = AppModel(
            defaults: UserDefaults(suiteName: "com.sajilo.render.\(UUID().uuidString)")!,
            rashifalProvider: RenderStub(),
            autoLoadWeather: false
        )
        await model.refreshRashifalIfStale()
        if pickSign { model.selectedRashi = .vrish }

        let view = VStack(spacing: 0) {
            RashifalContent(model: model, viewing: .constant(nil))
                .padding(Theme.Space.m)
        }
        .frame(width: Theme.Metric.popoverWidth)
        .background(Color(nsColor: .windowBackgroundColor))

        let renderer = ImageRenderer(content: view)
        renderer.scale = 2
        let image = try #require(renderer.nsImage)
        let tiff = try #require(image.tiffRepresentation)
        let rep = try #require(NSBitmapImageRep(data: tiff))
        let png = try #require(rep.representation(using: .png, properties: [:]))
        let dir = ProcessInfo.processInfo.environment["SAJILO_RENDER_OUT"]!
        try png.write(to: URL(fileURLWithPath: "\(dir)/rashifal-\(suffix).png"))
    }
}

private struct RenderStub: RashifalProviding {
    func todaysRashifal() async throws -> RashifalSnapshot {
        RashifalSnapshot(
            readings: RashiSign.allCases.map {
                Rashifal(sign: $0, prediction: "आकस्मिक धनलाभका योग छन्। व्यापार व्यवसायमा आफन्तको विश्वास गर्नाले नुकसान हुनसक्छ। स्वास्थ्यको लागि पौष्टिक आहारको सेवन गर्नुहोस्। विद्यार्थीहरूको सामाजिक चेतनाको विकास हुनेछ। आजको शुभ रंग गुलाबी हो भने शुभ अंक ३ रहेको छ।")
            },
            publishedOn: NepaliDate(year: 2083, month: 4, day: 31),
            fetchedAt: .now
        )
    }
}
