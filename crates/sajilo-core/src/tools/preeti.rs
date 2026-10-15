//! Preeti, the font most Nepali offices typed in before Unicode, to Unicode
//! and back.
//!
//! Preeti is not an encoding but a font: it draws Devanagari shapes over
//! ordinary keyboard characters, so `g]kfn` *looks* like नेपाल only while the
//! Preeti font is applied. Converting it is a character table plus fixing the
//! order the typist pressed keys in, which follows how the letters look, not
//! how Unicode stores them:
//!
//! - `l` (ि) is typed *before* the consonant it follows in Unicode.
//! - `{` (the reph, र् on top) is typed *after* the syllable it sits over.
//! - Some letters are a half form plus `f` (ा): `)f` is ण, `if` is ष.
//! - `m` is a hook that changes the letter before it: `km` फ, `em` झ, `pm` ऊ,
//!   `qm` क्र, `Qm` क्त.
//! - Vowels are built from parts: `cf` आ, `cf]` ओ, `P}` ऐ, `O{` ई.
//!
//! Going back, Unicode is split into syllables and each is written the way a
//! Preeti typist would type it.

/// One Preeti key (or extended character) and what it draws.
const PREETI: [(char, &str); 120] = [
    ('a', "ब"),
    ('b', "द"),
    ('c', "अ"),
    ('d', "म"),
    ('e', "भ"),
    ('f', "ा"),
    ('g', "न"),
    ('h', "ज"),
    ('i', "ष्"),
    ('j', "व"),
    ('k', "प"),
    ('l', "ि"),
    ('n', "ल"),
    ('o', "य"),
    ('p', "उ"),
    ('q', "त्र"),
    ('r', "च"),
    ('s', "क"),
    ('t', "त"),
    ('u', "ग"),
    ('v', "ख"),
    ('w', "ध"),
    ('x', "ह"),
    ('y', "थ"),
    ('z', "श"),
    ('A', "ब्"),
    ('B', "द्य"),
    ('C', "ऋ"),
    ('D', "म्"),
    ('E', "भ्"),
    ('F', "ँ"),
    ('G', "न्"),
    ('H', "ज्"),
    ('I', "क्ष्"),
    ('J', "व्"),
    ('K', "प्"),
    ('L', "ी"),
    ('M', "ः"),
    ('N', "ल्"),
    ('O', "इ"),
    ('P', "ए"),
    ('Q', "त्त"),
    ('R', "च्"),
    ('S', "क्"),
    ('T', "त्"),
    ('U', "ग्"),
    ('V', "ख्"),
    ('W', "ध्"),
    ('X', "ह्"),
    ('Y', "थ्"),
    ('Z', "श्"),
    // The number row draws letters; shifted, it draws the digits.
    ('1', "ज्ञ"),
    ('2', "द्द"),
    ('3', "घ"),
    ('4', "द्ध"),
    ('5', "छ"),
    ('6', "ट"),
    ('7', "ठ"),
    ('8', "ड"),
    ('9', "ढ"),
    ('0', "ण्"),
    ('!', "१"),
    ('@', "२"),
    ('#', "३"),
    ('$', "४"),
    ('%', "५"),
    ('^', "६"),
    ('&', "७"),
    ('*', "८"),
    ('(', "९"),
    (')', "०"),
    ('`', "ञ"),
    ('~', "ञ्"),
    ('-', "("),
    ('_', ")"),
    ('=', "."),
    ('+', "ं"),
    ('[', "ृ"),
    (']', "े"),
    ('}', "ै"),
    ('\\', "्"),
    ('|', "्र"),
    (';', "स"),
    (':', "स्"),
    ('\'', "ु"),
    ('"', "ू"),
    (',', ","),
    ('.', "।"),
    ('<', "?"),
    ('>', "श्र"),
    ('/', "र"),
    ('?', "रु"),
    // Extended characters, typed with Alt codes.
    ('„', "ध्र"),
    ('…', "‘"),
    ('ˆ', "फ्"),
    ('‰', "झ्"),
    ('‹', "ङ्घ"),
    ('•', "ड्ड"),
    ('˜', "ऽ"),
    ('›', "द्र"),
    ('¡', "ज्ञ्"),
    ('¢', "द्घ"),
    ('£', "घ्"),
    ('¥', "्र"),
    ('§', "ट्ट"),
    ('ª', "ङ"),
    ('«', "्र"),
    ('´', "झ"),
    ('¶', "ठ्ठ"),
    ('¿', "रू"),
    ('Å', "हृ"),
    ('Æ', "”"),
    ('Ë', "ङ्ग"),
    ('Ì', "न्न"),
    ('Í', "ङ्क"),
    ('Î', "ङ्ख"),
    ('Ö', "="),
    ('Ø', "्य"),
    ('Ù', ";"),
    ('Ú', "’"),
];

