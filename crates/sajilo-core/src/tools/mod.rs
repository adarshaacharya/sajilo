pub mod interest;
pub mod land;
pub mod nepali;
pub mod preeti;
pub mod units;
pub mod vat;

use serde::{Deserialize, Serialize};

/// What the Nepali typing tool turns text from and into.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum TypingMode {
    /// `mero naam` → `मेरो नाम`.
    Romanized,
    /// Text typed in the Preeti font → Unicode.
    PreetiToUnicode,
    /// Unicode → keys to paste into a Preeti document.
    UnicodeToPreeti,
}

/// The typing tool's whole answer for `text`. Romanized text is read as
/// finished, so the last word turns too, and a full stop after Nepali is the
/// Nepali one (।), as phone keyboards type it. A decimal point stays a point.
pub fn convert_typing(text: &str, mode: TypingMode) -> String {
    match mode {
        TypingMode::Romanized => purna_biram(&nepali::transliterate(text, true)),
        TypingMode::PreetiToUnicode => preeti::to_unicode(text),
        TypingMode::UnicodeToPreeti => preeti::from_unicode(text),
    }
}

/// `.` straight after a Devanagari letter or sign, as `।`.
fn purna_biram(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    let mut previous = None;
    for c in text.chars() {
        let after_nepali = previous.is_some_and(|p: char| ('\u{0900}'..='\u{0963}').contains(&p));
        out.push(if c == '.' && after_nepali { '।' } else { c });
        previous = Some(c);
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn romanized_sentences_end_on_a_purna_biram() {
        assert_eq!(
            convert_typing("mero naam sitaa ho. 3.5 kilo", TypingMode::Romanized),
            "मेरो नाम सिता हो। 3.5 किलो"
        );
    }

    #[test]
    fn each_mode_reaches_its_converter() {
        assert_eq!(convert_typing("g]kfn", TypingMode::PreetiToUnicode), "नेपाल");
        assert_eq!(convert_typing("नेपाल", TypingMode::UnicodeToPreeti), "g]kfn");
    }
}
