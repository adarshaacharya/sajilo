//! Typing Nepali in English letters: `mero naam` → `मेरो नाम`.
//!
//! The scheme most Nepali typists already know from phones and Google's
//! input: consonants carry an `a` unless a vowel follows (`k` → क, `ki` → कि),
//! two consonants in a row join (`garne` → गर्ने), a word may end on a bare
//! consonant without a virama (`naam` → नाम), and capitals pick the letters
//! English doesn't have (`T` ट, `D` ड, `N` ण, `Sh` ष, `M` ं, `H` ः). `~` is
//! the chandrabindu (ँ). A word's first letter is read as lower case, so a
//! capital at the start of a sentence doesn't turn into ं.
//!
//! A single `a` is always the vowel a consonant already carries, even at a
//! word's end: `khaanaa` is खाना and `garna` is गर्न. Guessing that a final
//! `a` meant ा would need a dictionary, and would guess wrong as often.

/// Consonants, longest first so `chh` wins over `ch` and `c`.
const CONSONANTS: [(&str, &str); 40] = [
    ("ksh", "क्ष"),
    ("chh", "छ"),
    ("gy", "ज्ञ"),
    ("kh", "ख"),
    ("gh", "घ"),
    ("ng", "ङ"),
    ("ch", "च"),
    ("jh", "झ"),
    ("ny", "ञ"),
    ("Th", "ठ"),
    ("Dh", "ढ"),
    ("th", "थ"),
    ("dh", "ध"),
    ("ph", "फ"),
    ("bh", "भ"),
    ("Sh", "ष"),
    ("sh", "श"),
    ("k", "क"),
    ("g", "ग"),
    ("c", "च"),
    ("j", "ज"),
    ("T", "ट"),
    ("D", "ड"),
    ("N", "ण"),
    ("t", "त"),
    ("d", "द"),
    ("n", "न"),
    ("p", "प"),
    ("f", "फ"),
    ("b", "ब"),
    ("m", "म"),
    ("y", "य"),
    ("r", "र"),
    ("l", "ल"),
    ("w", "व"),
    ("v", "व"),
    ("s", "स"),
    ("h", "ह"),
    ("q", "क"),
    ("z", "ज"),
];

/// Vowels: the letter on its own, and the sign after a consonant (none for
/// `a`, which a consonant already carries).
const VOWELS: [(&str, &str, &str); 17] = [
    ("aa", "आ", "ा"),
    ("ai", "ऐ", "ै"),
    ("au", "औ", "ौ"),
    ("ou", "औ", "ौ"),
    ("ee", "ई", "ी"),
    ("ii", "ई", "ी"),
    ("oo", "ऊ", "ू"),
    ("uu", "ऊ", "ू"),
    ("A", "आ", "ा"),
    ("I", "ई", "ी"),
    ("U", "ऊ", "ू"),
    ("R", "ऋ", "ृ"),
    ("a", "अ", ""),
    ("i", "इ", "ि"),
    ("u", "उ", "ु"),
    ("e", "ए", "े"),
    ("o", "ओ", "ो"),
];

const VIRAMA: &str = "्";

/// `text` with its English-letter words in Devanagari. With `finished`
/// false, only words already followed by a space or punctuation are turned,
/// so the one being typed is left alone until it ends.
pub fn transliterate(text: &str, finished: bool) -> String {
    let mut out = String::with_capacity(text.len() * 3);
    let mut word = String::new();
    for c in text.chars() {
        if c.is_ascii_alphabetic() || c == '~' {
            word.push(c);
            continue;
        }
        if !word.is_empty() {
            out.push_str(&word_to_devanagari(&word));
            word.clear();
        }
        out.push(c);
    }
    if !word.is_empty() {
        if finished {
            out.push_str(&word_to_devanagari(&word));
        } else {
            out.push_str(&word);
        }
    }
    out
}

/// One word, letters only.
pub fn word_to_devanagari(word: &str) -> String {
    // The first letter as lower case: sentence case, not ं.
    let mut chars = word.chars();
    let word: String = chars
        .next()
        .map(|first| first.to_ascii_lowercase())
        .into_iter()
        .chain(chars)
        .collect();

    let mut out = String::new();
    let mut after_consonant = false;
    let mut rest = word.as_str();
    'outer: while !rest.is_empty() {
        for (latin, letter, sign) in VOWELS {
            if let Some(after) = rest.strip_prefix(latin) {
                out.push_str(if after_consonant { sign } else { letter });
                after_consonant = false;
                rest = after;
                continue 'outer;
            }
        }
        for (latin, letter) in CONSONANTS {
            if let Some(after) = rest.strip_prefix(latin) {
                if after_consonant {
                    out.push_str(VIRAMA);
                }
                out.push_str(letter);
                after_consonant = true;
                rest = after;
                continue 'outer;
            }
        }
        let mut chars = rest.chars();
        let c = chars.next().unwrap_or_default();
        match c {
            'M' => out.push('ं'),
            'H' => out.push('ः'),
            '~' => out.push('ँ'),
            // Any other capital reads as its small letter.
            c if c.is_ascii_uppercase() => {
                let lower = c.to_ascii_lowercase().to_string() + chars.as_str();
                return out + &word_to_devanagari_after(&lower, after_consonant);
            }
            c => out.push(c),
        }
        after_consonant = false;
        rest = chars.as_str();
    }
    out
}

/// Carries on a word after a capital read as its small letter, keeping
/// whether a consonant came just before.
fn word_to_devanagari_after(rest: &str, after_consonant: bool) -> String {
    if after_consonant {
        // A placeholder consonant keeps the joining rules, then goes.
        let joined = word_to_devanagari(&format!("k{rest}"));
        joined.strip_prefix("क").unwrap_or(&joined).to_owned()
    } else {
        word_to_devanagari(rest)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn everyday_words() {
        for (latin, nepali) in [
            ("mero", "मेरो"),
            ("naam", "नाम"),
            ("garne", "गर्ने"),
            ("aaja", "आज"),
            ("chha", "छ"),
            ("kaam", "काम"),
            ("bholi", "भोलि"),
            ("dai", "दै"),
            ("khaanaa", "खाना"),
            ("khaana", "खान"),
            ("gyaan", "ज्ञान"),
            ("paTak", "पटक"),
            ("haru", "हरु"),
            ("bhaaShaa", "भाषा"),
            ("saMsaar", "संसार"),
            ("chaa~d", "चाँद"),
        ] {
            assert_eq!(word_to_devanagari(latin), nepali, "{latin}");
        }
    }

    #[test]
    fn a_capital_at_the_start_is_a_small_letter() {
        assert_eq!(word_to_devanagari("Mero"), "मेरो");
        assert_eq!(word_to_devanagari("Aaja"), "आज");
    }

    #[test]
    fn only_finished_words_turn_while_typing() {
        assert_eq!(transliterate("mero naa", false), "मेरो naa");
        assert_eq!(transliterate("mero naam", true), "मेरो नाम");
        assert_eq!(transliterate("aaja 3 baje, kaam.", false), "आज 3 बजे, काम.");
    }

    #[test]
    fn devanagari_already_there_is_left_alone() {
        assert_eq!(transliterate("नमस्ते timi", true), "नमस्ते तिमि");
    }
}
