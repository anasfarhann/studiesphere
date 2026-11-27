"use server";

import { cookies } from "next/headers";
import { RECOVERY_COOKIE } from "@/lib/recovery-cookie";

/** Ends the recovery window once the new password is saved. */
export async function clearRecoveryCookie() {
  (await cookies()).delete(RECOVERY_COOKIE);
}
