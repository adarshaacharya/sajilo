import Foundation

/// JSON persistence keeps personal plans private, portable in backups, and
/// independent of a database migration for this deliberately small feature.
final class DayPlanStore {
    private let defaults: UserDefaults
    private let key: String
    private let encoder = JSONEncoder()
    private let decoder = JSONDecoder()

    init(defaults: UserDefaults = .standard, key: String = "dayPlans.v1") {
        self.defaults = defaults
        self.key = key
    }

    func load() -> [DayPlan] {
        guard let data = defaults.data(forKey: key),
              let plans = try? decoder.decode([DayPlan].self, from: data) else {
            return []
        }
        return plans
    }

    func save(_ plans: [DayPlan]) {
        guard let data = try? encoder.encode(plans) else { return }
        defaults.set(data, forKey: key)
    }
}
