import Link from "next/link";
import { t } from "@/i18n/en";

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 p-8 text-center">
      <h1 className="text-4xl font-semibold">{t("appName")}</h1>
      <p className="max-w-md text-lg opacity-80">{t("tagline")}</p>
      <Link
        href="/login"
        className="rounded-md bg-foreground px-5 py-2 font-medium text-background"
      >
        {t("signIn")}
      </Link>
    </main>
  );
}
