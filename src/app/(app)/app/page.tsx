import { t } from "@/i18n/en";

export default function AppHome() {
  return (
    <main className="p-8">
      <h1 className="text-2xl font-semibold">{t("appHomeTitle")}</h1>
    </main>
  );
}
