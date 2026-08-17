import Foundation

/// The dashboard's single glanceable commitment. Personal plans lead because
/// they are actionable; a festival today remains first when there is no plan,
/// and the next festival is the calm fallback on an otherwise empty day.
struct DashboardUpNext: Equatable, Sendable {
    enum Destination: Equatable, Sendable {
        case today
        case festivals
    }

    enum Kind: Equatable, Sendable {
        case plan(DayPlan)
        case festival(UpcomingEvent)
    }

    let kind: Kind
    let todayFestival: UpcomingEvent?
    let destination: Destination

    static func make(
        plans: [DayPlan],
        events: [UpcomingEvent],
        now: Date,
        calendar: Calendar = NepalTime.calendar
    ) -> Self? {
        let todayFestival = events.first { $0.daysAway == 0 }
        let nextFestival = events.first { $0.daysAway > 0 }
        let nowParts = calendar.dateComponents([.hour, .minute], from: now)
        let nowTime = DayPlan.Time(hour: nowParts.hour ?? 0, minute: nowParts.minute ?? 0)

        // A timed commitment earlier than the present is not "up next". We
        // intentionally do not invent completion state for it.
        if let upcomingPlan = DayPlan.ordered(plans).first(where: { plan in
            guard let time = plan.time else { return false }
            return time >= nowTime
        }) {
            return Self(kind: .plan(upcomingPlan), todayFestival: todayFestival, destination: .today)
        }

        if let untimedPlan = DayPlan.ordered(plans).first(where: { $0.time == nil }) {
            return Self(kind: .plan(untimedPlan), todayFestival: todayFestival, destination: .today)
        }

        if let todayFestival {
            return Self(kind: .festival(todayFestival), todayFestival: todayFestival, destination: .today)
        }

        if let nextFestival {
            return Self(kind: .festival(nextFestival), todayFestival: nil, destination: .festivals)
        }

        return nil
    }
}
