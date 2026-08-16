import Foundation

/// A small personal commitment attached to a Bikram Sambat calendar day.
///
/// This deliberately is not a general note document: there are no folders,
/// rich text, attachments, or recurrence. It answers one question well — what
/// do I need to remember on this date?
struct DayPlan: Codable, Equatable, Hashable, Identifiable, Sendable {
    enum Recurrence: String, Codable, CaseIterable, Sendable {
        case none
        case yearlyBikramSambat
    }

    struct Time: Codable, Equatable, Hashable, Sendable, Comparable {
        let hour: Int
        let minute: Int

        static func < (lhs: Self, rhs: Self) -> Bool {
            (lhs.hour, lhs.minute) < (rhs.hour, rhs.minute)
        }
    }

    enum Reminder: Int, Codable, CaseIterable, Identifiable, Sendable {
        case atTime = 0
        case fiveMinutes = 5
        case tenMinutes = 10
        case fifteenMinutes = 15
        case thirtyMinutes = 30
        case oneHour = 60

        var id: Int { rawValue }
    }

    let id: UUID
    var date: NepaliDate
    var title: String
    var time: Time?
    var reminder: Reminder?
    var note: String
    /// A yearly important date keeps its Bikram Sambat month and day. It is
    /// resolved again for each year rather than pre-creating duplicate plans.
    var recurrence: Recurrence
    let createdAt: Date

    init(
        id: UUID = UUID(),
        date: NepaliDate,
        title: String,
        time: Time? = nil,
        reminder: Reminder? = nil,
        note: String = "",
        recurrence: Recurrence = .none,
        createdAt: Date = .now
    ) {
        self.id = id
        self.date = date
        self.title = title
        self.time = time
        self.reminder = time == nil ? nil : reminder
        self.note = note
        self.recurrence = recurrence
        self.createdAt = createdAt
    }

    /// Old local JSON has no recurrence field. Decoding it as `.none` makes
    /// the feature an additive update: every existing plan stays one-time.
    private enum CodingKeys: String, CodingKey {
        case id, date, title, time, reminder, note, recurrence, createdAt
    }

    init(from decoder: any Decoder) throws {
        let values = try decoder.container(keyedBy: CodingKeys.self)
        id = try values.decode(UUID.self, forKey: .id)
        date = try values.decode(NepaliDate.self, forKey: .date)
        title = try values.decode(String.self, forKey: .title)
        time = try values.decodeIfPresent(Time.self, forKey: .time)
        reminder = try values.decodeIfPresent(Reminder.self, forKey: .reminder)
        note = try values.decode(String.self, forKey: .note)
        recurrence = try values.decodeIfPresent(Recurrence.self, forKey: .recurrence) ?? .none
        createdAt = try values.decode(Date.self, forKey: .createdAt)
    }

    func occurrence(in year: Int) -> NepaliDate? {
        guard recurrence == .yearlyBikramSambat,
              year >= date.year,
              let monthLength = BikramSambatCalendar.daysInMonth(year: year, month: date.month) else {
            return nil
        }
        return NepaliDate(year: year, month: date.month, day: min(date.day, monthLength))
    }

    func occurs(on candidate: NepaliDate) -> Bool {
        switch recurrence {
        case .none:
            date == candidate
        case .yearlyBikramSambat:
            occurrence(in: candidate.year) == candidate
        }
    }
}

extension DayPlan {
    static func ordered(_ plans: [DayPlan]) -> [DayPlan] {
        plans.sorted {
            switch ($0.time, $1.time) {
            case let (left?, right?):
                left == right ? $0.createdAt < $1.createdAt : left < right
            case (.some, .none): true
            case (.none, .some): false
            case (.none, .none): $0.createdAt < $1.createdAt
            }
        }
    }
}
