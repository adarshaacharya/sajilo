import SwiftUI

/// A deliberately compact personal planner embedded in a calendar day. It is
/// not exposed as its own app-wide notes route, which keeps Sajilo calendar
/// first and makes every entry meaningful without folders or tagging.
struct DayPlanSection: View {
    let date: NepaliDate
    let plans: [DayPlan]
    let onSave: (DayPlan) -> Void
    let onDelete: (DayPlan.ID) -> Void

    @State private var draft: DayPlanDraft?

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Space.s) {
            HStack {
                Text(L10n.dayPlan)
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.secondary)
                Spacer(minLength: 0)
                Button(L10n.addPlan, systemImage: "plus") {
                    draft = DayPlanDraft(date: date)
                }
                .buttonStyle(.borderless)
                .controlSize(.small)
            }

            if plans.isEmpty, draft == nil {
                Text(L10n.noPlans)
                    .font(.callout)
                    .foregroundStyle(.secondary)
            }

            ForEach(plans) { plan in
                DayPlanRow(plan: plan) {
                    draft = DayPlanDraft(plan: plan)
                } onDelete: {
                    onDelete(plan.id)
                }
            }

            if let draft {
                DayPlanEditor(
                    draft: draft,
                    onCancel: {
                        self.draft = nil
                    },
                    onSave: { plan in
                        onSave(plan)
                        self.draft = nil
                    }
                )
            }
        }
        .cardSection()
    }
}

private struct DayPlanRow: View {
    let plan: DayPlan
    let onEdit: () -> Void
    let onDelete: () -> Void

    var body: some View {
        HStack(alignment: .top, spacing: Theme.Space.s) {
            Button(action: onEdit) {
                VStack(alignment: .leading, spacing: Theme.Space.xxs) {
                    HStack(spacing: Theme.Space.xs) {
                        if let time = plan.time {
                            Text(timeText(time))
                                .font(.caption.monospacedDigit().weight(.semibold))
                                .foregroundStyle(Theme.Palette.brand)
                        }
                        Text(plan.title)
                            .font(.callout.weight(.medium))
                            .foregroundStyle(.primary)
                            .lineLimit(1)
                    }
                    if !plan.note.isEmpty {
                        Text(plan.note)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                            .lineLimit(2)
                    }
                    if plan.recurrence == .yearlyBikramSambat {
                        Text(L10n.repeatsYearly)
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .buttonStyle(.plain)
            .accessibilityLabel(planAccessibilityLabel)
            .accessibilityHint(L10n.editPlan)

            Button(L10n.deletePlan, systemImage: "trash", role: .destructive, action: onDelete)
                .labelStyle(.iconOnly)
                .buttonStyle(.borderless)
                .controlSize(.small)
                .accessibilityLabel(L10n.deletePlan)
        }
        .padding(.vertical, Theme.Space.xxs)
    }

    private var planAccessibilityLabel: String {
        [plan.time.map(timeText), plan.title, plan.note.isEmpty ? nil : plan.note]
            .compactMap { $0 }
            .joined(separator: ", ")
    }
}

private struct DayPlanEditor: View {
    @State private var draft: DayPlanDraft
    @FocusState private var isTitleFocused: Bool
    let onCancel: () -> Void
    let onSave: (DayPlan) -> Void

    init(
        draft: DayPlanDraft,
        onCancel: @escaping () -> Void,
        onSave: @escaping (DayPlan) -> Void
    ) {
        _draft = State(initialValue: draft)
        self.onCancel = onCancel
        self.onSave = onSave
    }

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Space.s) {
            TextField(String(localized: L10n.planTitle), text: $draft.title)
                .textFieldStyle(.roundedBorder)
                .focused($isTitleFocused)

            Toggle(L10n.includeTime, isOn: $draft.hasTime)

            Toggle(L10n.repeatYearly, isOn: $draft.repeatsYearly)

            if draft.hasTime {
                HStack(spacing: Theme.Space.s) {
                    DatePicker(
                        L10n.time,
                        selection: $draft.timeDate,
                        displayedComponents: .hourAndMinute
                    )
                    .labelsHidden()

                    Picker(L10n.reminder, selection: $draft.reminder) {
                        Text(L10n.noReminder).tag(DayPlan.Reminder?.none)
                        ForEach(DayPlan.Reminder.allCases) { reminder in
                            Text(reminder.title).tag(DayPlan.Reminder?.some(reminder))
                        }
                    }
                    .labelsHidden()
                    .frame(maxWidth: .infinity)
                }
            }

            TextField(String(localized: L10n.planNote), text: $draft.note, axis: .vertical)
                .textFieldStyle(.roundedBorder)
                .lineLimit(2...4)

            HStack {
                Button(L10n.cancel, action: onCancel)
                Spacer(minLength: 0)
                Button(L10n.savePlan) { onSave(draft.plan) }
                    .buttonStyle(.borderedProminent)
                    .tint(Theme.Palette.brandFill)
                    .disabled(draft.title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            }
        }
        .padding(Theme.Space.s)
        .background(Theme.Palette.hover, in: .rect(cornerRadius: Theme.Radius.day))
        .onAppear { isTitleFocused = true }
    }
}

private struct DayPlanDraft {
    let id: UUID
    let date: NepaliDate
    let createdAt: Date
    var title: String
    var note: String
    var hasTime: Bool
    var timeDate: Date
    var reminder: DayPlan.Reminder?
    var repeatsYearly: Bool

    init(date: NepaliDate) {
        id = UUID()
        self.date = date
        createdAt = .now
        title = ""
        note = ""
        hasTime = false
        timeDate = Self.defaultTime
        reminder = nil
        repeatsYearly = false
    }

    init(plan: DayPlan) {
        id = plan.id
        date = plan.date
        createdAt = plan.createdAt
        title = plan.title
        note = plan.note
        hasTime = plan.time != nil
        timeDate = Self.date(for: plan.time ?? DayPlan.Time(hour: 9, minute: 0))
        reminder = plan.reminder
        repeatsYearly = plan.recurrence == .yearlyBikramSambat
    }

    var plan: DayPlan {
        let components = NepalTime.calendar.dateComponents([.hour, .minute], from: timeDate)
        let time = hasTime
            ? DayPlan.Time(hour: components.hour ?? 9, minute: components.minute ?? 0)
            : nil
        return DayPlan(
            id: id,
            date: date,
            title: title.trimmingCharacters(in: .whitespacesAndNewlines),
            time: time,
            reminder: time == nil ? nil : reminder,
            note: note.trimmingCharacters(in: .whitespacesAndNewlines),
            recurrence: repeatsYearly ? .yearlyBikramSambat : .none,
            createdAt: createdAt
        )
    }

    private static let defaultTime = date(for: DayPlan.Time(hour: 9, minute: 0))

    private static func date(for time: DayPlan.Time) -> Date {
        NepalTime.calendar.date(from: DateComponents(year: 2001, month: 1, day: 1, hour: time.hour, minute: time.minute))!
    }
}

private extension DayPlan.Reminder {
    var title: LocalizedStringResource {
        switch self {
        case .atTime: L10n.reminderAtTime
        case .fiveMinutes: L10n.reminderFiveMinutes
        case .tenMinutes: L10n.reminderTenMinutes
        case .fifteenMinutes: L10n.reminderFifteenMinutes
        case .thirtyMinutes: L10n.reminderThirtyMinutes
        case .oneHour: L10n.reminderOneHour
        }
    }
}

private func timeText(_ time: DayPlan.Time) -> String {
    String(format: "%02d:%02d", time.hour, time.minute)
}
