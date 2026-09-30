//! What a note's Markdown says about itself.
//!
//! Read line by line rather than through a full Markdown parser: a note list
//! needs a title, a preview line, tags, links and checklist counts, and a
//! fenced code block is the one place those must not be looked for.

use serde::Serialize;

/// Longest preview kept for the list.
const PREVIEW_CHARS: usize = 120;
/// Longest file name made from a title, in characters.
const STEM_CHARS: usize = 80;

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteFacts {
    /// The first line, without its Markdown. Empty for an empty note.
    pub title: String,
    /// The first line after the title with words in it, plain.
    pub preview: String,
    /// `#tags`, without the `#`, in order of first use.
    pub tags: Vec<String>,
    /// `[[Links]]`, by the note they name.
    pub links: Vec<String>,
    pub open_tasks: u32,
    pub done_tasks: u32,
    pub words: u32,
}

/// What `text` says about itself.
pub fn facts(text: &str) -> NoteFacts {
    let mut facts = NoteFacts::default();
    let mut in_code = false;
    for line in text.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with("```") || trimmed.starts_with("~~~") {
            in_code = !in_code;
            continue;
        }
        if in_code {
            continue;
        }
        facts.words += u32::try_from(trimmed.split_whitespace().count()).unwrap_or(u32::MAX);
        match task_state(line) {
            Some(true) => facts.done_tasks += 1,
            Some(false) => facts.open_tasks += 1,
            None => {}
        }
        for tag in tags_in(trimmed) {
            if !facts.tags.contains(&tag) {
                facts.tags.push(tag);
            }
        }
        for link in links_in(trimmed) {
            if !facts.links.contains(&link) {
                facts.links.push(link);
            }
        }
        let plain = plain_line(trimmed);
        if plain.is_empty() {
            continue;
        }
        if facts.title.is_empty() {
            facts.title = plain;
        } else if facts.preview.is_empty() {
            facts.preview = plain.chars().take(PREVIEW_CHARS).collect();
        }
    }
    facts
}

/// `Some(done)` for a checklist line (`- [ ]`, `* [x]`, `1. [ ]`).
fn task_state(line: &str) -> Option<bool> {
    let rest = list_marker(line.trim_start())?;
    let mark = rest.strip_prefix('[')?.chars().next()?;
    rest.get(2..3).filter(|close| *close == "]")?;
    match mark {
        ' ' => Some(false),
        'x' | 'X' => Some(true),
        _ => None,
    }
}

/// The rest of a list item after its marker (`- `, `* `, `+ `, `1. `).
fn list_marker(line: &str) -> Option<&str> {
    if let Some(rest) = line
        .strip_prefix("- ")
        .or_else(|| line.strip_prefix("* "))
        .or_else(|| line.strip_prefix("+ "))
    {
        return Some(rest);
    }
    let digits = line.chars().take_while(char::is_ascii_digit).count();
    (digits > 0)
        .then(|| line.get(digits..))
        .flatten()
        .and_then(|rest| rest.strip_prefix(". ").or_else(|| rest.strip_prefix(") ")))
}

/// `#tag` words: a `#` at a word's start followed by letters, marks (so
/// Devanagari tags like `#काम` hold together), digits, `_`, `-` or `/`. A
/// heading's `# ` is not one, nor is `#` inside a word or a link.
fn tags_in(line: &str) -> Vec<String> {
    let mut tags = Vec::new();
    let mut previous: Option<char> = None;
    let mut chars = line.char_indices().peekable();
    while let Some((at, c)) = chars.next() {
        let starts_word = previous.is_none_or(char::is_whitespace);
        previous = Some(c);
        if c != '#' || !starts_word {
            continue;
        }
        let rest = &line[at + 1..];
        let tag: String = rest.chars().take_while(|&c| tag_char(c)).collect();
        let tag = tag.trim_end_matches(['-', '/']).to_owned();
        if tag.chars().any(char::is_alphabetic) {
            tags.push(tag);
        }
        // Skip past it, so `#a#b` is one tag.
        while chars.peek().is_some_and(|(_, c)| tag_char(*c)) {
            previous = chars.next().map(|(_, c)| c);
        }
    }
    tags
}

