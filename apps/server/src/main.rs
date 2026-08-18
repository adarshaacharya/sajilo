use std::sync::Arc;

use sajilo_server::refresh::LiveFeeds;
use sajilo_server::{AppState, Cache, Config, http, refresh};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "sajilo_server=info,tower_http=warn".into()),
        )
        .init();

    let config = Arc::new(Config::from_env());
    // A restart must not blank every feed for the length of one refresh cycle.
    let cache = Arc::new(Cache::warm_start(&config.cache_path));

    refresh::spawn_all(Arc::new(LiveFeeds::new()), cache.clone(), config.clone());
    spawn_persistence(cache.clone(), config.clone());

    let state = Arc::new(AppState {
        cache: cache.clone(),
        config: config.clone(),
    });
    let app = http::router(state)
        .layer(tower_http::compression::CompressionLayer::new())
        .layer(tower_http::trace::TraceLayer::new_for_http());

    let listener = tokio::net::TcpListener::bind(("0.0.0.0", config.port)).await?;
    tracing::info!(port = config.port, "listening");

    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown(cache, config))
        .await?;
    Ok(())
}

/// Snapshots to disk periodically so an unexpected termination still leaves a
/// recent warm start behind.
fn spawn_persistence(cache: Arc<Cache>, config: Arc<Config>) {
    tokio::spawn(async move {
        let mut ticker = tokio::time::interval(std::time::Duration::from_secs(300));
        // `interval` fires its first tick immediately. Writing then would put an
        // empty snapshot on disk before any feed has been fetched — which is
        // worse than not writing at all, because it overwrites the good file the
        // previous run left behind.
        ticker.tick().await;
        loop {
            ticker.tick().await;
            persist(&cache, &config);
        }
    });
}

/// Refuses to write an empty snapshot over an existing one: a cold cache is not
/// news worth destroying a warm start for.
fn persist(cache: &Cache, config: &Config) {
    if cache.is_empty() && config.cache_path.exists() {
        tracing::debug!("skipping snapshot: nothing cached yet");
        return;
    }
    if let Err(error) = cache.persist(&config.cache_path) {
        tracing::warn!(%error, "could not persist snapshot");
    }
}

/// Containers are stopped with `SIGTERM`, not `SIGINT`, so listening only for
/// ctrl-c would mean the graceful persist never runs where it matters most.
async fn shutdown(cache: Arc<Cache>, config: Arc<Config>) {
    let interrupt = async {
        let _ = tokio::signal::ctrl_c().await;
    };

    #[cfg(unix)]
    let terminate = async {
        match tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate()) {
            Ok(mut signal) => {
                signal.recv().await;
            }
            Err(error) => tracing::warn!(%error, "could not listen for SIGTERM"),
        }
    };
    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();

    tokio::select! {
        () = interrupt => {}
        () = terminate => {}
    }

    tracing::info!("shutting down, persisting snapshot");
    persist(&cache, &config);
}
