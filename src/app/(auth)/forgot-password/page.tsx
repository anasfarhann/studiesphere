import type { Metadata } from "next";
import { t } from "@/i18n/en";
import { ForgotPasswordForm } from "./ForgotPasswordForm";

export const metadata: Metadata = { title: `${t("forgotTitle")} · ${t("appName")}` };

export default function ForgotPasswordPage() {
  return <ForgotPasswordForm />;
}
