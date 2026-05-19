/**
 * POST /api/uploads/signature — issue signed params for one logo upload.
 *
 * The browser sends `{ businessId }`; on success it gets back the signature
 * + timestamp + folder it needs to upload one file straight to Cloudinary.
 * The API secret never leaves the server (see lib/cloudinary.ts).
 *
 * Gated: only an owner of that business (`settings:edit`) can get a
 * signature, and the folder is baked into the signature — the browser
 * cannot re-point the upload at another business.
 */
import { z } from "zod";

import { isCloudinaryConfigured, signLogoUpload } from "@/lib/cloudinary";
import { AppError } from "@/lib/errors";
import { ok, parseJson, route } from "@/lib/http";
import { requirePermission } from "@/lib/rbac";
import { requireUser } from "@/lib/session";

const bodySchema = z.object({ businessId: z.string().uuid() });

export const POST = route(async (req) => {
  const user = await requireUser();
  const { businessId } = await parseJson(req, bodySchema);

  // Owner-only — same gate as editing any business setting.
  await requirePermission(user.id, businessId, "settings:edit");

  if (!isCloudinaryConfigured()) {
    throw new AppError(
      "Logo upload is unavailable — image storage is not configured.",
      { status: 503, code: "SERVICE_UNAVAILABLE" },
    );
  }

  return ok(signLogoUpload(businessId));
});
