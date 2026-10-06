//! Rashifal readings — daily, weekly, monthly and yearly. Ported from
//! `Rashifal.swift`.

use crate::load_state::Freshness;

dto_enum! {
    /// The twelve rashi, in their canonical order.
    ///
    /// These are the same twelve divisions as the Bikram Sambat solar months,
    /// because a BS month is the span the sun spends in one rashi. That
    /// correspondence is deliberately *not* used to pick a reader's sign for
    /// them: in Nepali practice your rashi is normally the **moon** sign from
    /// your birth chart, or the one a jyotish assigned from the first syllable
    /// of your name. Deriving it from a birth date would give the sun sign and
    /// quietly hand most people the wrong reading, so the sign is always
    /// chosen by hand.
    pub enum RashiSign {
        Mesh,
        Vrish,
        Mithun,
        Karkat,
        Simha,
        Kanya,
        Tula,
        Vrishchik,
        Dhanu,
        Makar,
        Kumbha,
        Meen,
    }

    /// Which span a reading covers.
    #[derive(Default)]
    pub enum RashifalPeriod {
        #[default]
        Daily,
        Weekly,
        Monthly,
        Yearly,
    }

    /// Who published the readings on screen.
    #[derive(Default)]
    pub enum RashifalSource {
        #[default]
        HamroPatro,
        Ratopati,
    }
}

dto! {
    /// One sign's reading for the day.
    pub struct Rashifal {
        pub sign: RashiSign,
        /// The astrologer's words, carried verbatim. Never trimmed,
        /// summarised, or reflowed — it is someone's writing, and Sajilo shows
        /// it as published.
        pub prediction: String,
        /// The day's lucky colour, when the reading names one ("आजको शुभ
        /// रंग सेतो…"). Lifted out of the text, which keeps saying it too.
        #[serde(default)]
        pub lucky_colour: Option<String>,
        /// The day's lucky number, as written (Devanagari digits).
        #[serde(default)]
        pub lucky_number: Option<String>,
    }

    pub struct RashifalSnapshot {
        pub readings: Vec<Rashifal>,
        #[serde(default)]
        pub period: RashifalPeriod,
        /// The span as the source names it: "साप्ताहिक राशिफल असोज २०८३, साता ३".
        #[serde(default)]
        pub title: Option<String>,
        #[serde(default)]
        pub source: RashifalSource,
        pub freshness: Freshness,
    }
}

impl RashiSign {
    pub const ALL: [Self; 12] = [
        Self::Mesh,
        Self::Vrish,
        Self::Mithun,
        Self::Karkat,
        Self::Simha,
        Self::Kanya,
        Self::Tula,
        Self::Vrishchik,
        Self::Dhanu,
        Self::Makar,
        Self::Kumbha,
        Self::Meen,
    ];

    /// As Hamro Patro heads each section.
    pub fn nepali_name(self) -> &'static str {
        match self {
            Self::Mesh => "मेष",
            Self::Vrish => "वृष",
            Self::Mithun => "मिथुन",
            Self::Karkat => "कर्कट",
            Self::Simha => "सिंह",
            Self::Kanya => "कन्या",
            Self::Tula => "तुला",
            Self::Vrishchik => "वृश्चिक",
            Self::Dhanu => "धनु",
            Self::Makar => "मकर",
            Self::Kumbha => "कुम्भ",
            Self::Meen => "मीन",
        }
    }

    /// Romanised Nepali rather than the Western equivalent: someone who knows
    /// they are Mesh does not necessarily think of themselves as Aries.
    pub fn display_name(self) -> &'static str {
        match self {
            Self::Mesh => "Mesh",
            Self::Vrish => "Vrish",
            Self::Mithun => "Mithun",
            Self::Karkat => "Karkat",
            Self::Simha => "Simha",
            Self::Kanya => "Kanya",
            Self::Tula => "Tula",
            Self::Vrishchik => "Vrishchik",
            Self::Dhanu => "Dhanu",
            Self::Makar => "Makar",
            Self::Kumbha => "Kumbha",
            Self::Meen => "Meen",
        }
    }
}

impl RashifalSnapshot {
    pub fn reading(&self, sign: RashiSign) -> Option<&Rashifal> {
        self.readings.iter().find(|reading| reading.sign == sign)
    }
}

impl Rashifal {
    /// A reading, with its lucky colour and number read out of the text.
    pub fn new(sign: RashiSign, prediction: String) -> Self {
        let (lucky_colour, lucky_number) = lucky(&prediction);
        Self {
            sign,
            prediction,
            lucky_colour,
            lucky_number,
        }
    }
}

/// "आजको शुभ रंग फिक्का पहेंलो हो भने शुभ अंक ८ रहेको छ।" → the colour and
/// the number. Either may be missing; a reading that names neither has none.
fn lucky(text: &str) -> (Option<String>, Option<String>) {
    let after = |marker: &str| -> Option<&str> {
        let start = text.find(marker)? + marker.len();
        Some(text[start..].trim_start())
    };
    let colour = after("शुभ रंग").or_else(|| after("शुभ रङ्ग")).and_then(|rest| {
        let end = [" हो", " रहेको", "।", ","]
            .iter()
            .filter_map(|stop| rest.find(stop))
            .min()?;
        let colour = rest[..end].trim();
        (!colour.is_empty() && colour.chars().count() <= 24).then(|| colour.to_owned())
    });
    let number = after("शुभ अंक").or_else(|| after("शुभ अङ्क")).and_then(|rest| {
        let number: String = rest
            .chars()
            .take_while(|c| c.is_numeric() || *c == ',' || *c == ' ')
            .collect();
        let number = number.trim().trim_end_matches(',').trim();
        (!number.is_empty()).then(|| number.to_owned())
    });
    (colour, number)
}

impl RashifalPeriod {
    pub const ALL: [Self; 4] = [Self::Daily, Self::Weekly, Self::Monthly, Self::Yearly];
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_the_lucky_colour_and_number() {
        let reading = Rashifal::new(
            RashiSign::Mesh,
            "काम बन्नेछ। आजको शुभ रंग फिक्का पहेंलो हो भने शुभ अंक ८ रहेको छ।".to_owned(),
        );
        assert_eq!(reading.lucky_colour.as_deref(), Some("फिक्का पहेंलो"));
        assert_eq!(reading.lucky_number.as_deref(), Some("८"));

        let plain = Rashifal::new(RashiSign::Mesh, "यो साता राम्रो छ।".to_owned());
        assert_eq!((plain.lucky_colour, plain.lucky_number), (None, None));
    }
}
