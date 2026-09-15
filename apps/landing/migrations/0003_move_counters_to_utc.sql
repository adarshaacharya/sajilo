-- Move both counters from Nepal time to UTC, without losing any count.
--
-- Each stored bucket becomes the exact UTC instant it began, so no count moves
-- to a different hour or day. Rows written in Nepal time therefore start at
-- quarter past: a Nepal hour 2026-09-14T14:00:00+05:45 is 2026-09-14T08:15:00Z,
-- and the Nepal day 2026-09-14 began at 2026-09-13T18:15:00Z. Rows written from
-- here on start on the UTC hour or the UTC day.
--
-- A value SQLite cannot parse converts to NULL and fails the NOT NULL
-- constraint, which aborts the migration rather than dropping that row.

ALTER TABLE download_clicks RENAME TO download_clicks_legacy;

CREATE TABLE download_clicks (
  hour_started_at_utc TEXT NOT NULL,
  platform TEXT NOT NULL,
  country TEXT NOT NULL,
  referrer TEXT NOT NULL,
  clicks INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (hour_started_at_utc, platform, country, referrer)
);

INSERT INTO download_clicks (
  hour_started_at_utc,
  platform,
  country,
  referrer,
  clicks
)
SELECT
  -- SQLite reads the +05:45 suffix and converts to UTC.
  strftime('%Y-%m-%dT%H:%M:%SZ', hour_started_at_npt),
  platform,
  country,
  referrer,
  clicks
FROM download_clicks_legacy;

DROP TABLE download_clicks_legacy;

ALTER TABLE app_pings RENAME TO app_pings_legacy;

CREATE TABLE app_pings (
  day_started_at_utc TEXT NOT NULL,
  version TEXT NOT NULL,
  platform TEXT NOT NULL,
  architecture TEXT NOT NULL,
  country TEXT NOT NULL,
  gap_days INTEGER NOT NULL,
  upgraded_from_version TEXT NOT NULL DEFAULT '',
  pings INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (
    day_started_at_utc,
    version,
    platform,
    architecture,
    country,
    gap_days,
    upgraded_from_version
  )
);

INSERT INTO app_pings (
  day_started_at_utc,
  version,
  platform,
  architecture,
  country,
  gap_days,
  upgraded_from_version,
  pings
)
SELECT
  -- Nepal midnight is 18:15 UTC the previous day.
  strftime('%Y-%m-%dT%H:%M:%SZ', day_npt || ' 00:00:00', '-345 minutes'),
  version,
  platform,
  architecture,
  country,
  gap_days,
  upgraded_from_version,
  pings
FROM app_pings_legacy;

DROP TABLE app_pings_legacy;
