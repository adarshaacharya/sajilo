//! The month grid feeds the dashboard directly, so its padding and holiday
//! flags are pinned here. Derived from `BikramSambatCalendar.month(containing:)`.

use chrono::{Datelike, Weekday};
use sajilo_core::NepaliDate;
use sajilo_core::calendar::bikram_sambat::{days_in_month, gregorian_date_from};
use sajilo_core::calendar::month::month;

#[test]
fn pads_the_grid_so_the_first_lands_on_its_real_weekday() {
    let first = NepaliDate::new(2083, 4, 1);
    let grid = month(first, first).unwrap();

    let leading = grid
        .days
        .iter()
        .take_while(|day| day.date.is_none())
        .count();
    let weekday = gregorian_date_from(first).unwrap().weekday();
    assert_eq!(leading as u32, weekday.num_days_from_sunday());

    let numbered = grid.days.len() - leading;
    assert_eq!(numbered as i32, days_in_month(2083, 4).unwrap());
    // Padding is only ever at the front.
    assert!(grid.days[leading..].iter().all(|day| day.date.is_some()));
}

#[test]
fn marks_today_exactly_once() {
    let today = NepaliDate::new(2083, 4, 15);
    let grid = month(today, today).unwrap();
    assert_eq!(grid.days.iter().filter(|day| day.is_today).count(), 1);

    // A grid for a different month contains no "today".
    let elsewhere = month(NepaliDate::new(2083, 5, 1), today).unwrap();
    assert!(!elsewhere.days.iter().any(|day| day.is_today));
}

/// Saturday is Nepal's weekly holiday, so every Saturday is flagged even when
/// the source data carries no event for it.
#[test]
fn flags_every_saturday_as_a_holiday() {
    let first = NepaliDate::new(2083, 4, 1);
    let grid = month(first, first).unwrap();

    for day in grid.days.iter().filter_map(|day| day.date) {
        let is_saturday = gregorian_date_from(day).unwrap().weekday() == Weekday::Sat;
        let cell = grid
            .days
            .iter()
            .find(|cell| cell.date == Some(day))
            .expect("cell exists");
        if is_saturday {
            assert!(cell.is_holiday, "{day:?} is a Saturday");
        }
    }
}

#[test]
fn carries_festival_names_from_the_bundled_data() {
    let first = NepaliDate::new(2083, 4, 1);
    let grid = month(first, first).unwrap();
    let day_one = grid.days.iter().find(|d| d.date == Some(first)).unwrap();

    assert_eq!(
        day_one.event_name.as_deref(),
        Some("साउन संक्रान्ती, लुतो फाल्ने एवं राँको बाल्ने")
    );
    assert_eq!(day_one.tithi.as_deref(), Some("तृतीया"));
    assert_eq!(grid.title, "साउन २०८३");
}

#[test]
fn rejects_a_month_outside_the_supported_range() {
    let today = NepaliDate::new(2083, 4, 1);
    assert!(month(NepaliDate::new(3000, 1, 1), today).is_err());
    assert!(month(NepaliDate::new(2083, 13, 1), today).is_err());
}

/// Cell ids must be unique or the UI will reuse rows across a re-render.
#[test]
fn cell_ids_are_unique() {
    let first = NepaliDate::new(2083, 4, 1);
    let grid = month(first, first).unwrap();
    let ids: std::collections::HashSet<&str> =
        grid.days.iter().map(|day| day.id.as_str()).collect();
    assert_eq!(ids.len(), grid.days.len());
}
