import Sparkle
import SwiftUI

/// Owns Sajilo's direct-distribution update lifecycle.
///
/// Sparkle reads its feed URL, public signing key, and scheduling policy from
/// the app bundle's Info.plist. Keeping the controller alive for the whole app
/// lifetime lets it perform scheduled checks and user-initiated checks.
@MainActor
final class AppUpdater {
    private let controller: SPUStandardUpdaterController

    init(startingUpdater: Bool = true) {
        controller = SPUStandardUpdaterController(
            startingUpdater: startingUpdater,
            updaterDelegate: nil,
            userDriverDelegate: nil
        )
    }

    func checkForUpdates() {
        controller.updater.checkForUpdates()
    }
}

extension EnvironmentValues {
    /// Optional so isolated previews and tests do not start a network updater.
    @Entry var appUpdater: AppUpdater?
}
