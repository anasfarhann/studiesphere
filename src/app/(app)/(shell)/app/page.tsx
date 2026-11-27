import { Dashboard } from "@/features/dashboard/Dashboard";
import { getDisplayName, getFolderSummaries, getRecentPages } from "@/features/dashboard/queries";
import { t } from "@/i18n/en";
import { FlashNotice } from "@/ui/FlashNotice";

export default async function AppHome({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [{ notice }, name, folders, recent] = await Promise.all([
    searchParams,
    getDisplayName(),
    getFolderSummaries(),
    getRecentPages(3),
  ]);
  return (
    <>
      {notice === "password-updated" && <FlashNotice message={t("passwordUpdated")} />}
      <Dashboard name={name} folders={folders} recent={recent} />
    </>
  );
}