/// A few more extended characters, kept apart so the table above stays a
/// plain list of what each key draws.
const PREETI_MORE: [(char, &str); 8] = [
    ('Û', "!"),
    ('Ü', "%"),
    ('Ý', "ट्ठ"),
    ('ß', "द्म"),
    ('å', "द्व"),
    ('æ', "“"),
    ('ç', "ॐ"),
    ('÷', "/"),
];

const VIRAMA: char = '्';
const RA: char = 'र';
/// Placeholders that survive the table lookup and are resolved afterwards.
const HOOK: char = 'm';
const REPH: char = '{';

fn is_consonant(c: char) -> bool {
    ('क'..='ह').contains(&c)
}

/// Signs that sit on a letter: vowel signs and the nasal and visarga marks.
fn is_sign(c: char) -> bool {
    matches!(
        c,
        'ा' | 'ि' | 'ी' | 'ु' | 'ू' | 'ृ' | 'े' | 'ै' | 'ो' | 'ौ' | 'ं' | 'ः' | 'ँ'
    )
}

fn lookup(c: char) -> Option<&'static str> {
    PREETI
        .iter()
        .chain(PREETI_MORE.iter())
        .find(|(key, _)| *key == c)
        .map(|(_, text)| *text)
}

/// Text typed in Preeti, as Unicode. Anything that isn't a Preeti character
/// (spaces, newlines, Unicode already there) is kept as it is.
pub fn to_unicode(text: &str) -> String {
    let mut out = String::with_capacity(text.len() * 3);
    let mut word = String::new();
    for c in text.chars() {
        if c.is_whitespace() {
            out.push_str(&word_to_unicode(&word));
            word.clear();
            out.push(c);
        } else {
            word.push(c);
        }
    }
    out.push_str(&word_to_unicode(&word));
    out
}

/// One whitespace-free run. The reordering rules never reach across a space.
fn word_to_unicode(word: &str) -> String {
    if word.is_empty() {
        return String::new();
    }
    let mut s: Vec<char> = Vec::with_capacity(word.len() * 2);
    for c in word.chars() {
        match lookup(c) {
            Some(text) => s.extend(text.chars()),
            None => s.push(c),
        }
    }

    // A half letter and ा make the full letter: `)f` ण, `if` ष.
    let mut i = 0;
    while i + 1 < s.len() {
        if s[i] == VIRAMA && s[i + 1] == 'ा' {
            s.drain(i..i + 2);
        } else {
            i += 1;
        }
    }

    resolve_hooks(&mut s);
    replace(&mut s, "इ{", "ई");
    move_short_i(&mut s);
    move_reph(&mut s);
    move_signs_past_half_letters(&mut s);
    move_nasals_last(&mut s);

    let mut text: String = s.into_iter().collect();
    // A key pressed twice by habit draws one mark.
    for doubled in ["ँँ", "ंं", "ेे", "ैै", "ुु", "ूू"] {
        let once = &doubled[..doubled.len() / 2];
        while text.contains(doubled) {
            text = text.replace(doubled, once);
        }
    }
    // ः on its own at the start of a word is a colon.
    if let Some(rest) = text.strip_prefix('ः') {
        text = format!(":{rest}");
    }
    for (from, to) in [
        ("टृ", "ट्ट"),
        ("ेा", "ाे"),
        ("ैा", "ाै"),
        ("अाे", "ओ"),
        ("अाै", "औ"),
        ("अा", "आ"),
        ("एे", "ऐ"),
        ("एै", "ऐ"),
        ("ाे", "ो"),
        ("ाै", "ौ"),
    ] {
        text = text.replace(from, to);
    }
    text
}

