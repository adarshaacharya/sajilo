//! How long to wait after a failed refresh.
//!
//! Backing off matters more here than in most clients: every source is a small
//! public service run by someone else, and a server that retries a failing feed
//! on a tight loop is the difference between reading a source and hammering it.

use std::time::Duration;

/// Doubles per consecutive failure, capped so a feed that has been down all
/// night still recovers promptly once the source returns.
const CAP: Duration = Duration::from_secs(30 * 60);

/// The first retry delay. Short enough that a blip costs one cycle, long enough
/// not to stampede.
const BASE: Duration = Duration::from_secs(60);

pub fn delay(consecutive_failures: u32) -> Duration {
    if consecutive_failures == 0 {
        return Duration::ZERO;
    }
    // Saturating so a long outage cannot overflow into a tiny delay.
    let multiplier = 1u64
        .checked_shl(consecutive_failures - 1)
        .unwrap_or(u64::MAX);
    BASE.saturating_mul(multiplier.min(u32::MAX as u64) as u32)
        .min(CAP)
}

/// Spreads the fleet out so eight feeds whose intervals share a factor do not
/// all fire in the same second, and so a restart does not replay the same
/// pattern.
///
/// Deterministic rather than random: the jitter only needs to differ *between*
/// feeds, and a pure function keeps the scheduler testable.
pub fn jitter(interval: Duration, module_index: usize) -> Duration {
    // Up to 10% of the interval, spread across the eight modules.
    let spread = interval.as_secs() / 10;
    if spread == 0 {
        return interval;
    }
    let offset = (module_index as u64 * spread / 8) % spread;
    interval + Duration::from_secs(offset)
}
