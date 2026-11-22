import type { Metadata, Viewport } from "next";
import "./globals.css";
import { t } from "@/i18n/en";

export const metadata: Metadata = {
  title: t("appName"),
  description: t("tagline"),
  appleWebApp: { capable: true, title: t("appName"), statusBarStyle: "default" },
  icons: { apple: "/icons/apple-touch-icon.png" },
};

// Page zoom stays enabled (accessibility). Safe-area insets are applied on <body> in globals.css.
export const viewport: Viewport = {
  themeColor: "#2563eb",
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
