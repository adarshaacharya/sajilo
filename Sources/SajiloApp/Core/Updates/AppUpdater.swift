import Sparkle
import SwiftUI
import Observation

/// Owns Sajilo's direct-distribution update lifecycle.
///
/// Sparkle reads its feed URL, public signing key, and scheduling policy from
/// the app bundle's Info.plist. Keeping the controller alive for the whole app
/// lifetime lets it perform scheduled checks and user-initiated checks. A
/// scheduled result is reflected in `isUpdateAvailable`, so Sajilo can offer a
/// quiet, direct update button instead of interrupting someone mid-task.
@MainActor
@Observable
final class AppUpdater: NSObject, SPUUpdaterDelegate {
    private let startingUpdater: Bool
    @ObservationIgnored private let presentationDelegate = ScheduledUpdatePresentationDelegate()
    @ObservationIgnored private lazy var controller = SPUStandardUpdaterController(
        startingUpdater: startingUpdater,
        updaterDelegate: self,
        userDriverDelegate: presentationDelegate
    )

    private(set) var isUpdateAvailable = false

    init(startingUpdater: Bool = true) {
        self.startingUpdater = startingUpdater
        super.init()
        _ = controller
    }

    /// A user-initiated check makes Sparkle bring its install prompt forward.
    func checkForUpdates() {
        controller.updater.checkForUpdates()
    }

    func updater(_ updater: SPUUpdater, didFindValidUpdate item: SUAppcastItem) {
        isUpdateAvailable = true
    }

    func updaterDidNotFindUpdate(_ updater: SPUUpdater) {
        isUpdateAvailable = false
    }

}

/// Sparkle does not mark this UI-delegate protocol as main-actor isolated.
/// Keeping it separate from `AppUpdater` avoids crossing actors while still
/// deferring scheduled update presentation to Sajilo's dashboard button.
private final class ScheduledUpdatePresentationDelegate: NSObject, SPUStandardUserDriverDelegate {
    func standardUserDriverShouldHandleShowingScheduledUpdate(
        _ update: SUAppcastItem,
        andInImmediateFocus immediateFocus: Bool
    ) -> Bool {
        false
    }
}

extension EnvironmentValues {
    /// Optional so isolated previews and tests do not start a network updater.
    @Entry var appUpdater: AppUpdater?
}
