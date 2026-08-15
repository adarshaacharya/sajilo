import Foundation

struct CalendarDay: Identifiable, Equatable, Sendable {
    let id: String
    /// `nil` for the leading blanks that pad the grid to the first weekday.
    let date: NepaliDate?
    let adDay: Int?
    let isToday: Bool
    /// Saturday today; extended by the versioned holiday dataset later.
    let isHoliday: Bool
    let eventName: String?
    let tithi: String?

    var day: Int? { date?.day }
}

struct CalendarMonth: Equatable, Sendable {
    let firstDate: NepaliDate
    let title: String
    let days: [CalendarDay]
}