fn replace(s: &mut Vec<char>, from: &str, to: &str) {
    let text: String = s.iter().collect();
    if text.contains(from) {
        *s = text.replace(from, to).chars().collect();
    }
}

/// `m` changes the letter before it, past any signs already on it:
/// प → फ, भ → झ, उ → ऊ, त्र → क्र, त्त → क्त. Anywhere else it is left alone.
fn resolve_hooks(s: &mut Vec<char>) {
    let mut i = 0;
    while i < s.len() {
        if s[i] != HOOK {
            i += 1;
            continue;
        }
        let mut base = i;
        while base > 0 && is_sign(s[base - 1]) {
            base -= 1;
        }
        let Some(b) = base.checked_sub(1) else {
            i += 1;
            continue;
        };
        let changed = match s[b] {
            'प' => Some((b, 'फ')),
            'भ' => Some((b, 'झ')),
            'उ' => Some((b, 'ऊ')),
            // त्र and त्त: the hook turns the first त into क.
            'र' | 'त' if b >= 2 && s[b - 1] == VIRAMA && s[b - 2] == 'त' => {
                Some((b - 2, 'क'))
            }
            _ => None,
        };
        match changed {
            Some((at, letter)) => {
                s[at] = letter;
                s.remove(i);
            }
            None => i += 1,
        }
    }
}

/// Where a consonant cluster starting at `start` ends (inclusive): the
/// consonant, then any `्` + consonant joined on.
fn cluster_end(s: &[char], start: usize) -> usize {
    let mut end = start;
    while end + 2 < s.len() && s[end + 1] == VIRAMA && is_consonant(s[end + 2]) {
        end += 2;
    }
    end
}

/// ि was typed before its cluster; Unicode keeps it after.
fn move_short_i(s: &mut Vec<char>) {
    let mut i = 0;
    while i + 1 < s.len() {
        if s[i] == 'ि' && is_consonant(s[i + 1]) {
            let end = cluster_end(s, i + 1);
            s.remove(i);
            s.insert(end, 'ि');
            i = end + 1;
        } else {
            i += 1;
        }
    }
}

/// The reph was typed after its syllable; Unicode puts र् before it.
fn move_reph(s: &mut Vec<char>) {
    while let Some(i) = s.iter().position(|&c| c == REPH) {
        let mut start = i;
        while start > 0 && is_sign(s[start - 1]) {
            start -= 1;
        }
        if start > 0 && (is_consonant(s[start - 1]) || is_vowel_letter(s[start - 1])) {
            start -= 1;
            while start >= 2 && s[start - 1] == VIRAMA && is_consonant(s[start - 2]) {
                start -= 2;
            }
        }
        s.remove(i);
        s.splice(start..start, [RA, VIRAMA]);
    }
}

fn is_vowel_letter(c: char) -> bool {
    ('अ'..='औ').contains(&c)
}

/// A sign typed before a half letter belongs after the letter it joins:
/// signs then `्X…` become `्X…` then signs, and the same with the `्` first.
fn move_signs_past_half_letters(s: &mut Vec<char>) {
    let mut i = 0;
    while i < s.len() {
        let lead = usize::from(s[i] == VIRAMA);
        let signs_start = i + lead;
        let mut signs_end = signs_start;
        while signs_end < s.len() && is_sign(s[signs_end]) && s[signs_end] != 'ि' {
            signs_end += 1;
        }
        if signs_end == signs_start {
            i += 1;
            continue;
        }
        // What the signs jump: `्` + cluster when there was no leading `्`,
        // or just the cluster after one.
        let cluster_start = if lead == 1 {
            signs_end
        } else if signs_end + 1 < s.len() && s[signs_end] == VIRAMA {
            signs_end + 1
        } else {
            i = signs_end;
            continue;
        };
        if cluster_start >= s.len() || s[cluster_start] == VIRAMA {
            i = signs_end;
            continue;
        }
        let end = cluster_end(s, cluster_start);
        let signs: Vec<char> = s.drain(signs_start..signs_end).collect();
        let at = end + 1 - signs.len();
        s.splice(at..at, signs);
        i = end + 1;
    }
}

