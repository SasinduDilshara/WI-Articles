-- Schema + seed data for VoltMart's order database.
-- Runs automatically the first time the Postgres container starts.

CREATE TABLE IF NOT EXISTS orders (
    order_number  TEXT PRIMARY KEY,
    account_email TEXT NOT NULL,
    item          TEXT NOT NULL,
    -- processing | shipped | delivered
    status        TEXT NOT NULL DEFAULT 'processing',
    eta           TEXT NOT NULL
);

INSERT INTO orders (order_number, account_email, item, status, eta) VALUES
    ('10432', 'jordan@example.com', 'AirWave Pro wireless headphones', 'shipped',    'arriving Thursday, 18 June 2026'),
    ('10588', 'priya@example.com',  'SoundDock 2 Bluetooth speaker',   'processing', 'ships within 1 business day'),
    ('10219', 'sam@example.com',    'VoltBook 14 laptop',              'delivered',  'delivered on 9 June 2026')
ON CONFLICT (order_number) DO NOTHING;
