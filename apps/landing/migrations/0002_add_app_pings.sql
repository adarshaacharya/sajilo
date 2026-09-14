CREATE TABLE IF NOT EXISTS app_pings (
  day_npt TEXT NOT NULL,
  version TEXT NOT NULL,
  platform TEXT NOT NULL,
  architecture TEXT NOT NULL,
  country TEXT NOT NULL,
  gap_days INTEGER NOT NULL,
  upgraded_from_version TEXT NOT NULL DEFAULT '',
  pings INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (
    day_npt,
    version,
    platform,
    architecture,
    country,
    gap_days,
    upgraded_from_version
  )
);
