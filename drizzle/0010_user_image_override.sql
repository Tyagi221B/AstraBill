-- User-uploaded avatar override column.
--
-- Display logic everywhere reads `image_override ?? image`. OAuth (Google)
-- still populates `image` on first sign-in for fallback; the override is
-- what the owner sets via /b/[id]/settings/account when they want a
-- different avatar (or none of the Google picture). Setting the column
-- back to NULL reverts to the OAuth picture.
--
-- Nullable, additive — no locks of consequence on shared prod.

BEGIN;

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "image_override" text;

COMMIT;
