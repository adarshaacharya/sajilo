//! How much text the user may type into each kind of field.
//!
//! The commands that save what the user typed trim it and cut it to these
//! lengths, so over-long text is never stored however it arrives; the web UI
//! stops typing at the same lengths (`apps/desktop/src/shared/lib/limits.ts`,
//! kept equal by a test) so nobody types past a limit they can't see.

/// A plan's or a reminder's title.
pub const TITLE: usize = 120;
/// A person's name.
pub const NAME: usize = 80;
/// A short field: a relationship, a document number, an office, a fee.
pub const SHORT: usize = 120;
/// A note.
pub const NOTE: usize = 2000;
/// A web address.
pub const URL: usize = 500;
/// A checklist step.
pub const CHECKLIST_ITEM: usize = 120;
/// Most checklist steps one reminder keeps.
pub const CHECKLIST_ITEMS: usize = 50;
/// A field of one's own on a record: its label, and its value.
pub const FIELD_LABEL: usize = 60;
pub const FIELD_VALUE: usize = 500;
/// Most fields of one's own one record keeps.
pub const FIELDS: usize = 30;
/// A search box.
pub const SEARCH: usize = 100;

/// `text` without its surrounding spaces, cut to `max` characters.
pub fn clip(text: &str, max: usize) -> String {
    text.trim().chars().take(max).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn clips_by_characters_not_bytes() {
        assert_eq!(clip("  नमस्ते  ", 3), "नमस");
        assert_eq!(clip("  short  ", TITLE), "short");
        assert_eq!(clip(&"a".repeat(5000), NOTE).len(), NOTE);
    }

    /// The web UI's copy of these numbers must match, or a field would stop
    /// the user short of, or let them type past, what gets saved.
    #[test]
    fn the_web_ui_uses_the_same_limits() {
        let ts = include_str!("../../../apps/desktop/src/shared/lib/limits.ts");
        for (name, value) in [
            ("TITLE", TITLE),
            ("NAME", NAME),
            ("SHORT", SHORT),
            ("NOTE", NOTE),
            ("URL", URL),
            ("CHECKLIST_ITEM", CHECKLIST_ITEM),
            ("CHECKLIST_ITEMS", CHECKLIST_ITEMS),
            ("FIELD_LABEL", FIELD_LABEL),
            ("FIELD_VALUE", FIELD_VALUE),
            ("FIELDS", FIELDS),
            ("SEARCH", SEARCH),
        ] {
            let line = format!("  {name}: {value},");
            assert!(ts.contains(&line), "limits.ts should have `{line}`");
        }
    }
}
