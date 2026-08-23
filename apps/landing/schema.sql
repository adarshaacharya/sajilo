-- Download clicks, counted rather than logged.
--
-- One row per day, platform, country and referring site, holding a running
-- total. Nothing identifies a visitor, and nothing here can be traced back to
-- one — the table cannot answer "who", only "how many".
--
-- The referrer is reduced to a hostname on the way in. A full URL is a liability
-- rather than an insight: it can carry the search terms someone typed, or the
-- path of a private page that linked here. "reddit.com" is the whole of what is
-- worth knowing.
CREATE TABLE IF NOT EXISTS download_clicks (
  day      TEXT NOT NULL,  -- YYYY-MM-DD, UTC
  platform TEXT NOT NULL,  -- macos-arm64, windows, linux-deb, …
  country  TEXT NOT NULL,  -- ISO country code, XX when unknown
  referrer TEXT NOT NULL,  -- hostname only; "direct" when there is none
  clicks   INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, platform, country, referrer)
);
