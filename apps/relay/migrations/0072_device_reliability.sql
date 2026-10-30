-- Operational counters only; no hostname, path, command, payload or exception text.
CREATE TABLE device_connection_buckets (
  bucket_start TEXT NOT NULL,
  device_id TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK(platform IN ('win32','darwin','linux','browser','unknown')),
  agent_version TEXT NOT NULL,
  connects INTEGER NOT NULL DEFAULT 0,
  disconnects INTEGER NOT NULL DEFAULT 0,
  heartbeats INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(bucket_start, device_id)
);
CREATE INDEX device_connection_buckets_device ON device_connection_buckets(device_id, bucket_start);

CREATE TABLE service_reliability_state (
  signal TEXT PRIMARY KEY CHECK(signal = 'device_reconnect_churn'),
  phase TEXT NOT NULL CHECK(phase IN ('healthy','pending','firing','recovering')),
  unhealthy_since TEXT,
  healthy_since TEXT,
  last_evaluated_at TEXT NOT NULL,
  last_notification_at TEXT,
  notified_phase TEXT CHECK(notified_phase IN ('healthy','firing'))
);
