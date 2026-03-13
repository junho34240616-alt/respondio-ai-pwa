ALTER TABLE payments ADD COLUMN provider TEXT DEFAULT 'manual';
ALTER TABLE payments ADD COLUMN plan_id INTEGER;
ALTER TABLE payments ADD COLUMN payment_id TEXT;
ALTER TABLE payments ADD COLUMN raw_payload TEXT;
ALTER TABLE payments ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE subscriptions ADD COLUMN cancel_at_period_end INTEGER DEFAULT 0;
ALTER TABLE subscriptions ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE store_platform_connections ADD COLUMN login_email TEXT;
ALTER TABLE store_platform_connections ADD COLUMN login_password_encrypted TEXT;
ALTER TABLE store_platform_connections ADD COLUMN last_error TEXT;
ALTER TABLE store_platform_connections ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP;

CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_payment_id ON payments(payment_id);

CREATE TABLE IF NOT EXISTS payment_webhook_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider TEXT NOT NULL,
  event_id TEXT NOT NULL UNIQUE,
  event_type TEXT,
  payload TEXT,
  processed_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