/// ं and ँ typed before a vowel sign go after it.
fn move_nasals_last(s: &mut [char]) {
    let mut i = 0;
    while i + 1 < s.len() {
        if matches!(s[i], 'ं' | 'ँ') && is_sign(s[i + 1]) && !matches!(s[i + 1], 'ं' | 'ँ')
        {
            s.swap(i, i + 1);
            i = i.saturating_sub(1);
        } else {
            i += 1;
        }
    }
}

/// How a consonant is typed: whole, and as a half letter. `None` for a half
/// means the letter has no half shape and is typed whole plus `\` (्).
fn consonant_keys(c: char) -> (&'static str, Option<&'static str>) {
    match c {
        'क' => ("s", Some("S")),
        'ख' => ("v", Some("V")),
        'ग' => ("u", Some("U")),
        'घ' => ("3", Some("£")),
        'ङ' => ("ª", None),
        'च' => ("r", Some("R")),
        'छ' => ("5", None),
        'ज' => ("h", Some("H")),
        'झ' => ("´", Some("‰")),
        'ञ' => ("`", Some("~")),
        'ट' => ("6", None),
        'ठ' => ("7", None),
        'ड' => ("8", None),
        'ढ' => ("9", None),
        'ण' => (")f", Some(")")),
        'त' => ("t", Some("T")),
        'थ' => ("y", Some("Y")),
        'द' => ("b", None),
        'ध' => ("w", Some("W")),
        'न' => ("g", Some("G")),
        'प' => ("k", Some("K")),
        'फ' => ("km", Some("ˆ")),
        'ब' => ("a", Some("A")),
        'भ' => ("e", Some("E")),
        'म' => ("d", Some("D")),
        'य' => ("o", None),
        'र' => ("/", None),
        'ल' => ("n", Some("N")),
        'व' => ("j", Some("J")),
        'श' => ("z", Some("Z")),
        'ष' => ("if", Some("i")),
        'स' => (";", Some(":")),
        'ह' => ("x", Some("X")),
        _ => ("", None),
    }
}

/// Clusters Preeti draws as one shape: the letters, then how the whole
/// cluster and its half form are typed. Longest first.
const LIGATURES: [(&str, &str, Option<&str>); 24] = [
    ("क्ष", "If", Some("I")),
    ("ज्ञ", "1", Some("¡")),
    ("क्र", "qm", None),
    ("क्त", "Qm", None),
    ("त्र", "q", None),
    ("त्त", "Q", None),
    ("द्ध", "4", None),
    ("द्द", "2", None),
    ("द्य", "B", None),
    ("द्र", "›", None),
    ("द्व", "å", None),
    ("द्म", "ß", None),
    ("द्घ", "¢", None),
    ("श्र", ">", None),
    ("ध्र", "„", None),
    ("ट्ट", "§", None),
    ("ट्ठ", "Ý", None),
    ("ठ्ठ", "¶", None),
    ("ड्ड", "•", None),
    ("ङ्ग", "Ë", None),
    ("ङ्क", "Í", None),
    ("ङ्ख", "Î", None),
    ("ङ्घ", "‹", None),
    ("न्न", "Ì", None),
];

fn vowel_letter_keys(c: char) -> Option<&'static str> {
    Some(match c {
        'अ' => "c",
        'आ' => "cf",
        'इ' => "O",
        'ई' => "O{",
        'उ' => "p",
        'ऊ' => "pm",
        'ऋ' => "C",
        'ए' => "P",
        'ऐ' => "P}",
        'ओ' => "cf]",
        'औ' => "cf}",
        _ => return None,
    })
}

fn sign_keys(c: char) -> &'static str {
    match c {
        'ा' => "f",
        'ी' => "L",
        'ु' => "'",
        'ू' => "\"",
        'ृ' => "[",
        'े' => "]",
        'ै' => "}",
        'ो' => "f]",
        'ौ' => "f}",
        'ं' => "+",
        'ँ' => "F",
        'ः' => "M",
        _ => "",
    }
}

