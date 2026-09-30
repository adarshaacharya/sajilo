//! Where a jot from the Notes tab lands in today's note.
//!
//! A day of jots reads as a log: each goes under a time heading (`### 14:32`),
//! and one within half an hour of the last heading joins it rather than
//! starting another, so a meeting's worth of jots stays together.

use std::fmt::Write as _;

/// Jots this close to the last time heading, in minutes, go under it.
const SAME_MOMENT: u32 = 30;

/// `note` with `jot` added at the end. `now` is the time of day in minutes
/// since midnight; `title` is the note's first line, written when the note is
/// still empty. A jot starting `[]` or `[ ]` becomes a checklist item.
pub fn append_jot(note: &str, jot: &str, now: u32, title: &str) -> String {
    let jot = jot.trim();
    let mut out = if note.trim().is_empty() {
        format!("# {title}\n")
    } else {
        note.trim_end().to_owned() + "\n"
    };
    if jot.is_empty() {
        return out;
    }
    let line = checklist_item(jot).unwrap_or_else(|| jot.to_owned());
    let is_task = line.starts_with("- [ ]");

    let recent = last_time(&out).is_some_and(|at| now >= at && now - at < SAME_MOMENT);
    if !recent {
        let _ = write!(out, "\n### {:02}:{:02}\n", now / 60 % 24, now % 60);
    }
    // A paragraph needs a blank line before it, or Markdown runs it into the
    // line above; a checklist item after another stays in the same list.
    let last = out.trim_end().lines().last().unwrap_or("");
    let after_heading = last.starts_with("### ");
    let after_task = last.trim_start().starts_with("- [");
    if !(after_heading || is_task && after_task) {
        out.push('\n');
    }
    out.push_str(&line);
    out.push('\n');
    out
}

/// `- [ ] rest` for a jot starting `[]` or `[ ]`.
fn checklist_item(jot: &str) -> Option<String> {
    let rest = jot
        .strip_prefix("[ ]")
        .or_else(|| jot.strip_prefix("[]"))
        .or_else(|| jot.strip_prefix("- [ ]"))?;
    Some(format!("- [ ] {}", rest.trim()))
}

/// The last `### HH:MM` heading's time, in minutes since midnight.
fn last_time(note: &str) -> Option<u32> {
    note.lines().rev().find_map(|line| {
        let time = line.strip_prefix("### ")?.trim();
        let (hours, minutes) = time.split_once(':')?;
        let (hours, minutes) = (hours.parse::<u32>().ok()?, minutes.parse::<u32>().ok()?);
        (hours < 24 && minutes < 60).then_some(hours * 60 + minutes)
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_first_jot_starts_the_note() {
        assert_eq!(
            append_jot("", "Standup at ten", 9 * 60 + 5, "Asoj 14, 2083"),
            "# Asoj 14, 2083\n\n### 09:05\nStandup at ten\n"
        );
    }

    #[test]
    fn close_jots_share_a_heading_and_far_ones_get_their_own() {
        let one = append_jot("", "First", 600, "Today");
        let two = append_jot(&one, "Second", 610, "Today");
        assert_eq!(two, "# Today\n\n### 10:00\nFirst\n\nSecond\n");
        let three = append_jot(&two, "Later", 700, "Today");
        assert!(three.ends_with("\n### 11:40\nLater\n"));
    }

    #[test]
    fn checklist_jots_stay_one_list() {
        let one = append_jot("", "[] Call dai", 600, "Today");
        let two = append_jot(&one, "[ ] Buy milk", 605, "Today");
        assert_eq!(
            two,
            "# Today\n\n### 10:00\n- [ ] Call dai\n- [ ] Buy milk\n"
        );
    }
}
