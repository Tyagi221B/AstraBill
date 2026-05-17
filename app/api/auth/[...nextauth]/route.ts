/**
 * NextAuth v5 catch-all route. All actual config lives in lib/auth.ts.
 */
import { handlers } from "@/lib/auth";

export const { GET, POST } = handlers;
