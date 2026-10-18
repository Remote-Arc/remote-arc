-- Connections enable available tools. OAuth grants and upstream scopes still
-- govern access. Old pending requests are cancelled, never executed on upgrade.
UPDATE app_connections SET permissions_json='["read","write"]';
UPDATE app_calls SET status='cancelled',error_code='app_legacy_request_cancelled',updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE status='pending_approval';
