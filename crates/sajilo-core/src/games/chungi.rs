//! चुङ्गी: keep the rubber-band ball in the air. The kicking itself is real
//! time and runs on the screen; here is what lasts: the record, a run's
//! result checked before it counts, and the daily challenge, the same
//! throws for everyone on a Nepali day.

use serde::{Deserialize, Serialize};

/// More kicks than anyone keeps up in one go: a run past it isn't recorded.
pub const MAX_KICKS: u32 = 5000;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(
    feature = "typescript",
    derive(ts_rs::TS),
    ts(export, export_to = "api/")
)]
pub enum ChungiMode {
    /// A fresh throw every run.
    Classic,
    /// Today's throws, the same for everyone.
    Daily,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
#[cfg_attr(
    feature = "typescript",
    derive(ts_rs::TS),
    ts(export, export_to = "api/")
)]
pub struct ChungiStats {
    pub played: u32,
    /// The most kicks in one classic run.
    pub best: u32,
    pub kicks: u32,
    /// Kicks right in the middle of the glow.
    pub perfect: u32,
    /// The day the daily best is for, as a day count.
    pub daily_day: Option<i64>,
    pub daily_best: u32,
}

impl ChungiStats {
    /// Today's daily best: none carried over from another day.
    pub fn daily_best_on(&self, day: i64) -> u32 {
        if self.daily_day == Some(day) {
            self.daily_best
        } else {
            0
        }
    }

    /// Records a finished run on `day`. Returns whether it beat the best
    /// for its mode; a run that can't be real changes nothing.
    pub fn record(&mut self, mode: ChungiMode, kicks: u32, perfect: u32, day: i64) -> bool {
        if kicks > MAX_KICKS || perfect > kicks {
            return false;
        }
        self.played += 1;
        self.kicks += kicks;
        self.perfect += perfect;
        match mode {
            ChungiMode::Classic => {
                let beat = kicks > self.best;
                self.best = self.best.max(kicks);
                beat
            }
            ChungiMode::Daily => {
                let before = self.daily_best_on(day);
                self.daily_day = Some(day);
                self.daily_best = before.max(kicks);
                kicks > before
            }
        }
    }
}

/// The seed for `day`'s throws: the same day, the same throws, anywhere.
pub fn daily_seed(day: i64) -> u64 {
    let mut z = (day as u64).wrapping_add(0x9E37_79B9_7F4A_7C15);
    z = (z ^ (z >> 30)).wrapping_mul(0xBF58_476D_1CE4_E5B9);
    z = (z ^ (z >> 27)).wrapping_mul(0x94D0_49BB_1331_11EB);
    (z ^ (z >> 31)) & 0x001F_FFFF_FFFF_FFFF
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_classic_best_only_goes_up() {
        let mut stats = ChungiStats::default();
        assert!(stats.record(ChungiMode::Classic, 12, 3, 1));
        assert!(!stats.record(ChungiMode::Classic, 8, 1, 1));
        assert_eq!(
            (stats.best, stats.played, stats.kicks, stats.perfect),
            (12, 2, 20, 4)
        );
    }

    #[test]
    fn the_daily_best_starts_over_each_day() {
        let mut stats = ChungiStats::default();
        assert!(stats.record(ChungiMode::Daily, 9, 0, 100));
        assert!(!stats.record(ChungiMode::Daily, 5, 0, 100));
        assert_eq!(stats.daily_best_on(100), 9);
        assert_eq!(stats.daily_best_on(101), 0);
        assert!(
            stats.record(ChungiMode::Daily, 3, 0, 101),
            "a new day, a new best"
        );
        assert_eq!(stats.best, 0, "daily runs don't touch the classic best");
    }

    #[test]
    fn an_impossible_run_is_not_recorded() {
        let mut stats = ChungiStats::default();
        assert!(!stats.record(ChungiMode::Classic, MAX_KICKS + 1, 0, 1));
        assert!(!stats.record(ChungiMode::Classic, 3, 4, 1));
        assert_eq!(stats, ChungiStats::default());
    }

    #[test]
    fn a_day_has_one_seed_that_fits_a_js_number() {
        assert_eq!(daily_seed(20_000), daily_seed(20_000));
        assert_ne!(daily_seed(20_000), daily_seed(20_001));
        assert!(daily_seed(20_000) < (1 << 53));
    }
}