fn other_keys(c: char) -> Option<&'static str> {
    Some(match c {
        '०' | '0' => ")",
        '१' | '1' => "!",
        '२' | '2' => "@",
        '३' | '3' => "#",
        '४' | '4' => "$",
        '५' | '5' => "%",
        '६' | '6' => "^",
        '७' | '7' => "&",
        '८' | '8' => "*",
        '९' | '9' => "(",
        '।' => ".",
        '.' => "=",
        '(' => "-",
        ')' => "_",
        '?' => "<",
        '/' => "÷",
        ';' => "Ù",
        '!' => "Û",
        '%' => "Ü",
        '=' => "Ö",
        '+' => "±",
        ':' => "M",
        '\'' | '’' => "Ú",
        '‘' => "…",
        '“' => "æ",
        '”' => "Æ",
        'ॐ' => "ç",
        'ऽ' => "˜",
        VIRAMA => "\\",
        _ => return None,
    })
}

/// Unicode Nepali, as keys typed in Preeti. Paste the result into a document
/// set in the Preeti font. English letters have no Preeti form and are kept
/// as they are, which Preeti will draw as Nepali.
pub fn from_unicode(text: &str) -> String {
    let chars: Vec<char> = text.chars().collect();
    let mut out = String::with_capacity(text.len());
    let mut i = 0;
    while i < chars.len() {
        let c = chars[i];
        if is_consonant(c) {
            let mut letters = vec![c];
            i += 1;
            while i + 1 < chars.len() && chars[i] == VIRAMA && is_consonant(chars[i + 1]) {
                letters.push(chars[i + 1]);
                i += 2;
            }
            let halant = i < chars.len() && chars[i] == VIRAMA;
            if halant {
                i += 1;
            }
            let start = i;
            while i < chars.len() && is_sign(chars[i]) {
                i += 1;
            }
            write_syllable(&mut out, &letters, halant, &chars[start..i]);
        } else if let Some(keys) = vowel_letter_keys(c) {
            out.push_str(keys);
            i += 1;
            while i < chars.len() && is_sign(chars[i]) {
                out.push_str(sign_keys(chars[i]));
                i += 1;
            }
        } else if let Some(keys) = other_keys(c) {
            out.push_str(keys);
            i += 1;
        } else {
            out.push(c);
            i += 1;
        }
    }
    out
}

/// One syllable: its consonants (र first means a reph), whether it ends on a
/// bare `्`, and the signs on it.
fn write_syllable(out: &mut String, letters: &[char], halant: bool, signs: &[char]) {
    let (reph, letters) = match letters {
        [RA, rest @ ..] if !rest.is_empty() => (true, rest),
        _ => (false, letters),
    };
    let mut signs = signs.to_vec();

    if let Some(at) = signs.iter().position(|&s| s == 'ि') {
        signs.remove(at);
        out.push('l');
    }

    // रु and रू have shapes of their own.
    if !reph && !halant && letters == [RA] && matches!(signs.first(), Some('ु' | 'ू')) {
        out.push(if signs.remove(0) == 'ु' { '?' } else { '¿' });
    } else {
        write_letters(out, letters, halant);
    }

    let (nasals, vowels): (Vec<char>, Vec<char>) =
        signs.into_iter().partition(|s| matches!(s, 'ं' | 'ँ' | 'ः'));
    for s in vowels {
        out.push_str(sign_keys(s));
    }
    if reph {
        out.push(REPH);
    }
    for s in nasals {
        out.push_str(sign_keys(s));
    }
}

fn write_letters(out: &mut String, letters: &[char], halant: bool) {
    let mut i = 0;
    while i < letters.len() {
        let last_whole = |end: usize| end == letters.len() && !halant;
        if let Some((len, whole, half)) = ligature_at(&letters[i..]) {
            let end = i + len;
            if end + 1 == letters.len() && letters[end] == RA && !halant {
                out.push_str(whole);
                out.push('|');
                return;
            }
            if last_whole(end) {
                out.push_str(whole);
            } else if let Some(half) = half {
                out.push_str(half);
            } else {
                out.push_str(whole);
                out.push('\\');
            }
            i = end;
            continue;
        }
        let (whole, half) = consonant_keys(letters[i]);
        // A trailing र joins as the stroke below the letter before it.
        if i + 2 == letters.len() && letters[i + 1] == RA && !halant {
            out.push_str(whole);
            out.push('|');
            return;
        }
        if last_whole(i + 1) {
            out.push_str(whole);
        } else if let Some(half) = half {
            out.push_str(half);
        } else {
            out.push_str(whole);
            out.push('\\');
        }
        i += 1;
    }
}

