-- Preserve the original allowance and spent/reserved accounting. Trial access
-- still expires according to arc_trials; remaining wallet Credits do not.
UPDATE arc_credit_lots SET expires_at=NULL
WHERE source='trial' AND expires_at IS NOT NULL;
