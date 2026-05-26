/**
 * POST /api/uploads/user-avatar/signature — issue signed params for one
 * user-avatar upload.
 *
 * No request body — the caller's own user id is read from the session and
 * baked into the signed `asset_folder`, so the browser can only upload into
 * its own user's folder.
 *
 * Gated: any authenticated user can request a signature (no business or
 * permission check — the avatar belongs to the user, not a business).
 */
import { isCloudinaryConfigured, signUserAvatarUpload } from "@/lib/cloudinary";
import { AppError } from "@/lib/errors";
import { ok, route } from "@/lib/http";
import { requireUser } from "@/lib/session";

export const POST = route(async () => {
  const user = await requireUser();

  if (!isCloudinaryConfigured()) {
    throw new AppError(
      "Avatar upload is unavailable — image storage is not configured.",
      { status: 503, code: "SERVICE_UNAVAILABLE" },
    );
  }

  return ok(signUserAvatarUpload(user.id));
});
