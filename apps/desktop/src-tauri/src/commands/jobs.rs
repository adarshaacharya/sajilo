//! Government vacancies: one cached feed per source, so a commission whose
//! site is down shows as unavailable on its own while the rest still list.
//!
//! What is worked out when served, never cached: days left to apply, whether
//! a vacancy is new since the Jobs screen was last looked at, and whether a
//! deadline reminder is set for it.

use std::borrow::Cow;
use std::collections::{HashMap, HashSet};

use chrono::Utc;
use sajilo_api::jobs::{JobDetailPart, JobSource, JobSourceInfo, JobVacancy};
use sajilo_api::load_state::LoadState;
use sajilo_core::NepaliDate;
use sajilo_core::calendar::bikram_sambat::{gregorian_date_from, nepali_date_from};
use sajilo_core::focus::Language;
use sajilo_core::planner::{DayPlan, PlanTime, Recurrence, Reminder};
use sajilo_providers::HttpClient;
use tauri::{AppHandle, Manager, Wry};

use crate::feed::Feed;
use crate::{db, prefs};

type Result<T> = std::result::Result<T, String>;

/// Commissions publish a few times a week; half a day is still current.
const MAX_AGE_SECS: i64 = 12 * 60 * 60;
const REFETCH_AFTER_SECS: i64 = 3 * 60 * 60;
/// Enough to remember every vacancy listed in a year or two.
const MAX_SEEN: usize = 3000;
/// A reminder plan's id: the vacancy's, so one vacancy has at most one.
const PLAN_PREFIX: &str = "job:";
/// The deadline reminder fires the morning before.
const REMIND_AT: PlanTime = PlanTime {
    hour: 10,
    minute: 0,
};
const DAY_BEFORE: Reminder = Reminder(24 * 60);

pub struct JobsCache {
    feeds: HashMap<JobSource, Feed<Vec<JobVacancy>>>,
    client: HttpClient,
}

impl Default for JobsCache {
    fn default() -> Self {
        let feeds = JobSource::ALL
            .into_iter()
            .map(|source| {
                let key = Cow::Owned(format!("jobs.{}.v1", source.key()));
                (source, Feed::keyed(key, MAX_AGE_SECS, REFETCH_AFTER_SECS))
            })
            .collect();
        Self {
            feeds,
            client: HttpClient::new(),
        }
    }
}

/// The sources the Jobs screen lists, in its order.
#[tauri::command]
pub fn job_sources() -> Vec<JobSourceInfo> {
    JobSourceInfo::catalog()
}

/// One source's vacancies.
#[tauri::command]
pub async fn get_jobs(
    app: AppHandle<Wry>,
    source: JobSource,
    refresh: Option<bool>,
) -> LoadState<Vec<JobVacancy>> {
    let cache = app.state::<JobsCache>();
    let Some(feed) = cache.feeds.get(&source) else {
        return LoadState::Unavailable;
    };
    let client = &cache.client;
    let state = feed
        .get(&app, Utc::now(), refresh.unwrap_or(false), || async move {
            sajilo_providers::jobs::fetch(client, source).await
        })
        .await;
    let context = Context::load(&app);
    state.map(|vacancies| {
        vacancies
            .into_iter()
            .map(|vacancy| context.annotate(vacancy))
            .collect()
    })
}

/// What one advertisement covers: services and who may apply. Lok Sewa
/// only; the notice-based sources have this in their PDF.
#[tauri::command]
pub async fn job_detail(app: AppHandle<Wry>, id: String) -> Result<Vec<JobDetailPart>> {
    let vacancy = cached_vacancy(&app, &id).ok_or("That vacancy is no longer listed.")?;
    let (JobSource::Psc, Some(code)) = (vacancy.source, vacancy.advertisement_code) else {
        return Ok(Vec::new());
    };
    let client = app.state::<JobsCache>().client.clone();
    sajilo_providers::jobs::psc::fetch_detail(&client, &code)
        .await
        .map_err(|error| error.to_string())
}

/// Remembers these vacancies as seen, so they stop showing as new.
#[tauri::command]
pub fn mark_jobs_seen(app: AppHandle<Wry>, ids: Vec<String>) -> Result<()> {
    let mut seen = seen(&app).unwrap_or_default();
    for id in ids {
        if !seen.contains(&id) {
            seen.push(id);
        }
    }
    let overflow = seen.len().saturating_sub(MAX_SEEN);
    seen.drain(..overflow);
    db::set_json(&app, prefs::JOBS_SEEN, &serde_json::json!(seen)).map_err(|e| e.clone())
}

