import type { Metadata, Viewport } from "next";
import "@fontsource-variable/dm-sans";
// Text-tool fonts: latin only, regular and bold (plus italics where the family has them). The browser
// downloads a face only when a note uses it.
import "@fontsource/lora/latin-400.css";
import "@fontsource/lora/latin-400-italic.css";
import "@fontsource/lora/latin-700.css";
import "@fontsource/lora/latin-700-italic.css";
import "@fontsource/caveat/latin-400.css";
import "@fontsource/caveat/latin-700.css";
import "@fontsource/jetbrains-mono/latin-400.css";
import "@fontsource/jetbrains-mono/latin-400-italic.css";
import "@fontsource/jetbrains-mono/latin-700.css";
import "@fontsource/jetbrains-mono/latin-700-italic.css";
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
  themeColor: "#F6F2EE",
  viewportFit: "cover",
  // Light-only for now (dark mode is not designed yet): keeps UA controls light too.
  colorScheme: "light",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
