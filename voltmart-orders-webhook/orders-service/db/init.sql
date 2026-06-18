-- Schema + seed data for VoltMart's order database.
-- Runs automatically the first time the Postgres container starts.

CREATE TABLE IF NOT EXISTS orders (
    order_number   TEXT PRIMARY KEY,
    account_email  TEXT NOT NULL,
    item           TEXT NOT NULL,
    -- processing | shipped | delivered
    status         TEXT NOT NULL DEFAULT 'processing',
    eta            TEXT NOT NULL,
    -- The day the order was delivered (NULL until it is). The requestReturn tool uses this
    -- to enforce the 30-day return window. Seeded RELATIVE to CURRENT_DATE so the tutorial's
    -- eligibility checks behave the same whenever you run it, instead of rotting on a fixed date.
    delivered_date DATE
);

INSERT INTO orders (order_number, account_email, item, status, eta, delivered_date) VALUES
    ('10432', 'jordan@example.com', 'AirWave Pro wireless headphones', 'shipped',    'arriving in 2-3 business days', NULL),
    ('10588', 'priya@example.com',  'SoundDock 2 Bluetooth speaker',   'processing', 'ships within 1 business day',    NULL),
    -- Delivered 9 days ago: inside the 30-day window, so it can be returned.
    ('10219', 'sam@example.com',    'VoltBook 14 laptop',              'delivered',  'delivered',                     CURRENT_DATE - 9),
    -- Delivered 48 days ago: past the window, so requestReturn rejects it with RETURN_WINDOW_CLOSED.
    ('10350', 'alex@example.com',   'PowerCharge 65W USB-C adapter',   'delivered',  'delivered',                     CURRENT_DATE - 48)
ON CONFLICT (order_number) DO NOTHING;

-- Return requests filed by customers through the requestReturn tool. The orders service INSERTs
-- a row here, then fires a webhook so the returns team is alerted in real time. This table is the
-- durable record of the request; the webhook is the live notification on top of it.
-- The team owns everything past 'requested' (approving, rejecting, issuing the refund) — the
-- agent only ever files the request, never decides the outcome.
CREATE TABLE IF NOT EXISTS returns (
    id            SERIAL PRIMARY KEY,
    order_number  TEXT NOT NULL REFERENCES orders(order_number),
    account_email TEXT NOT NULL,
    item          TEXT NOT NULL,
    reason        TEXT NOT NULL,
    -- requested | approved | rejected
    status        TEXT NOT NULL DEFAULT 'requested',
    requested_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
