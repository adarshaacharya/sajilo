import AppKit
import SwiftUI

@main
struct SajiloApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
    @State private var appModel = AppModel.prototype
    private let appUpdater = AppUpdater()

    var body: some Scene {
        // The label closure — rather than the `String` title initializer —
        // is what lets the menu bar track the observed date and format.
        MenuBarExtra {
            DashboardView(model: appModel)
                .environment(\.locale, appModel.appLanguage.locale)
                .environment(\.appUpdater, appUpdater)
        } label: {
            // A local build and an installed one look identical in the menu
            // bar, and both run at once during development — two Nepali dates
            // side by side. The marker belongs here rather than in the model:
            // `menuBarTitle` describes the date, not which build is drawing it.
            #if DEBUG
            Text(verbatim: "\u{2022} " + appModel.menuBarTitle)
            #else
            Text(verbatim: appModel.menuBarTitle)
            #endif
        }
        .menuBarExtraStyle(.window)

        #if DEBUG
        // A menu-bar popover cannot be opened by a preview canvas, and a
        // SwiftPM-only checkout has no Xcode previews at all. This window
        // renders the same dashboard so the layout can be iterated on
        // directly. Release builds stay menu-bar-only.
        Window("Sajilo Preview", id: "dashboard-preview") {
            DashboardView(model: appModel)
                .environment(\.locale, appModel.appLanguage.locale)
                .environment(\.appUpdater, appUpdater)
        }
        .windowResizability(.contentSize)
        #endif
    }
}

private final class AppDelegate: NSObject, NSApplicationDelegate {
    func applicationDidFinishLaunching(_ notification: Notification) {
        // Menu-bar-only unless the user asked for a Dock icon (PRD §4.1).
        // `.accessory` also keeps AppKit from trying to restore a document
        // window this app does not have. Debug builds stay regular so the
        // preview window can come to the front.
        #if DEBUG
        NSApp.setActivationPolicy(.regular)
        #else
        AppModel.prototype.applyActivationPolicy()
        #endif
    }
}
