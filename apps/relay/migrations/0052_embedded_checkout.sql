-- Freeze the provider UI with the checkout identity, including unknown outcomes.
ALTER TABLE arc_billing_checkouts ADD COLUMN ui_mode TEXT NOT NULL DEFAULT 'hosted_page'
 CHECK(ui_mode IN ('hosted_page','embedded_page'));
