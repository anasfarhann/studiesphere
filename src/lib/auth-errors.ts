import { t } from "@/i18n/en";

type AuthLike = { message?: string; code?: string; name?: string; status?: number };

/** Maps a Supabase auth error (or a thrown error) to a translated user-facing string. Never returns raw text. */
export function authErrorMessage(error: unknown): string {
  const e: AuthLike = typeof error === "object" && error !== null ? (error as AuthLike) : {};
  if (error instanceof TypeError || e.name === "AuthRetryableFetchError" || e.status === 0) {
    return t("networkError");
  }
  switch (e.code) {
    case "invalid_credentials":
      return t("invalidCredentials");
    case "weak_password":
      return t("weakPassword");
    case "over_request_rate_limit":
    case "over_email_send_rate_limit":
      return t("rateLimited");
    case "user_already_exists":
      return t("userAlreadyExists");
    case "email_address_invalid":
      return t("invalidEmail");
  }
  if (/invalid login credentials/i.test(e.message ?? "")) return t("invalidCredentials");
  return t("authGenericError");
}
