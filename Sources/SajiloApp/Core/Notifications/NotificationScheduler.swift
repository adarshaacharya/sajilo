import Foundation
import UserNotifications

enum NotificationAuthorization: Equatable, Sendable {
    case notDetermined
    case authorized
    case denied
}

/// Wraps `UNUserNotificationCenter`, which cannot be exercised from a test
/// bundle and which prompts the user the first time authorisation is requested.
protocol NotificationScheduling: Sendable {
    func authorization() async -> NotificationAuthorization
    /// Shows the system prompt. Called only when the user turns a reminder on,
    /// never at launch (PRD §9).
    func requestAuthorization() async -> Bool
    /// Replaces every reminder Sajilo owns. Replacing rather than appending is
    /// what keeps a replan from stacking duplicates.
    func replaceScheduled(with notifications: [PlannedNotification]) async
    func cancelAll() async
}

struct SystemNotificationScheduler: NotificationScheduling {
    private var center: UNUserNotificationCenter { .current() }

    func authorization() async -> NotificationAuthorization {
        switch await center.notificationSettings().authorizationStatus {
        case .notDetermined: .notDetermined
        case .denied: .denied
        case .authorized, .provisional, .ephemeral: .authorized
        @unknown default: .denied
        }
    }

    func requestAuthorization() async -> Bool {
        // A throw here means the app is not in a state that can request
        // authorisation — an unbundled build, typically — which is a "no",
        // not a crash.
        ((try? await center.requestAuthorization(options: [.alert, .sound])) ?? false)
    }

    func replaceScheduled(with notifications: [PlannedNotification]) async {
        await cancelAll()

        for notification in notifications {
            let content = UNMutableNotificationContent()
            content.title = notification.title
            content.body = notification.body
            content.sound = .default

            let components = NepalTime.calendar.dateComponents(
                [.year, .month, .day, .hour, .minute],
                from: notification.fireDate
            )
            let request = UNNotificationRequest(
                identifier: notification.id,
                content: content,
                trigger: UNCalendarNotificationTrigger(dateMatching: components, repeats: false)
            )
            try? await center.add(request)
        }
    }

    func cancelAll() async {
        let pending = await center.pendingNotificationRequests()
        // Only Sajilo's own requests, identified by prefix, so nothing else the
        // app might schedule later is swept away by a replan.
        let ids = pending.map(\.identifier).filter { $0.hasPrefix("sajilo.") }
        center.removePendingNotificationRequests(withIdentifiers: ids)
    }
}
