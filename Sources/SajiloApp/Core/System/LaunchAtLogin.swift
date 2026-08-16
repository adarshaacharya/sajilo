import Foundation
import ServiceManagement

/// Whether Sajilo starts with the Mac.
///
/// The truth for this lives in the system, not in Sajilo's preferences: the
/// user can turn it off in System Settings › General › Login Items at any time,
/// and a mirrored boolean in `UserDefaults` would silently disagree with
/// reality. Every read therefore asks the system.
protocol LaunchAtLoginManaging: Sendable {
    var state: LaunchAtLoginState { get }
    func setEnabled(_ enabled: Bool) throws
}

enum LaunchAtLoginState: Equatable, Sendable {
    case enabled
    case disabled
    /// macOS is holding the registration until the user approves it in System
    /// Settings. Reporting this as "on" would be a lie, and as "off" would make
    /// the toggle look broken when it flips back.
    case requiresApproval
    /// The app is not in a location macOS will register — most often a build
    /// running from a temporary directory rather than /Applications.
    case unavailable

    var isEnabled: Bool { self == .enabled }
}

struct SystemLaunchAtLogin: LaunchAtLoginManaging {
    var state: LaunchAtLoginState {
        switch SMAppService.mainApp.status {
        case .enabled: .enabled
        case .notRegistered: .disabled
        case .requiresApproval: .requiresApproval
        case .notFound: .unavailable
        @unknown default: .unavailable
        }
    }

    func setEnabled(_ enabled: Bool) throws {
        if enabled {
            try SMAppService.mainApp.register()
        } else {
            try SMAppService.mainApp.unregister()
        }
    }
}
