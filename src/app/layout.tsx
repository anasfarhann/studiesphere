import type { Metadata } from "next";
import "./globals.css";
import { t } from "@/i18n/en";

export const metadata: Metadata = {
  title: t("appName"),
  description: t("tagline"),
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
