import { Dashboard } from "@/features/dashboard/Dashboard";
import { getDisplayName, getRecentPages, getSubjectSummaries } from "@/features/dashboard/queries";

export default async function AppHome() {
  const [name, subjects, recent] = await Promise.all([getDisplayName(), getSubjectSummaries(), getRecentPages(3)]);
  return <Dashboard name={name} subjects={subjects} recent={recent} />;
}
