import { t } from "@/i18n/en";
import { ValidationError } from "./repo";

export type FormState = { error: string } | null;

/** Maps any thrown value to a translated, user-safe message (never raw error text). */
export function toFormError(e: unknown): { error: string } {
  if (e instanceof ValidationError) return { error: t("nameRequired") };
  return { error: t("genericError") };
}
