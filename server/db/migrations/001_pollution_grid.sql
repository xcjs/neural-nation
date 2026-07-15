CREATE TABLE IF NOT EXISTS pollution_grid (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lat_index INTEGER NOT NULL,
  lon_index INTEGER NOT NULL,
  pollution REAL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_pollution_grid_lat_lon ON pollution_grid(lat_index, lon_index);

INSERT INTO pollution_grid (lat_index, lon_index, pollution)
SELECT lat, lon, 0
FROM (
  WITH RECURSIVE lat_seq(x) AS (
    SELECT 0 UNION ALL SELECT x + 1 FROM lat_seq WHERE x < 359
  ),
  lon_seq(y) AS (
    SELECT 0 UNION ALL SELECT y + 1 FROM lon_seq WHERE y < 719
  )
  SELECT x AS lat, y AS lon FROM lat_seq CROSS JOIN lon_seq
)
WHERE NOT EXISTS (SELECT 1 FROM pollution_grid LIMIT 1);

-- Reset global pollution to match the fresh grid (all zeros).
-- Old EnvironmentTick accumulated pollution as a global scalar;
-- PollutionGridTick now derives it from the per-cell grid average.
UPDATE environment SET pollutionLevel = 0 WHERE key = 'global';