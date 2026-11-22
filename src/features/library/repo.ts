import type { Notebook, Page, Subject } from "./types";

export interface LibraryRepo {
  listSubjects(): Promise<Subject[]>;
  createSubject(input: { name: string; color: string }): Promise<Subject>;
  renameSubject(id: string, name: string): Promise<void>;
  deleteSubject(id: string): Promise<void>;
  listNotebooks(subjectId: string): Promise<Notebook[]>;
  createNotebook(subjectId: string, title: string): Promise<Notebook>;
  listPages(notebookId: string): Promise<Page[]>;
  createPage(notebookId: string): Promise<Page>; // title 'Untitled', sort_order = last + 1
}

export const NAME_REQUIRED = "Name is required";

/** Trims and validates a user-entered name; throws 'Name is required' when blank. */
export function requireName(value: string): string {
  const name = value.trim();
  if (!name) throw new Error(NAME_REQUIRED);
  return name;
}
