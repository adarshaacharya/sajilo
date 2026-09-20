-- Usage, one row per install per UTC day. The successor to `app_pings`.
--
-- `app_pings` is an aggregate: one row per bucket per day with a counter, and
-- no id, so it can say how busy a day was but never whether that was one
-- install returning or thirty arriving once. From 0.1.28 the app sends a random
-- id it generates for itself, which is what this table is keyed on.
--
-- A row per day rather than a row per install: this table is now the only
-- record of history for the builds that write to it, so overwriting a single
-- row per install would leave nothing to chart. `MIN(day)` per install is the
-- date it was first seen; `MAX(day)` the last.
--
-- The split, until `app_pings` can be dropped:
--
--   ping carries an id (0.1.28+) -> app_usage, and nothing else
--   ping carries no id (0.1.27-) -> app_pings, as it always has
--
-- Nothing is written twice, and no install is counted in both. `app_pings`
-- keeps every count taken before this migration and keeps receiving from older
-- builds, so it can be dropped once few enough of those are left — at which
-- point this table is the whole picture.
--
-- The id is a random v4 uuid: not derived from the machine, kept but unsent
-- while the count is switched off, and dropped on backup import so a restored
-- backup is a new install rather than the same one counted twice.
CREATE TABLE IF NOT EXISTS app_usage (
  install_id TEXT NOT NULL, -- random v4 uuid
  -- The instant the counted UTC day began, in the same form `app_pings` files
  -- its rows under, so the two can be read together while both exist.
  day TEXT NOT NULL, -- 2026-09-20T00:00:00Z
  -- When the ping actually arrived. The app's background refresh sends it —
  -- 15 seconds after launch, hourly after that — so this marks the app running,
  -- not anything the user did.
  seen_at TEXT NOT NULL, -- 2026-09-20T16:17:18.266Z
  -- What was true on that day. A row is never updated, so an install that
  -- updates or travels shows the change from the day it happened instead of one
  -- current value overwriting its own past.
  version TEXT NOT NULL,
  platform TEXT NOT NULL,
  architecture TEXT NOT NULL,
  country TEXT NOT NULL,
  -- A day already recorded for this install collides here and is dropped, so a
  -- retry or a clock nudged backwards cannot count the same day twice.
  PRIMARY KEY (install_id, day)
);

-- Daily counts and active-window queries scan by day, not by id.
CREATE INDEX IF NOT EXISTS app_usage_day ON app_usage (day);
