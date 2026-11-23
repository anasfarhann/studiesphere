import { notFound } from "next/navigation";
import { Dashboard } from "@/features/dashboard/Dashboard";
import type { RecentPage, SubjectSummary } from "@/features/dashboard/queries";
import { AppRail } from "@/ui/AppRail";

const long = "A very long subject name that keeps going well past any card width";
const subjects: SubjectSummary[] = [
  { id: "s1", name: "Biology", tint: "#F6CFCF", notebooks: 2, pages: 12 },
  { id: "s2", name: "Chemistry", tint: "#F9DFC0", notebooks: 1, pages: 4 },
  { id: "s3", name: "History", tint: "#DCD6FA", notebooks: 3, pages: 9 },
  { id: "s4", name: long, tint: "#C9EEDB", notebooks: 1, pages: 1 },
];
const now = Date.now();
const recent: RecentPage[] = [
  { id: "p1", title: "Cell walls and membranes", subjectName: "Biology", notebookTitle: "Cells", tint: "#F6CFCF", editedAt: new Date(now - 3_600_000).toISOString() },
  { id: "p2", title: "Moles and stoichiometry", subjectName: "Chemistry", notebookTitle: "Calculations", tint: "#F9DFC0", editedAt: new Date(now - 86_400_000).toISOString() },
  { id: "p3", title: long + " page title", subjectName: long, notebookTitle: "Notebook with an equally long title for overflow", tint: "#C9EEDB", editedAt: new Date(now - 5 * 86_400_000).toISOString() },
];

/** Dev-only dashboard with fixture data and no sign-in, used by e2e layout tests. 404 in production. */
export default function DevDashboardPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <div className="flex flex-1 flex-col gap-5 p-5 pb-28 md:flex-row md:pb-5">
      <AppRail active="home" />
      <div className="flex min-w-0 flex-1 flex-col">
        <Dashboard name="Anas" subjects={subjects} recent={recent} />
      </div>
    </div>
  );
}
