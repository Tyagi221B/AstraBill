/**
 * GSTIN lookup — public surface.
 *
 * Re-exports the service entry point (`lookupGstin`) and the typed
 * `GstinProfile` shape. Internal adapter selection happens in `factory.ts`.
 *
 * Route + form code should ONLY touch this file (or `./types`). Swapping
 * vendors is a one-line change to `factory.ts`.
 */
import "server-only";

export { lookupGstin } from "./service";
export { isGstinLookupAvailable } from "./factory";
export type {
  GstinAddress,
  GstinLookupAdapter,
  GstinProfile,
} from "./types";
export {
  GstinAdapterUnavailableError,
  GstinInvalidError,
  GstinNotFoundError,
  normaliseGstin,
} from "./types";
