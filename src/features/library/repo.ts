import { t } from "@/i18n/en";
import type { Notebook, Page, Subject } from "./types";

/**
 * Library data access. A folder in the UI is a `subjects` row; it keeps its pages in one hidden "Pages"
 * notebook (see ensureFolderNotebook), and older folders may have several notebooks.
 */
export interface LibraryRepo {
  listSubjects(): Promise<Subject[]>;
  createSubject(input: { name: string; color: string }): Promise<Subject>;
  renameSubject(id: string, name: string): Promise<void>;
  /** Deletes an empty folder (and its empty notebooks); throws FolderNotEmptyError when it has pages. */
  deleteSubject(id: string): Promise<void>;
  /** Every page in the folder, across all its notebooks, newest first. */
  listFolderPages(subjectId: string): Promise<Page[]>;
  listNotebooks(subjectId: string): Promise<Notebook[]>;
  createNotebook(subjectId: string, title: string): Promise<Notebook>;
  listPages(notebookId: string): Promise<Page[]>;
  createPage(notebookId: string, title?: string): Promise<Page>; // title defaults to 'Untitled', sort_order = last + 1
}

/** Thrown for invalid user input; safe to map to a translated message. */
export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

/** Thrown when deleting a folder that still has pages; there is no cascade delete from the UI. */
export class FolderNotEmptyError extends Error {
  constructor() {
    super(t("folderNotEmpty"));
    this.name = "FolderNotEmptyError";
  }
}

/** Trims and validates a user-entered name; throws 'Name is required' when blank. */
export function requireName(value: string): string {
  const name = value.trim();
  if (!name) throw new ValidationError(t("nameRequired"));
  return name;
}
