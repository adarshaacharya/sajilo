import Foundation

/// A small personal commitment attached to a Bikram Sambat calendar day.
///
/// This deliberately is not a general note document: there are no folders,
/// rich text, attachments, or recurrence. It answers one question well — what
/// do I need to remember on this date?
struct DayPlan: Codable, Equatable, Hashable, Identifiable, Sendable {
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
    let createdAt: Date

    init(
        id: UUID = UUID(),
        date: NepaliDate,
        title: String,
        time: Time? = nil,
        reminder: Reminder? = nil,
        note: String = "",
        createdAt: Date = .now
    ) {
        self.id = id
        self.date = date
        self.title = title
        self.time = time
        self.reminder = time == nil ? nil : reminder
        self.note = note
        self.createdAt = createdAt
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
