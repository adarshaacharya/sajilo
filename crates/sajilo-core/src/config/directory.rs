//! Phone numbers, official sites and keeper templates:
//! `data/config/directory.json`.
//!
//! Numbers change, portals move, and fees and checklists change every
//! fiscal year. Kept as a pack so a stale number is fixed the day it is
//! reported.

use std::collections::{BTreeMap, BTreeSet};

use serde::{Deserialize, Serialize};

use super::check::{https_url, optional_text, text};
use super::{Pack, Slot};

const MAX_ENTRIES: usize = 200;
const MAX_LABEL: usize = 120;
const MAX_NOTE: usize = 400;

macro_rules! dto_enum {
    ($(#[$meta:meta])* pub enum $name:ident { $($variant:ident),+ $(,)? }) => {
        $(#[$meta])*
        #[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
        #[serde(rename_all = "camelCase")]
        #[cfg_attr(feature = "typescript", derive(ts_rs::TS), ts(export, export_to = "api/"))]
        pub enum $name { $($variant),+ }
    };
}

dto_enum! { pub enum ContactCategory { Emergency, Government, Utility, Health } }
dto_enum! { pub enum ContactTone { Urgent, Support } }
dto_enum! { pub enum WebsiteType { Checker, Portal, App } }
dto_enum! {
    /// Stored on reminders for filtering and backups.
    pub enum TemplateCategory { Identity, Vehicle, Home, Money, Health, Application }
}
dto_enum! { pub enum TemplateRecurrence { None, Monthly, MonthlyBs, YearlyAd, YearlyBs } }

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(
    feature = "typescript",
    derive(ts_rs::TS),
    ts(export, export_to = "api/")
)]
pub struct Contact {
    pub name: String,
    pub name_ne: String,
    pub number: String,
    pub description: String,
    pub description_ne: String,
    pub category: ContactCategory,
    pub tone: ContactTone,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(
    feature = "typescript",
    derive(ts_rs::TS),
    ts(export, export_to = "api/")
)]
pub struct Website {
    pub name: String,
    pub name_ne: String,
    pub description: String,
    pub description_ne: String,
    #[serde(rename = "type")]
    #[cfg_attr(feature = "typescript", ts(rename = "type"))]
    pub kind: WebsiteType,
    pub url: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(
    feature = "typescript",
    derive(ts_rs::TS),
    ts(export, export_to = "api/")
)]
pub struct ReminderTemplate {
    pub id: String,
    pub title: String,
    pub category: TemplateCategory,
    /// What to have ready, where to pay, what lateness costs.
    pub tips: Vec<String>,
    /// Empty when there is no one official site (an internet bill).
    pub url: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[cfg_attr(feature = "typescript", ts(optional))]
    pub recurrence: Option<TemplateRecurrence>,
    pub remind_days: Vec<u32>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(
    feature = "typescript",
    derive(ts_rs::TS),
    ts(export, export_to = "api/")
)]
pub struct RenewalGuide {
    pub url: String,
    pub fee: String,
    pub location: String,
    pub checklist: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[cfg_attr(feature = "typescript", ts(optional))]
    pub note: Option<String>,
}

/// The document kinds a renewal guide can be for: the ones that renew.
pub const RENEWABLE_DOCUMENTS: [&str; 5] = [
    "passport",
    "drivingLicence",
    "bluebook",
    "insurance",
    "warranty",
];

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(
    feature = "typescript",
    derive(ts_rs::TS),
    ts(export, export_to = "api/")
)]
pub struct DirectoryPack {
    pub contacts: Vec<Contact>,
    pub websites: Vec<Website>,
    pub reminder_templates: Vec<ReminderTemplate>,
    pub renewal_guides: BTreeMap<String, RenewalGuide>,
}

/// An official link: empty, or a public https URL.
fn link(field: &str, url: &str) -> Result<(), String> {
    if url.is_empty() {
        Ok(())
    } else {
        https_url(field, url)
    }
}

