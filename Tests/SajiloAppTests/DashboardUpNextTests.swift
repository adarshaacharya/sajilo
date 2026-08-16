import Foundation
import Testing
@testable import SajiloApp

struct DashboardUpNextTests {
    private let now = NepalTime.calendar.date(
        from: DateComponents(year: 2026, month: 8, day: 16, hour: 10, minute: 0)
    )!

    @Test func prioritisesAFutureTimedPlanOverAFestivalToday() {
        let plan = DayPlan(
            date: NepaliDate(year: 2083, month: 4, day: 31),
            title: "Doctor appointment",
            time: .init(hour: 15, minute: 30)
        )
        let festival = event(name: "नाग पञ्चमी", daysAway: 0)

        let summary = DashboardUpNext.make(plans: [plan], events: [festival], now: now)

        #expect(summary?.kind == .plan(plan))
        #expect(summary?.todayFestival == festival)
        #expect(summary?.destination == .today)
    }

    @Test func promotesATodayFestivalWhenThereIsNoRemainingTimedPlan() {
        let pastPlan = DayPlan(
            date: NepaliDate(year: 2083, month: 4, day: 31),
            title: "Morning call",
            time: .init(hour: 9, minute: 0)
        )
        let festival = event(name: "नाग पञ्चमी", daysAway: 0)

        let summary = DashboardUpNext.make(plans: [pastPlan], events: [festival], now: now)

        #expect(summary?.kind == .festival(festival))
        #expect(summary?.destination == .today)
    }

    @Test func fallsBackToTheNextFestivalOnAnOtherwiseEmptyDay() {
        let tomorrow = event(name: "अष्टमीव्रत", daysAway: 1)

        let summary = DashboardUpNext.make(plans: [], events: [tomorrow], now: now)

        #expect(summary?.kind == .festival(tomorrow))
        #expect(summary?.destination == .festivals)
    }

    @Test func usesAnUntimedPlanBeforeAFutureFestival() {
        let plan = DayPlan(date: NepaliDate(year: 2083, month: 4, day: 31), title: "Call home")
        let tomorrow = event(name: "अष्टमीव्रत", daysAway: 1)

        let summary = DashboardUpNext.make(plans: [plan], events: [tomorrow], now: now)

        #expect(summary?.kind == .plan(plan))
        #expect(summary?.destination == .today)
    }

    private func event(name: String, daysAway: Int) -> UpcomingEvent {
        UpcomingEvent(
            date: NepaliDate(year: 2083, month: 4, day: 31),
            gregorian: now,
            name: name,
            isPublicHoliday: false,
            daysAway: daysAway
        )
    }
}
