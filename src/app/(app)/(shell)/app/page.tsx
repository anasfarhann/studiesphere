import { Dashboard } from "@/features/dashboard/Dashboard";
import { getDisplayName, getFolderSummaries, getRecentPages } from "@/features/dashboard/queries";

export default async function AppHome() {
  const [name, folders, recent] = await Promise.all([getDisplayName(), getFolderSummaries(), getRecentPages(3)]);
  return <Dashboard name={name} folders={folders} recent={recent} />;
}
