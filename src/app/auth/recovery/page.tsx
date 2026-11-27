import type { Metadata } from "next";
import { t } from "@/i18n/en";
import { RecoveryLanding } from "./RecoveryLanding";

export const metadata: Metadata = {
  title: `${t("resetTitle")} · ${t("appName")}`,
  // The fragment carries tokens; never leak this URL to other origins.
  referrer: "no-referrer",
};

/** Landing of the default reset-password email link; the work happens client-side (URL fragment). */
export default function RecoveryPage() {
  return <RecoveryLanding />;
}
