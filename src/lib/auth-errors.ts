import { t } from "@/i18n/en";

/** Maps a Supabase auth error to a user-facing string. */
export function authErrorMessage(error: { message: string; code?: string }): string {
  if (error.code === "invalid_credentials" || /invalid login credentials/i.test(error.message)) {
    return t("invalidCredentials");
  }
  return error.message || t("authGenericError");
}