fn tag_char(c: char) -> bool {
    c.is_alphanumeric() || is_mark(c) || matches!(c, '_' | '-' | '/')
}

/// Combining marks, which `is_alphanumeric` leaves out: Devanagari's vowel
/// signs and virama among them.
fn is_mark(c: char) -> bool {
    matches!(c, '\u{0900}'..='\u{0903}' | '\u{093A}'..='\u{094F}' | '\u{0951}'..='\u{0957}' | '\u{0962}'..='\u{0963}')
        || matches!(c, '\u{0300}'..='\u{036F}')
}

/// `[[Note]]`, `[[Note|shown as]]` and `[[Note#Heading]]`, by the note named.
fn links_in(line: &str) -> Vec<String> {
    let mut links = Vec::new();
    let mut rest = line;
    while let Some(start) = rest.find("[[") {
        let after = &rest[start + 2..];
        let Some(end) = after.find("]]") else { break };
        let inner = &after[..end];
        let target = inner.split(['|', '#']).next().unwrap_or("").trim();
        if !target.is_empty() {
            links.push(target.to_owned());
        }
        rest = &after[end + 2..];
    }
    links
}

/// The first line of `body` that links to the note keyed `target_key` (see
/// [`super::key`]), plain: what "Linked from" shows.
pub fn linking_line(body: &str, target_key: &str) -> Option<String> {
    body.lines()
        .find(|line| {
            links_in(line)
                .iter()
                .any(|link| super::key(link) == target_key)
        })
        .map(|line| plain_line(line.trim()))
}

/// A line without its Markdown: heading marks, list and checklist markers,
/// quote marks, emphasis, `[[` brackets and links' targets.
fn plain_line(line: &str) -> String {
    let mut text = line.trim_start_matches('#').trim_start();
    text = text.trim_start_matches('>').trim_start();
    if let Some(rest) = list_marker(text) {
        text = rest;
    }
    if task_state(line).is_some() {
        text = text.get(3..).unwrap_or("").trim_start();
    }
    let mut out = String::with_capacity(text.len());
    let mut rest = text;
    while !rest.is_empty() {
        if let Some(after) = rest.strip_prefix("[[")
            && let Some(end) = after.find("]]")
        {
            let inner = &after[..end];
            out.push_str(inner.rsplit('|').next().unwrap_or(inner));
            rest = &after[end + 2..];
            continue;
        }
        let mut chars = rest.chars();
        let c = chars.next().unwrap_or_default();
        if !matches!(c, '*' | '_' | '`' | '~' | '=') {
            out.push(c);
        }
        rest = chars.as_str();
    }
    out.split_whitespace().collect::<Vec<_>>().join(" ")
}

/// A file name for a note titled `title`: the title with the characters no
/// file system accepts taken out, cut to a sensible length; `Untitled` for
/// none.
pub fn file_stem(title: &str) -> String {
    let cleaned: String = title
        .chars()
        .map(|c| match c {
            '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => ' ',
            c if c.is_control() => ' ',
            c => c,
        })
        .collect();
    let stem = cleaned
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .trim_matches('.')
        .chars()
        .take(STEM_CHARS)
        .collect::<String>()
        .trim()
        .to_owned();
    if stem.is_empty() {
        "Untitled".to_owned()
    } else {
        stem
    }
}

