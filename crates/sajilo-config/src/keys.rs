//! The minisign public keys a config manifest may be signed with.
//!
//! Two slots: the key CI signs with today, and the next one. Rotating is
//! shipping an app that carries the next key, waiting for it to spread,
//! then signing with it — no client ever sees a manifest it can't check.
//! Kept apart from the updater key so a leak of one is not a leak of both.

pub const PUBLIC_KEYS: &[&str] = &[CURRENT, NEXT];

/// Signs every manifest today.
pub const CURRENT: &str = "RWT2p3yBBj5C65n1R81VzZ0skkSR605ckRVZhRWbp2sJhzmUuEmKo1HW";
/// Held offline for rotation.
pub const NEXT: &str = "RWQ9aXsG8pF44RdmffJW36isbBPLgInPr0htTTndtPbbbUI4ssLi5F+s";
