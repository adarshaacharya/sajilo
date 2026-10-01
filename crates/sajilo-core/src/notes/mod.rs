//! Notes: plain Markdown files, read and written by the desktop shell. What
//! lives here is pure: what a note's text says about itself (title, preview,
//! tags, links, checklist), where a jot lands in today's note, what a note is
//! called on disk, and typing Nepali in English letters.

pub mod jot;
pub mod nepali;
pub mod parse;

pub use jot::append_jot;
pub use parse::{
    NoteFacts, facts, file_stem, linking_line, plain_text, remove_ticked, toggle_task,
};

use crate::NepaliDate;
use crate::focus::Language;

/// The form names are compared and looked up in: Unicode NFC (so the same
/// Devanagari typed on two keyboards matches), trimmed, lower case.
pub fn key(name: &str) -> String {
    use unicode_normalization::UnicodeNormalization;
    name.trim().nfc().collect::<String>().to_lowercase()
}

/// Text as stored: NFC, so search and links see one form of each word.
pub fn normalized(text: &str) -> String {
    use unicode_normalization::UnicodeNormalization;
    text.nfc().collect()
}

/// The folders Notes starts with, besides Daily.
pub const DEFAULT_FOLDERS: [&str; 2] = ["Office", "Personal"];

/// The folder daily notes go in.
pub const DAILY_FOLDER: &str = "Daily";

/// Today's note's file name, sortable: `2083-06-14`.
pub fn daily_stem(date: NepaliDate) -> String {
    format!("{:04}-{:02}-{:02}", date.year, date.month, date.day)
}

/// Today's note's first line, its title: `Ashwin 14, 2083` or `असोज १४, २०८३`.
pub fn daily_title(date: NepaliDate, language: Language) -> String {
    match language {
        Language::En => format!("{} {}, {}", date.english_month_name(), date.day, date.year),
        Language::Ne => format!(
            "{} {}, {}",
            date.nepali_month_name(),
            crate::numerals::devanagari(i64::from(date.day), None),
            crate::numerals::devanagari(date.year, None)
        ),
    }
}

/// The note Notes starts with, in the app's language: what a first-time
/// user needs, in five lines, and deletable.
pub fn welcome_note(language: Language) -> &'static str {
    match language {
        Language::En => WELCOME_EN,
        Language::Ne => WELCOME_NE,
    }
}

const WELCOME_EN: &str = "Welcome to Notes

The first line is the title. Just start typing.

- [ ] Type [] and a space to make a checklist; Enter adds the next one
- [ ] Tick this one off

Link notes with [[ and tag them with #ideas.

Tap ने to type Nepali in English letters: mero naam becomes मेरो नाम.

Delete this note any time.
";

const WELCOME_NE: &str = "नोटमा स्वागत छ

पहिलो लाइन नै शीर्षक हो। लेख्न थाल्नुहोस्।

- [ ] चेकलिस्ट बनाउन [] अनि स्पेस थिच्नुहोस्; Enter थिचे अर्को आउँछ
- [ ] यसमा टिक लगाउनुहोस्

[[ ले नोटहरू जोड्नुहोस्, #विचार जस्ता ट्याग लगाउनुहोस्।

अंग्रेजी अक्षरमा नेपाली लेख्न ने थिच्नुहोस्: mero naam लेखे मेरो नाम हुन्छ।

यो नोट जुनसुकै बेला हटाउन सक्नुहुन्छ।
";
