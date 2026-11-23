/** Distinct page ids from rows of non-deleted audio elements. */
export function pagesWithAudio(rows: { page_id: string }[]): Set<string> {
  return new Set(rows.map((r) => r.page_id));
}
