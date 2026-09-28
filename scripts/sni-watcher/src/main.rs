//! A stand-in `org.kde.StatusNotifierWatcher`, the service a panel runs so tray
//! icons can register with it.
//!
//! It draws nothing. It accepts registrations and prints each item's bus name,
//! so a test can then read the item's properties and click it with `gdbus`.
//! See docs/popover-window.md, "Testing on Linux".

use std::sync::Mutex;

use zbus::{connection, interface, message::Header, object_server::SignalEmitter};

#[derive(Default)]
struct Watcher {
    items: Mutex<Vec<String>>,
}

#[interface(name = "org.kde.StatusNotifierWatcher")]
impl Watcher {
    async fn register_status_notifier_item(
        &self,
        service: &str,
        #[zbus(header)] header: Header<'_>,
        #[zbus(signal_emitter)] emitter: SignalEmitter<'_>,
    ) {
        // An item may register by object path alone; its bus name is then the
        // caller's.
        let item = if service.starts_with('/') {
            let sender = header.sender().map(ToString::to_string).unwrap_or_default();
            format!("{sender}{service}")
        } else {
            service.to_owned()
        };
        println!("REGISTERED {item}");
        if let Ok(mut items) = self.items.lock() {
            items.push(item.clone());
        }
        let _ = Self::status_notifier_item_registered(&emitter, &item).await;
    }

    fn register_status_notifier_host(&self, _service: &str) {}

    #[zbus(property)]
    fn registered_status_notifier_items(&self) -> Vec<String> {
        self.items
            .lock()
            .map(|items| items.clone())
            .unwrap_or_default()
    }

    #[zbus(property)]
    fn is_status_notifier_host_registered(&self) -> bool {
        true
    }

    #[zbus(property)]
    fn protocol_version(&self) -> i32 {
        0
    }

    #[zbus(signal)]
    async fn status_notifier_item_registered(
        emitter: &SignalEmitter<'_>,
        service: &str,
    ) -> zbus::Result<()>;
}

fn main() -> zbus::Result<()> {
    async_io::block_on(async {
        let _connection = connection::Builder::session()?
            .name("org.kde.StatusNotifierWatcher")?
            .serve_at("/StatusNotifierWatcher", Watcher::default())?
            .build()
            .await?;
        println!("WATCHER UP");
        std::future::pending::<()>().await;
        Ok(())
    })
}