/// The note as text to paste into a message: Markdown taken out, checklist
/// items as ☐ and ☑, headings as plain lines, links as their names.
pub fn plain_text(text: &str) -> String {
    let mut lines = Vec::new();
    for line in text.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with("```") || trimmed.starts_with("~~~") {
            continue;
        }
        let plain = plain_line(trimmed);
        let line = match task_state(line) {
            Some(true) => format!("☑ {plain}"),
            Some(false) => format!("☐ {plain}"),
            None if list_marker(trimmed).is_some()
                && !trimmed.starts_with(|c: char| c.is_ascii_digit()) =>
            {
                format!("• {plain}")
            }
            None => plain,
        };
        lines.push(line);
    }
    let joined = lines.join("\n");
    // No runs of more than one blank line.
    let mut out = String::with_capacity(joined.len());
    let mut blanks = 0;
    for line in joined.lines() {
        blanks = if line.is_empty() { blanks + 1 } else { 0 };
        if blanks < 2 {
            out.push_str(line);
            out.push('\n');
        }
    }
    out.trim().to_owned()
}

/// `text` without its ticked checklist lines.
pub fn remove_ticked(text: &str) -> String {
    let kept: Vec<&str> = text
        .lines()
        .filter(|line| task_state(line) != Some(true))
        .collect();
    let mut out = kept.join("\n");
    if text.ends_with('\n') {
        out.push('\n');
    }
    out
}

/// `text` with the checklist item on line `index` (from 0) ticked or
/// unticked; unchanged when that line is not one.
pub fn toggle_task(text: &str, index: usize) -> String {
    let mut lines: Vec<String> = text.lines().map(str::to_owned).collect();
    if let Some(line) = lines.get_mut(index)
        && let Some(done) = task_state(line)
        && let Some(open) = line.find('[')
    {
        line.replace_range(open + 1..open + 2, if done { " " } else { "x" });
    }
    let mut out = lines.join("\n");
    if text.ends_with('\n') {
        out.push('\n');
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_title_preview_tags_links_and_tasks() {
        let text = "# Budget review\n\nWith Ramesh, following [[Budget 2083]].\n\n- [ ] Send the sheet #office\n- [x] Book the room\n```\n# not a heading #nottag\n- [ ] not a task\n```\nकाम बाँकी #काम\n";
        let facts = facts(text);
        assert_eq!(facts.title, "Budget review");
        assert_eq!(facts.preview, "With Ramesh, following Budget 2083.");
        assert_eq!(facts.tags, ["office", "काम"]);
        assert_eq!(facts.links, ["Budget 2083"]);
        assert_eq!((facts.open_tasks, facts.done_tasks), (1, 1));
    }

    #[test]
    fn a_heading_is_not_a_tag_and_links_keep_their_target() {
        assert!(tags_in("# Heading").is_empty());
        assert!(tags_in("issue#12").is_empty());
        assert_eq!(tags_in("#work/sajilo and #2083"), ["work/sajilo"]);
        assert_eq!(
            links_in("[[Trip|the trip]] and [[Budget#Q2]]"),
            ["Trip", "Budget"]
        );
    }

    #[test]
    fn titles_become_safe_file_names() {
        assert_eq!(file_stem("Budget: Q2 / Q3?"), "Budget Q2 Q3");
        assert_eq!(file_stem("   "), "Untitled");
        assert_eq!(file_stem("पोखरा यात्रा"), "पोखरा यात्रा");
        assert_eq!(file_stem("..hidden"), "hidden");
    }

    #[test]
    fn copies_as_message_text() {
        let text = "# Trip\n- [ ] Hotel\n- [x] **Bus**\n- snacks\n\n\n\nSee [[Budget 2083]]";
        assert_eq!(
            plain_text(text),
            "Trip\n☐ Hotel\n☑ Bus\n• snacks\n\nSee Budget 2083"
        );
    }

    #[test]
    fn ticks_and_removes_checklist_items() {
        let text = "Trip\n- [ ] Hotel\n- [x] Bus\n";
        assert_eq!(toggle_task(text, 1), "Trip\n- [x] Hotel\n- [x] Bus\n");
        assert_eq!(toggle_task(text, 0), text, "not a checklist line");
        assert_eq!(remove_ticked(text), "Trip\n- [ ] Hotel\n");
    }
}
