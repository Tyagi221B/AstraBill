-- PR7-C — gstin_cache table for the "Get Details" GSTIN-lookup feature.
--
-- A shared cross-tenant cache of GSTIN profile lookups (legal name, trade
-- name, registered address, status, etc.) fetched from a third-party GST
-- data vendor (Sandbox API for V1; the adapter pattern in lib/services/
-- gstin lets us swap to Setu / Cleartax later without code at the call
-- sites).
--
-- Cross-tenant is intentional: the data is public (GST portal exposes it
-- through a captcha-gated page; vendors just programmatic-fetch it). If
-- two businesses look up the same GSTIN, they should share the cache hit
-- so neither pays the vendor's per-call fee twice. The read path still
-- requires an authed user (anti-abuse) — see app/api/gstin/[gstin]/route.ts.
--
-- The row stores both the normalised columns (driven by the GstinProfile
-- TS shape) and the raw vendor JSON, so re-parsing on adapter change is
-- free. `vendor` discriminates fetch source for TTL + age-out.

BEGIN;

CREATE TABLE IF NOT EXISTS "gstin_cache" (
  "gstin"             text PRIMARY KEY,
  "legal_name"        text,
  "trade_name"        text,
  "street_address"    text,
  "city"              text,
  "state"             text,
  "state_code"        text,
  "pincode"           text,
  "status"            text,
  "registration_date" date,
  "business_type"     text,
  "raw_response"      jsonb,
  "vendor"            text NOT NULL,
  "fetched_at"        timestamp with time zone NOT NULL DEFAULT now(),
  "cache_expires_at"  timestamp with time zone NOT NULL,
  CONSTRAINT "gstin_cache_gstin_format" CHECK ("gstin" ~ '^[0-9A-Z]{15}$')
);

CREATE INDEX IF NOT EXISTS "gstin_cache_expires_idx"
  ON "gstin_cache" ("cache_expires_at");

COMMIT;