/// Sets a reminder for a vacancy's deadline, the morning before, as a plan
/// on the deadline's day so it also shows in the calendar.
#[tauri::command]
pub fn remind_job_deadline(app: AppHandle<Wry>, id: String) -> Result<()> {
    let vacancy = cached_vacancy(&app, &id).ok_or("That vacancy is no longer listed.")?;
    let date = last_day(&vacancy).ok_or("This vacancy has no deadline to remind about.")?;
    let title = match prefs::language(&app) {
        Language::Ne => format!("आवेदनको अन्तिम दिन: {}", vacancy.title),
        Language::En => format!("Last day to apply: {}", vacancy.title),
    };
    let plan = DayPlan {
        id: format!("{PLAN_PREFIX}{id}"),
        date,
        title: sajilo_core::limits::clip(&title, sajilo_core::limits::TITLE),
        time: Some(REMIND_AT),
        reminder: Some(DAY_BEFORE),
        note: vacancy.url.clone(),
        recurrence: Recurrence::None,
        created_at: Utc::now(),
        done: std::collections::BTreeSet::default(),
    }
    .normalised();
    crate::commands::plans::save(&app, &plan)?;
    crate::commands::notify::reschedule();
    Ok(())
}

/// Removes a vacancy's deadline reminder.
#[tauri::command]
pub fn forget_job_deadline(app: AppHandle<Wry>, id: String) -> Result<()> {
    crate::commands::plans::delete_plan(app, format!("{PLAN_PREFIX}{id}")).map(|_| ())
}

/// Keeps every enabled source warm. Called by the background refresh.
pub async fn refresh_all(app: &AppHandle<Wry>) {
    let futures = JobSource::ALL
        .into_iter()
        .map(|source| get_jobs(app.clone(), source, Some(false)));
    futures_util::future::join_all(futures).await;
}

/// The day applications close: at double fee when there is one, since that
/// is the true last chance.
fn last_day(vacancy: &JobVacancy) -> Option<NepaliDate> {
    vacancy.double_fee_deadline.or(vacancy.deadline)
}

fn cached_vacancy(app: &AppHandle<Wry>, id: &str) -> Option<JobVacancy> {
    let cache = app.state::<JobsCache>();
    cache.feeds.values().find_map(|feed| {
        feed.peek(app)
            .and_then(|(vacancies, _)| vacancies.into_iter().find(|v| v.id == id))
    })
}

fn seen(app: &AppHandle<Wry>) -> Option<Vec<String>> {
    db::get_json(app, prefs::JOBS_SEEN)
        .ok()
        .flatten()
        .and_then(|value| serde_json::from_value(value).ok())
}

/// What serving needs to know beyond the cached list.
struct Context {
    today: Option<NepaliDate>,
    nepali: bool,
    /// `None` until the screen has been looked at once: before that nothing
    /// is "new", or the first visit would mark everything.
    seen: Option<HashSet<String>>,
    reminded: HashSet<String>,
}

impl Context {
    fn load(app: &AppHandle<Wry>) -> Self {
        let today = nepali_date_from(sajilo_core::nepal_time::today()).ok();
        let reminded = crate::commands::plans::load(app)
            .unwrap_or_default()
            .into_iter()
            .filter_map(|plan| plan.id.strip_prefix(PLAN_PREFIX).map(str::to_owned))
            .collect();
        Self {
            today,
            nepali: prefs::language(app) == Language::Ne,
            seen: seen(app).map(|ids| ids.into_iter().collect()),
            reminded,
        }
    }

    fn annotate(&self, mut vacancy: JobVacancy) -> JobVacancy {
        vacancy.days_left = match (self.today, last_day(&vacancy)) {
            (Some(today), Some(last)) => days_between(today, last),
            _ => None,
        };
        vacancy.is_new = self
            .seen
            .as_ref()
            .is_some_and(|seen| !seen.contains(&vacancy.id));
        vacancy.reminded = self.reminded.contains(&vacancy.id);
        vacancy.deadline_label = vacancy.deadline.map(|d| self.label(d));
        vacancy.double_fee_deadline_label = vacancy.double_fee_deadline.map(|d| self.label(d));
        vacancy.published_label = vacancy.published_on.map(|d| self.label(d));
        vacancy.published_days_ago = match (self.today, vacancy.published_on) {
            (Some(today), Some(published)) => days_between(published, today),
            _ => None,
        };
        vacancy
    }

    /// `कात्तिक ३` or `Kartik 3`, with the year only when it isn't this one.
    fn label(&self, date: NepaliDate) -> String {
        let this_year = self.today.is_some_and(|today| today.year == date.year);
        if self.nepali {
            let day = sajilo_core::numerals::devanagari(date.day, None);
            let mut text = format!("{} {day}", date.nepali_month_name());
            if !this_year {
                text = format!(
                    "{text}, {}",
                    sajilo_core::numerals::devanagari(date.year, None)
                );
            }
            text
        } else {
            let mut text = format!("{} {}", date.english_month_name(), date.day);
            if !this_year {
                text = format!("{text}, {}", date.year);
            }
            text
        }
    }
}

fn days_between(from: NepaliDate, to: NepaliDate) -> Option<i32> {
    let from = gregorian_date_from(from).ok()?;
    let to = gregorian_date_from(to).ok()?;
    i32::try_from((to - from).num_days()).ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn days_left_across_a_month_end() {
        // Asoj 2083 has 31 days.
        assert_eq!(
            days_between(NepaliDate::new(2083, 6, 29), NepaliDate::new(2083, 7, 2)),
            Some(4)
        );
        assert_eq!(
            days_between(NepaliDate::new(2083, 7, 2), NepaliDate::new(2083, 6, 29)),
            Some(-4)
        );
    }
}
