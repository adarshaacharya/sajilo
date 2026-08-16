import Foundation
import Testing
@testable import SajiloApp

/// PRD §9: "Notification permission is requested only when the user enables a
/// notification option." These pin that promise — a prompt at launch is the
/// exact thing a menu-bar utility must not do.
@MainActor
struct NotificationPermissionTests {
    @Test func doesNotPromptAtLaunch() async {
        let scheduler = StubScheduler(authorization: .notDetermined)

        _ = makeModel(scheduler: scheduler)
        await Task.yield()

        #expect(scheduler.promptCount == 0)
    }

    @Test func doesNotPromptWhenSettingsMerelyReadsTheStatus() async {
        let scheduler = StubScheduler(authorization: .notDetermined)
        let model = makeModel(scheduler: scheduler)

        await model.refreshNotificationAuthorization()

        #expect(scheduler.promptCount == 0)
        #expect(model.notificationAuthorization == .notDetermined)
    }

    @Test func promptsOnceWhenAReminderIsSwitchedOn() async {
        let scheduler = StubScheduler(authorization: .notDetermined, grantsWhenAsked: true)
        let model = makeModel(scheduler: scheduler)

        model.notificationOptions.eveOfFestival = true
        await settle()

        #expect(scheduler.promptCount == 1)
        #expect(model.notificationAuthorization == .authorized)
    }

    @Test func doesNotPromptAgainForASecondReminder() async {
        let scheduler = StubScheduler(authorization: .notDetermined, grantsWhenAsked: true)
        let model = makeModel(scheduler: scheduler)

        model.notificationOptions.eveOfFestival = true
        await settle()
        model.notificationOptions.eveOfPublicHoliday = true
        await settle()

        #expect(scheduler.promptCount == 1)
    }

    @Test func neverPromptsWhenTurningReminders_off() async {
        let scheduler = StubScheduler(authorization: .authorized)
        let model = makeModel(scheduler: scheduler)
        model.notificationOptions.eveOfFestival = true
        await settle()
        let promptsAfterEnabling = scheduler.promptCount

        model.notificationOptions.eveOfFestival = false
        await settle()

        #expect(scheduler.promptCount == promptsAfterEnabling)
        #expect(scheduler.cancelCount >= 1, "switching everything off clears the schedule")
    }

    @Test func schedulesRemindersOnceAuthorised() async {
        let scheduler = StubScheduler(authorization: .authorized)
        let model = makeModel(scheduler: scheduler)

        model.notificationOptions.eveOfFestival = true
        await settle()

        #expect(scheduler.scheduled.isEmpty == false)
        #expect(scheduler.scheduled.allSatisfy { $0.id.hasPrefix("sajilo.festival.") })
    }

    /// A denial must not leave reminders "on" and silently unscheduled — the
    /// Settings note depends on this state being visible.
    @Test func recordsADenialRatherThanScheduling() async {
        let scheduler = StubScheduler(authorization: .notDetermined, grantsWhenAsked: false)
        let model = makeModel(scheduler: scheduler)

        model.notificationOptions.eveOfFestival = true
        await settle()

        #expect(model.notificationAuthorization == .denied)
        #expect(scheduler.scheduled.isEmpty)
    }

    @Test func persistsReminderChoicesAcrossRelaunch() async {
        let defaults = makeDefaults()
        let model = makeModel(defaults: defaults, scheduler: StubScheduler(authorization: .authorized))

        model.notificationOptions.eveOfPublicHoliday = true
        await settle()

        let relaunched = makeModel(defaults: defaults, scheduler: StubScheduler(authorization: .authorized))
        #expect(relaunched.notificationOptions.eveOfPublicHoliday)
        #expect(relaunched.notificationOptions.eveOfFestival == false)
    }

    @Test func defaultsToEverythingOff() {
        let model = makeModel(scheduler: StubScheduler(authorization: .notDetermined))

        #expect(model.notificationOptions == .none)
        #expect(model.notificationOptions.isAnyEnabled == false)
    }

    // MARK: - Helpers

    /// The model reacts to preference changes in a detached task; a few yields
    /// let those land before assertions.
    private func settle() async {
        for _ in 0..<8 { await Task.yield() }
    }

    private func makeModel(
        defaults: UserDefaults? = nil,
        scheduler: any NotificationScheduling
    ) -> AppModel {
        AppModel(
            now: Date(timeIntervalSince1970: 1_786_838_400),
            defaults: defaults ?? makeDefaults(),
            notificationScheduler: scheduler,
            autoLoadWeather: false
        )
    }

    private func makeDefaults() -> UserDefaults {
        let suite = "com.sajilo.tests.notify.\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suite)!
        defaults.removePersistentDomain(forName: suite)
        return defaults
    }
}

private final class StubScheduler: NotificationScheduling, @unchecked Sendable {
    private(set) var promptCount = 0
    private(set) var cancelCount = 0
    private(set) var scheduled: [PlannedNotification] = []

    private var status: NotificationAuthorization
    private let grantsWhenAsked: Bool

    init(authorization: NotificationAuthorization, grantsWhenAsked: Bool = true) {
        status = authorization
        self.grantsWhenAsked = grantsWhenAsked
    }

    func authorization() async -> NotificationAuthorization { status }

    func requestAuthorization() async -> Bool {
        promptCount += 1
        status = grantsWhenAsked ? .authorized : .denied
        return grantsWhenAsked
    }

    func replaceScheduled(with notifications: [PlannedNotification]) async {
        scheduled = notifications
    }

    func cancelAll() async {
        cancelCount += 1
        scheduled = []
    }
}
