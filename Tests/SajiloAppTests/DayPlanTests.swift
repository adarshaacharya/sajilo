import Foundation
import Testing
@testable import SajiloApp

struct DayPlanStoreTests {
    @Test func persistsPlansAsJSONAcrossStoreInstances() {
        let defaults = makeDefaults()
        let key = "day-plans-test"
        let plan = DayPlan(
            date: NepaliDate(year: 2083, month: 4, day: 30),
            title: "Doctor appointment",
            time: .init(hour: 15, minute: 30),
            reminder: .tenMinutes,
            note: "Bring previous report",
            createdAt: Date(timeIntervalSince1970: 1_786_838_400)
        )

        DayPlanStore(defaults: defaults, key: key).save([plan])

        #expect(DayPlanStore(defaults: defaults, key: key).load() == [plan])
        #expect(defaults.data(forKey: key) != nil, "Plans are encoded locally rather than sent to a service")
    }

    @Test func clearsAnUnreadableOldPayloadInsteadOfCrashing() {
        let defaults = makeDefaults()
        defaults.set(Data("not JSON".utf8), forKey: "day-plans-test")

        #expect(DayPlanStore(defaults: defaults, key: "day-plans-test").load().isEmpty)
    }
}

struct DayPlanReminderPlannerTests {
    @Test func schedulesAtTheSelectedNepalTimeMinusTheLeadTime() throws {
        let entry = plan(hour: 15, minute: 30, reminder: .tenMinutes)
        let eventDate = try eventDate(for: entry)
        let now = NepalTime.calendar.date(byAdding: .hour, value: -2, to: eventDate)!

        let reminder = try #require(DayPlanReminderPlanner.plan(entries: [entry], now: now).first)
        let components = NepalTime.calendar.dateComponents([.hour, .minute], from: reminder.fireDate)

        #expect(components.hour == 15)
        #expect(components.minute == 20)
        #expect(reminder.id == "sajilo.plan.\(entry.id.uuidString)")
        #expect(reminder.body == "Bring previous report")
    }

    @Test func ignoresUntimedAndPastPlans() throws {
        let timed = plan(hour: 9, minute: 0, reminder: .atTime)
        let eventDate = try eventDate(for: timed)
        let untimed = DayPlan(date: timed.date, title: "Call home")

        let planned = DayPlanReminderPlanner.plan(
            entries: [timed, untimed],
            now: NepalTime.calendar.date(byAdding: .minute, value: 1, to: eventDate)!
        )

        #expect(planned.isEmpty)
    }

    @Test func ordersByFireDateAndHonoursTheLimit() throws {
        let entries = (0...DayPlanReminderPlanner.limit).map { offset in
            DayPlan(
                date: NepaliDate(year: 2083, month: 4, day: 30),
                title: "Plan \(offset)",
                time: .init(hour: 8 + offset / 60, minute: offset % 60),
                reminder: .atTime
            )
        }
        let now = try eventDate(for: entries[0]).addingTimeInterval(-60)
        let planned = DayPlanReminderPlanner.plan(entries: entries, now: now)

        #expect(planned.count == DayPlanReminderPlanner.limit)
        #expect(planned.map(\.fireDate) == planned.map(\.fireDate).sorted())
    }

    private func plan(hour: Int, minute: Int, reminder: DayPlan.Reminder) -> DayPlan {
        DayPlan(
            date: NepaliDate(year: 2083, month: 4, day: 30),
            title: "Doctor appointment",
            time: .init(hour: hour, minute: minute),
            reminder: reminder,
            note: "Bring previous report"
        )
    }

    private func eventDate(for plan: DayPlan) throws -> Date {
        let day = try BikramSambatCalendar.gregorianDate(from: plan.date)
        let time = try #require(plan.time)
        return try #require(NepalTime.calendar.date(
            bySettingHour: time.hour,
            minute: time.minute,
            second: 0,
            of: day
        ))
    }
}

private func makeDefaults() -> UserDefaults {
    let suite = "com.sajilo.tests.plans.\(UUID().uuidString)"
    let defaults = UserDefaults(suiteName: suite)!
    defaults.removePersistentDomain(forName: suite)
    return defaults
}
