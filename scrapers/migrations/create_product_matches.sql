-- Cache table for Claude-verified product matches.
-- One row per (store, retailer catalog code) pair.
-- product_id is NULL if Claude determined there's no match.

CREATE TABLE IF NOT EXISTS product_matches (
    store_slug     TEXT NOT NULL,
    retailer_code  TEXT NOT NULL,
    retailer_name  TEXT,
    product_id     UUID REFERENCES products(id) ON DELETE SET NULL,
    confidence     REAL NOT NULL DEFAULT 0.0,
    reason         TEXT,
    matched_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (store_slug, retailer_code)
);

CREATE INDEX IF NOT EXISTS idx_product_matches_product ON product_matches(product_id);
