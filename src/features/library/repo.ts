import { t } from "@/i18n/en";
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

/** Thrown for invalid user input; safe to map to a translated message. */
export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

/** Trims and validates a user-entered name; throws 'Name is required' when blank. */
export function requireName(value: string): string {
  const name = value.trim();
  if (!name) throw new ValidationError(t("nameRequired"));
  return name;
}
