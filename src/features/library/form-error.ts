import { unstable_rethrow } from "next/navigation";
import { t } from "@/i18n/en";
import { ValidationError } from "./repo";

export type FormState = { error: string } | null;

/**
 * Maps any thrown value to a translated, user-safe message (never raw error text).
 * Next control-flow errors (redirect, notFound) are rethrown, not mapped.
 */
export function toFormError(e: unknown): { error: string } {
  unstable_rethrow(e);
  if (e instanceof ValidationError) return { error: t("nameRequired") };
  return { error: t("genericError") };
}
