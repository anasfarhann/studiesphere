import { notFound } from "next/navigation";
import { FolderView } from "@/features/library/views";
import { AppRail } from "@/ui/AppRail";
import { DEV_PREVIEW_URL } from "../preview-fixture";

const folders = [
  { id: "f1", name: "Biology" },
  { id: "f2", name: "Chemistry" },
];
const pages = [
  { id: "p1", title: "Cell walls and membranes" },
  { id: "p2", title: "Mitosis" },
  { id: "p3", title: "Photosynthesis" },
];

/** Dev-only folder view with fixture data and no sign-in, used by e2e layout tests. 404 in production. */
export default function DevFolderPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <div className="flex flex-1 flex-col gap-5 p-5 pb-28 md:flex-row md:pb-5">
      <AppRail active="home" />
      <div className="flex min-w-0 flex-1 flex-col">
        <FolderView folder={{ id: "f1", name: "Biology", color: "#dc2626" }} pages={pages} audioPageIds={new Set()} folders={folders} previewUrls={{ p2: DEV_PREVIEW_URL }} />
      </div>
    </div>
  );
}
