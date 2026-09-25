-- Which features were used, per install per UTC day. From 0.1.29.
--
-- The app counts uses locally — screens opened, tabs picked, a few actions,
-- names from a fixed list in `commands/telemetry.rs` — and sends the counts
-- since its last report with the daily ping. Nothing typed, searched, saved,
-- read or played is ever part of a name. The endpoint accepts only short
-- lowercase names in the screen/tab/action families (`src/usage.ts`).
--
-- Counts arrive with the next day's ping, so a row's `day` is the day they
-- were reported, covering use since the install's previous report.
--
-- Same keying and write rule as `app_usage`: one row per install, day and
-- event, never updated, so a retried ping cannot count anything twice. Join on
-- (install_id, day) to split by version, platform or country.
CREATE TABLE IF NOT EXISTS usage_events (
  install_id TEXT NOT NULL, -- random v4 uuid, as in app_usage
  day TEXT NOT NULL, -- 2026-09-20T00:00:00Z, as in app_usage
  event TEXT NOT NULL, -- screen.news, tab.bazar.metals, action.radio-play
  count INTEGER NOT NULL,
  PRIMARY KEY (install_id, day, event)
);

CREATE INDEX IF NOT EXISTS usage_events_day ON usage_events (day, event);

-- A few display choices, as they stood on the day of each report: language,
-- digits, theme, text size, reminder style, and which modules are on. Each
-- value is one short word.
CREATE TABLE IF NOT EXISTS usage_settings (
  install_id TEXT NOT NULL,
  day TEXT NOT NULL,
  key TEXT NOT NULL, -- language, numerals, reminderStyle, radio, ...
  value TEXT NOT NULL, -- en, latin, card, off, ...
  PRIMARY KEY (install_id, day, key)
);

CREATE INDEX IF NOT EXISTS usage_settings_day ON usage_settings (day, key);
