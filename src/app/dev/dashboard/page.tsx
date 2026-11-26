import { notFound } from "next/navigation";
import { Dashboard } from "@/features/dashboard/Dashboard";
import type { FolderSummary, RecentPage } from "@/features/dashboard/queries";
import { AppRail } from "@/ui/AppRail";
import { DEV_PREVIEW_URL } from "../preview-fixture";

const long = "A very long folder name that keeps going well past any card width";
const folders: FolderSummary[] = [
  { id: "s1", name: "Biology", tint: "#F6CFCF", pages: 12 },
  { id: "s2", name: "Chemistry", tint: "#F9DFC0", pages: 4 },
  { id: "s3", name: "History", tint: "#DCD6FA", pages: 9 },
  { id: "s4", name: long, tint: "#C9EEDB", pages: 1 },
];
const now = Date.now();
const recent: RecentPage[] = [
  { id: "p1", folderId: "s1", title: "Cell walls and membranes", folderName: "Biology", tint: "#F6CFCF", editedAt: new Date(now - 3_600_000).toISOString(), previewUrl: DEV_PREVIEW_URL },
  { id: "p2", folderId: "s2", title: "Moles and stoichiometry", folderName: "Chemistry", tint: "#F9DFC0", editedAt: new Date(now - 86_400_000).toISOString() },
  { id: "p3", folderId: "s4", title: long + " page title", folderName: long, tint: "#C9EEDB", editedAt: new Date(now - 5 * 86_400_000).toISOString() },
];

/** Dev-only dashboard with fixture data and no sign-in, used by e2e layout tests. 404 in production. */
export default function DevDashboardPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <div className="flex flex-1 flex-col gap-5 p-5 pb-28 md:flex-row md:pb-5">
      <AppRail active="home" />
      <div className="flex min-w-0 flex-1 flex-col">
        <Dashboard name="Anas" folders={folders} recent={recent} />
      </div>
    </div>
  );
}
