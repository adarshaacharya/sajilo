-- Download clicks, counted rather than logged.
--
-- One row per Nepal-hour, platform, country and referring site, holding a
-- running total. `hour_started_at_npt` is a complete, sortable ISO timestamp
-- in Nepal time (+05:45), so D1 Studio shows one natural date/time field
-- rather than a separate day and hour.
--
-- Nothing identifies a visitor, and nothing here can be traced back to one:
-- the table cannot answer "who", only "how many".
--
-- The referrer is reduced to a hostname on the way in. A full URL is a liability
-- rather than an insight: it can carry the search terms someone typed, or the
-- path of a private page that linked here. "reddit.com" is the whole of what is
-- worth knowing.
CREATE TABLE IF NOT EXISTS download_clicks (
  hour_started_at_npt TEXT NOT NULL, -- 2026-09-14T14:00:00+05:45
  platform TEXT NOT NULL,  -- macos-arm64, windows, linux-deb, …
  country  TEXT NOT NULL,  -- ISO country code, XX when unknown
  referrer TEXT NOT NULL,  -- hostname only; "direct" when there is none
  clicks   INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (hour_started_at_npt, platform, country, referrer)
);

-- Deliberately aggregate-only. The telemetry Worker derives country at the
-- edge and stores no identifier, IP address, request timestamp, or raw event.
CREATE TABLE IF NOT EXISTS app_pings (
  day_npt TEXT NOT NULL,
  version TEXT NOT NULL,
  platform TEXT NOT NULL,
  architecture TEXT NOT NULL,
  country TEXT NOT NULL,
  gap_days INTEGER NOT NULL,
  upgraded_from_version TEXT NOT NULL DEFAULT '',
  pings INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day_npt, version, platform, architecture, country, gap_days, upgraded_from_version)
);
