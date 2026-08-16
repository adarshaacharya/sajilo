import Foundation
import Testing
@testable import SajiloApp

@MainActor
struct LaunchAtLoginTests {
    @Test func reflectsTheSystemStateRatherThanAStoredCopy() {
        let manager = StubLaunchAtLogin(state: .enabled)
        let model = makeModel(manager: manager)
        #expect(model.launchAtLogin == .enabled)

        // The user turns it off in System Settings, with no involvement from
        // Sajilo. A mirrored boolean would still claim it is on.
        manager.state = .disabled

        #expect(model.launchAtLogin == .disabled)
        #expect(model.launchAtLogin.isEnabled == false)
    }

    @Test func enablingRegistersWithTheSystem() {
        let manager = StubLaunchAtLogin(state: .disabled)
        let model = makeModel(manager: manager)

        model.setLaunchAtLogin(true)

        #expect(manager.state == .enabled)
        #expect(model.launchAtLogin.isEnabled)
        #expect(model.launchAtLoginError == nil)
    }

    @Test func disablingUnregisters() {
        let manager = StubLaunchAtLogin(state: .enabled)
        let model = makeModel(manager: manager)

        model.setLaunchAtLogin(false)

        #expect(manager.state == .disabled)
        #expect(model.launchAtLoginError == nil)
    }

    /// macOS refuses to register an app running from a temporary directory,
    /// which is exactly what a local build does. The failure has to surface.
    @Test func reportsAFailedRegistrationInsteadOfPretending() {
        let manager = StubLaunchAtLogin(state: .disabled, failsWith: StubError.refused)
        let model = makeModel(manager: manager)

        model.setLaunchAtLogin(true)

        #expect(model.launchAtLogin.isEnabled == false, "state must still come from the system")
        #expect(model.launchAtLoginError?.contains("Applications folder") == true)
    }

    @Test func clearsAPreviousErrorOnASuccessfulRetry() {
        let manager = StubLaunchAtLogin(state: .disabled, failsWith: StubError.refused)
        let model = makeModel(manager: manager)
        model.setLaunchAtLogin(true)
        #expect(model.launchAtLoginError != nil)

        manager.failure = nil
        model.setLaunchAtLogin(true)

        #expect(model.launchAtLoginError == nil)
        #expect(model.launchAtLogin.isEnabled)
    }

    /// Pending approval is neither on nor off; treating it as on would be a
    /// lie, and the note in Settings depends on the distinction.
    @Test func treatsPendingApprovalAsNotYetEnabled() {
        let model = makeModel(manager: StubLaunchAtLogin(state: .requiresApproval))

        #expect(model.launchAtLogin == .requiresApproval)
        #expect(model.launchAtLogin.isEnabled == false)
    }

    // MARK: - Dock icon

    @Test func hidesTheDockIconByDefault() {
        #expect(makeModel(manager: StubLaunchAtLogin(state: .disabled)).showsDockIcon == false)
    }

    @Test func persistsTheDockIconPreference() {
        let defaults = makeDefaults()
        let model = makeModel(defaults: defaults, manager: StubLaunchAtLogin(state: .disabled))

        model.showsDockIcon = true

        let relaunched = makeModel(defaults: defaults, manager: StubLaunchAtLogin(state: .disabled))
        #expect(relaunched.showsDockIcon)
    }

    // MARK: - Helpers

    private func makeModel(
        defaults: UserDefaults? = nil,
        manager: any LaunchAtLoginManaging
    ) -> AppModel {
        AppModel(
            now: Date(timeIntervalSince1970: 1_786_838_400),
            defaults: defaults ?? makeDefaults(),
            launchAtLoginManager: manager,
            autoLoadWeather: false
        )
    }

    private func makeDefaults() -> UserDefaults {
        let suite = "com.sajilo.tests.launch.\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suite)!
        defaults.removePersistentDomain(forName: suite)
        return defaults
    }
}

private enum StubError: Error { case refused }

/// Stands in for `SMAppService`, which cannot be exercised from a test bundle.
private final class StubLaunchAtLogin: LaunchAtLoginManaging, @unchecked Sendable {
    var state: LaunchAtLoginState
    var failure: (any Error)?

    init(state: LaunchAtLoginState, failsWith failure: (any Error)? = nil) {
        self.state = state
        self.failure = failure
    }

    func setEnabled(_ enabled: Bool) throws {
        if let failure { throw failure }
        state = enabled ? .enabled : .disabled
    }
}
