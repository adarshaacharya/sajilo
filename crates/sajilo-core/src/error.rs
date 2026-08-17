use thiserror::Error;

/// Conversion failures are typed so an out-of-range date can never surface as a
/// wrong date or a panic.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Error)]
pub enum ConversionError {
    #[error("This Gregorian date is outside Sajilo's bundled calendar range.")]
    UnsupportedGregorianDate,
    #[error("This Bikram Sambat date is outside Sajilo's bundled calendar range.")]
    UnsupportedNepaliDate,
}

pub type Result<T> = std::result::Result<T, ConversionError>;
