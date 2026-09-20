-- Download clicks, counted rather than logged.
--
-- One row per UTC hour, platform, country and referring site, holding a
-- running total. `hour_started_at_utc` is a complete, sortable ISO timestamp
-- in UTC, so D1 Studio shows one natural date/time field rather than a separate
-- day and hour. Rows counted before migration 0003 were filed in Nepal hours,
-- so they start at quarter past.
--
-- Nothing identifies a visitor, and nothing here can be traced back to one:
-- the table cannot answer "who", only "how many".
--
-- The referrer is reduced to a hostname on the way in. A full URL is a liability
-- rather than an insight: it can carry the search terms someone typed, or the
-- path of a private page that linked here. "reddit.com" is the whole of what is
-- worth knowing.
CREATE TABLE IF NOT EXISTS download_clicks (
  hour_started_at_utc TEXT NOT NULL, -- 2026-09-14T08:00:00Z
  platform TEXT NOT NULL,  -- macos-arm64, windows, linux-deb, …
  country  TEXT NOT NULL,  -- ISO country code, XX when unknown
  referrer TEXT NOT NULL,  -- hostname only; "direct" when there is none
  clicks   INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (hour_started_at_utc, platform, country, referrer)
);

-- Deliberately aggregate-only. The telemetry Worker derives country at the
-- edge and stores no identifier, IP address, request timestamp, or raw event.
-- One row per UTC day and bucket; rows counted before migration 0003 were
-- filed in Nepal days, so they start at 18:15 the previous UTC day.
CREATE TABLE IF NOT EXISTS app_pings (
  day_started_at_utc TEXT NOT NULL, -- 2026-09-14T00:00:00Z
  version TEXT NOT NULL,
  platform TEXT NOT NULL,
  architecture TEXT NOT NULL,
  country TEXT NOT NULL,
  gap_days INTEGER NOT NULL,
  upgraded_from_version TEXT NOT NULL DEFAULT '',
  pings INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day_started_at_utc, version, platform, architecture, country, gap_days, upgraded_from_version)
);

-- Usage from 0.1.28 on, one row per install per UTC day, added in migration
-- 0004. The successor to `app_pings`: builds that send an id write here and
-- nowhere else, builds too old to send one keep writing `app_pings`, so nothing
-- is counted twice and `app_pings` can be dropped once few enough of those are
-- left. A row per day rather than per install, because this is now the only
-- record of history — `MIN(day)` per install is when it was first seen. The id
-- is a random v4 uuid the app generates for itself.
CREATE TABLE IF NOT EXISTS app_usage (
  install_id TEXT NOT NULL,
  day TEXT NOT NULL, -- 2026-09-20T00:00:00Z
  seen_at TEXT NOT NULL, -- 2026-09-20T16:17:18.266Z
  version TEXT NOT NULL,
  platform TEXT NOT NULL,
  architecture TEXT NOT NULL,
  country TEXT NOT NULL,
  PRIMARY KEY (install_id, day)
);

CREATE INDEX IF NOT EXISTS app_usage_day ON app_usage (day);
