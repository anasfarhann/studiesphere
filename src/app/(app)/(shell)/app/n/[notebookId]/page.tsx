import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { getNotebook } from "@/features/library/lookups";

/** Notebooks are no longer shown: an old /app/n/<id> link opens the folder that holds it. */
export default async function NotebookRedirect({ params }: { params: Promise<{ notebookId: string }> }) {
  await getUser();
  const { notebookId } = await params;
  const notebook = await getNotebook(notebookId); // notFound() for a bad or foreign id
  redirect(`/app/s/${notebook.subject_id}`);
}
