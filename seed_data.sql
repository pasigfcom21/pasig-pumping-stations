-- ============================================================
-- PASIG CITY PUMPING STATION MONITOR
-- Run this in Supabase → SQL Editor to insert initial data
-- ============================================================

-- Insert Pumping Station #01
INSERT INTO stations (id, name, location, lat, lng, status, capacity, pumps, coverage_geojson)
VALUES (
  1,
  'Pumping Station #01',
  'At the back of San Jose Barangay Hall',
  14.561450839469847,
  121.0733400399449,
  'operational',
  '12 m³/s',
  NULL,
  '{"type":"FeatureCollection","features":[{"type":"Feature","properties":{},"geometry":{"type":"Polygon","coordinates":[[[121.07284548675112,14.560586155499585],[121.07212108675112,14.559534555499585],[121.07573638675113,14.556841155499585],[121.07875358675112,14.560472055499586],[121.07972798675112,14.563846855499586],[121.07794098675113,14.566339755499586],[121.07381158675112,14.566101055499585],[121.07284548675112,14.560586155499585]]]}}]}'
);

-- Insert Pumping Station #02
INSERT INTO stations (id, name, location, lat, lng, status, capacity, pumps, coverage_geojson)
VALUES (
  2,
  'Pumping Station #02',
  'Katwiran Street',
  14.555826720694107,
  121.07264443434418,
  'operational',
  '8 m³/s',
  2,
  '{"type":"FeatureCollection","features":[{"type":"Feature","properties":{},"geometry":{"type":"Polygon","coordinates":[[[121.0693855,14.5577561],[121.0681104,14.5580905],[121.0692359,14.5572609],[121.0705309,14.5567392],[121.0719331,14.5557625],[121.0735481,14.5552598],[121.0767301,14.5539031],[121.077695,14.5538937],[121.0791873,14.5540544],[121.0803306,14.5571442],[121.0806462,14.5591034],[121.0765643,14.560224],[121.0747677,14.5586897],[121.0727883,14.5604087],[121.0725176,14.559863],[121.0716997,14.5587847],[121.0693855,14.5577561]]]}}]}'
);

-- Insert Operator for PS#01
INSERT INTO operators (station_id, name, contact)
VALUES (1, 'Patrick Vincent B. Pomarca', '0933-4444-555');

-- Insert Operator for PS#02
INSERT INTO operators (station_id, name, contact)
VALUES (2, 'Ricky Calicdan', '0923-4424-555');

-- Insert initial status report for PS#01
INSERT INTO status_reports (station_id, water_level, runtime_hours, last_maintenance, notes, reported_by, source)
VALUES (1, '0.8 m', '14 hrs today', 'May 10, 2025', 'All pumps running normally. No issues reported.', 'Patrick Vincent B. Pomarca', 'manual');

-- Insert initial status report for PS#02
INSERT INTO status_reports (station_id, water_level, runtime_hours, last_maintenance, notes, reported_by, source)
VALUES (2, '0.5 m', '10 hrs today', 'May 8, 2025', 'Pump 2 running at reduced capacity. Monitoring ongoing.', 'Ricky Calicdan', 'manual');

-- Confirm data was inserted
SELECT 'Stations inserted: ' || COUNT(*) FROM stations;
SELECT 'Operators inserted: ' || COUNT(*) FROM operators;
SELECT 'Reports inserted: ' || COUNT(*) FROM status_reports;
