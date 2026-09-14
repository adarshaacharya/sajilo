-- Rebuild the existing hourly aggregate without losing any counted clicks.
-- The timestamp marks the beginning of the Nepal-time hour each row covers;
-- individual click times were intentionally never collected.
DROP VIEW IF EXISTS download_clicks_readable;
DROP VIEW IF EXISTS download_clicks_daily;

ALTER TABLE download_clicks RENAME TO download_clicks_legacy;

CREATE TABLE download_clicks (
  hour_started_at_npt TEXT NOT NULL,
  platform TEXT NOT NULL,
  country TEXT NOT NULL,
  referrer TEXT NOT NULL,
  clicks INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (hour_started_at_npt, platform, country, referrer)
);

INSERT INTO download_clicks (
  hour_started_at_npt,
  platform,
  country,
  referrer,
  clicks
)
SELECT
  day || 'T' || printf('%02d', hour) || ':00:00+05:45',
  platform,
  country,
  referrer,
  clicks
FROM download_clicks_legacy;

DROP TABLE download_clicks_legacy;