/// The longest ligature at the start of `letters`, if any.
fn ligature_at(letters: &[char]) -> Option<(usize, &'static str, Option<&'static str>)> {
    LIGATURES.iter().find_map(|(cluster, whole, half)| {
        let parts: Vec<char> = cluster.chars().filter(|&c| c != VIRAMA).collect();
        letters
            .starts_with(&parts)
            .then_some((parts.len(), *whole, *half))
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn everyday_preeti() {
        for (preeti, unicode) in [
            ("g]kfn", "नेपाल"),
            ("dfof", "माया"),
            ("s'df/", "कुमार"),
            ("lbg", "दिन"),
            ("x'G5", "हुन्छ"),
            ("uPsf]", "गएको"),
            ("5}g", "छैन"),
            ("/fd|f]", "राम्रो"),
            ("u|fdL0f", "ग्रामीण"),
            ("sfo{qmd", "कार्यक्रम"),
            ("lj1fg", "विज्ञान"),
            ("zlQm", "शक्ति"),
            ("O{Zj/", "ईश्वर"),
            ("cf]v/L", "ओखरी"),
            ("Pp6f", "एउटा"),
            ("km'n", "फुल"),
            ("/fi6«", "राष्ट्र"),
            ("If]q", "क्षेत्र"),
            ("sLlt{", "कीर्ति"),
            ("j\"bf", "वूदा"),
        ] {
            assert_eq!(to_unicode(preeti), unicode, "{preeti}");
        }
    }

    #[test]
    fn sentences_keep_their_spaces_and_lines() {
        assert_eq!(
            to_unicode("d}n] g]kfn b]v]F.\nwGojfb"),
            "मैले नेपाल देखेँ।\nधन्यवाद"
        );
    }

    #[test]
    fn digits_are_the_shifted_number_row() {
        assert_eq!(to_unicode("@)*#"), "२०८३");
        assert_eq!(from_unicode("२०८३"), "@)*#");
        assert_eq!(from_unicode("2083"), "@)*#");
    }

    #[test]
    fn unicode_to_preeti_types_it_the_preeti_way() {
        for (unicode, preeti) in [
            ("नेपाल", "g]kfn"),
            ("दिन", "lbg"),
            ("कार्यक्रम", "sfo{qmd"),
            ("विज्ञान", "lj1fg"),
            ("राम्रो", "/fd|f]"),
            ("रुख", "?v"),
            ("फूल", "km\"n"),
            ("अङ्ग्रेजी", "cË|]hL"),
            ("ओखरी", "cf]v/L"),
        ] {
            assert_eq!(from_unicode(unicode), preeti, "{unicode}");
        }
    }

    #[test]
    fn unicode_survives_the_round_trip() {
        let text = "नमस्ते, मेरो नाम सीता हो। आज बिहान ७ बजे काठमाडौँमा पानी पर्‍यो। \
                    कार्यक्रम शुक्रबार हुनेछ। धन्यवाद! विद्यार्थी, राष्ट्रिय, क्षेत्र, \
                    ज्ञान, शक्ति, उद्देश्य, सम्पत्ति, चिट्ठी, अङ्ग्रेजी, ईश्वर, ऐतिहासिक, \
                    औषधि, ऊन, कृषि, पौष, गर्छन्, स्त्री, प्रधानमन्त्री, सर्वोच्च";
        for word in text.split_whitespace() {
            assert_eq!(
                to_unicode(&from_unicode(word)),
                word,
                "{word} via {}",
                from_unicode(word)
            );
        }
    }

    #[test]
    fn what_is_not_preeti_is_left_alone() {
        assert_eq!(to_unicode("नेपाल g]kfn"), "नेपाल नेपाल");
        assert_eq!(to_unicode(""), "");
    }
}