impl Pack for DirectoryPack {
    const NAME: &'static str = "directory";
    const SCHEMA: u32 = 1;

    fn bundled_json() -> &'static str {
        include_str!("../../../../data/config/directory.json")
    }

    fn validate(&self) -> Result<(), String> {
        if self.contacts.is_empty() || self.websites.is_empty() {
            return Err("contacts and websites must not be empty".to_owned());
        }
        if self.contacts.len() + self.websites.len() + self.reminder_templates.len() > MAX_ENTRIES {
            return Err(format!("more than {MAX_ENTRIES} entries"));
        }
        for (i, contact) in self.contacts.iter().enumerate() {
            let field = format!("contacts[{i}]");
            text(&format!("{field}.name"), &contact.name, MAX_LABEL)?;
            text(&format!("{field}.nameNe"), &contact.name_ne, MAX_LABEL)?;
            text(
                &format!("{field}.description"),
                &contact.description,
                MAX_LABEL,
            )?;
            text(
                &format!("{field}.descriptionNe"),
                &contact.description_ne,
                MAX_LABEL,
            )?;
            let number = &contact.number;
            if number.is_empty()
                || number.len() > 20
                || !number
                    .chars()
                    .all(|c| c.is_ascii_digit() || c == '-' || c == '+')
            {
                return Err(format!("{field}.number is not a phone number"));
            }
        }
        for (i, site) in self.websites.iter().enumerate() {
            let field = format!("websites[{i}]");
            text(&format!("{field}.name"), &site.name, MAX_LABEL)?;
            text(&format!("{field}.nameNe"), &site.name_ne, MAX_LABEL)?;
            text(
                &format!("{field}.description"),
                &site.description,
                MAX_LABEL,
            )?;
            text(
                &format!("{field}.descriptionNe"),
                &site.description_ne,
                MAX_LABEL,
            )?;
            https_url(&format!("{field}.url"), &site.url)?;
        }
        let mut ids = BTreeSet::new();
        for (i, template) in self.reminder_templates.iter().enumerate() {
            let field = format!("reminderTemplates[{i}]");
            // Reminders store the id they were started from; it must stay a slug.
            if template.id.is_empty()
                || template.id.len() > 40
                || !template
                    .id
                    .chars()
                    .all(|c| c.is_ascii_alphanumeric() || c == '-')
                || !ids.insert(template.id.as_str())
            {
                return Err(format!("{field}.id is not a unique slug"));
            }
            text(&format!("{field}.title"), &template.title, MAX_LABEL)?;
            link(&format!("{field}.url"), &template.url)?;
            if template.tips.len() > 12 {
                return Err(format!("{field} has more than 12 tips"));
            }
            for (j, tip) in template.tips.iter().enumerate() {
                text(&format!("{field}.tips[{j}]"), tip, MAX_LABEL)?;
            }
            if template.remind_days.len() > 6 || template.remind_days.iter().any(|d| *d > 90) {
                return Err(format!("{field}.remindDays is out of range"));
            }
        }
        for (kind, guide) in &self.renewal_guides {
            let field = format!("renewalGuides.{kind}");
            if !RENEWABLE_DOCUMENTS.contains(&kind.as_str()) {
                return Err(format!("{field} is not a renewable document"));
            }
            link(&format!("{field}.url"), &guide.url)?;
            optional_text(&format!("{field}.fee"), &guide.fee, MAX_LABEL)?;
            text(&format!("{field}.location"), &guide.location, MAX_LABEL)?;
            for (j, item) in guide.checklist.iter().enumerate() {
                text(&format!("{field}.checklist[{j}]"), item, MAX_LABEL)?;
            }
            if let Some(note) = &guide.note {
                optional_text(&format!("{field}.note"), note, MAX_NOTE)?;
            }
        }
        Ok(())
    }

    fn slot() -> &'static Slot<Self> {
        static SLOT: Slot<DirectoryPack> = Slot::new();
        &SLOT
    }
}
