//! Daily rashifal readings. Ported from `Rashifal.swift`.

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
}

dto! {
    /// One sign's reading for the day.
    pub struct Rashifal {
        pub sign: RashiSign,
        /// The astrologer's words, carried verbatim. Never trimmed,
        /// summarised, or reflowed — it is someone's writing, and Sajilo shows
        /// it as published.
        pub prediction: String,
    }

    pub struct RashifalSnapshot {
        pub readings: Vec<Rashifal>,
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
