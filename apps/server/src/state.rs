use std::sync::Arc;

use crate::cache::Cache;
use crate::config::Config;

/// Everything a handler needs. Deliberately holds no HTTP client: nothing on
/// the request path is allowed to fetch.
#[derive(Debug)]
pub struct AppState {
    pub cache: Arc<Cache>,
    pub config: Arc<Config>,
}
