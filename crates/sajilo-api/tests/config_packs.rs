//! The config packs that live in sajilo-api: news sources and radio.

use sajilo_api::news::{NewsSourceInfo, NewsSourcesPack};
use sajilo_core::config::Pack;

#[test]
fn pack_sources_join_the_catalog_and_bad_ones_are_refused() {
    let built_in = NewsSourceInfo::catalog().len();
    NewsSourcesPack::install(
        r#"{"sources":[{"id":"setopati","name":"Setopati","feeds":["https://www.setopati.com/feed"]},
                       {"id":"nepali-times","name":"Nepali Times","feeds":["https://nepalitimes.com/feed"],"english":true}]}"#,
    )
    .unwrap();
    let catalog = NewsSourceInfo::catalog();
    assert_eq!(catalog.len(), built_in + 2);
    let added = catalog
        .iter()
        .find(|source| source.id == "nepali-times")
        .unwrap();
    assert!(added.english && !added.official);
    assert!(catalog.iter().any(|source| source.id == "onlineKhabar"));

    for bad in [
        // Collides with a built-in source.
        r#"{"sources":[{"id":"kantipur","name":"K","feeds":["https://a.com/feed"]}]}"#,
        r#"{"sources":[{"id":"Setopati","name":"S","feeds":["https://a.com/feed"]}]}"#,
        r#"{"sources":[{"id":"s","name":"S","feeds":["http://a.com/feed"]}]}"#,
        r#"{"sources":[{"id":"s","name":"S","feeds":[]}]}"#,
        r#"{"sources":[{"id":"s","name":"S","feeds":["https://a.com/f"]},{"id":"s","name":"T","feeds":["https://b.com/f"]}]}"#,
    ] {
        assert!(NewsSourcesPack::parse(bad).is_err(), "{bad}");
    }
    NewsSourcesPack::reset();
    assert_eq!(NewsSourceInfo::catalog().len(), built_in);
}

#[test]
fn the_radio_pack_adds_hides_and_redirects_stations() {
    use sajilo_api::load_state::Freshness;
    use sajilo_api::radio::{RadioDirectory, RadioPack, RadioStation};

    let station = |slug: &str, stream: Option<&str>| RadioStation {
        slug: slug.to_owned(),
        name: slug.to_owned(),
        frequency: None,
        logo_url: None,
        stream_url: stream.map(str::to_owned),
    };
    let directory = RadioDirectory {
        stations: vec![station("kantipur-fm", None), station("dead-fm", None)],
        freshness: Freshness::new(chrono::Utc::now()),
    };
    let pack = RadioPack::parse(
        r#"{"add":[{"slug":"new-fm","name":"New FM","frequency":null,"logoUrl":null,"streamUrl":"https://stream.example.com/new"}],
            "hide":["dead-fm"],
            "streams":{"kantipur-fm":"https://stream.example.com/kantipur"}}"#,
    )
    .unwrap();
    let applied = pack.apply(directory);
    let slugs: Vec<_> = applied.stations.iter().map(|s| s.slug.as_str()).collect();
    assert_eq!(slugs, ["kantipur-fm", "new-fm"]);
    assert_eq!(
        applied.stations[0].stream_url.as_deref(),
        Some("https://stream.example.com/kantipur")
    );
    assert_eq!(
        pack.stream_for("new-fm").as_deref(),
        Some("https://stream.example.com/new")
    );
    assert_eq!(pack.stream_for("other"), None);

    for bad in [
        r#"{"add":[{"slug":"x","name":"X","frequency":null,"logoUrl":null,"streamUrl":"http://a.com/s"}]}"#,
        r#"{"add":[{"slug":"x","name":"X","frequency":null,"logoUrl":null,"streamUrl":null}]}"#,
        r#"{"streams":{"bad slug":"https://a.com/s"}}"#,
    ] {
        assert!(RadioPack::parse(bad).is_err(), "{bad}");
    }
}
