//! Ratopati's per-sign page carries every period; the fallback reads one.

use sajilo_api::rashifal::{RashiSign, RashifalPeriod};
use sajilo_providers::ratopati_rashifal::{parse_sign, sign_url};

fn mesh() -> String {
    std::fs::read_to_string(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../../fixtures/ratopati/rashifal-mesh.html"
    ))
    .unwrap()
}

#[test]
fn one_page_holds_all_four_periods() {
    let page = mesh();
    let (daily, heading) = parse_sign(&page, RashifalPeriod::Daily).unwrap();
    assert!(daily.starts_with("न्यून पारिश्रमिकमा"));
    assert_eq!(heading.as_deref(), Some("मङ्गलबार, २० असोज २०८३ को राशिफल"));

    let (weekly, _) = parse_sign(&page, RashifalPeriod::Weekly).unwrap();
    assert!(weekly.starts_with("साताको सुरु"));
    let (monthly, _) = parse_sign(&page, RashifalPeriod::Monthly).unwrap();
    assert!(monthly.contains("सूर्य प्रतिस्पर्धा भावमा"));
    let (yearly, _) = parse_sign(&page, RashifalPeriod::Yearly).unwrap();
    assert!(yearly.chars().count() > 1000);
    assert!(yearly.contains("\n\n"), "paragraphs kept apart");
}

#[test]
fn a_page_without_the_block_reads_nothing() {
    assert_eq!(
        parse_sign("<html><body></body></html>", RashifalPeriod::Weekly),
        None
    );
    assert_eq!(
        sign_url(RashiSign::Vrishchik),
        "https://www.ratopati.com/rashifal/brischik"
    );
}
