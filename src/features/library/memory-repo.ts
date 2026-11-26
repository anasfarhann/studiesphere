import { FolderNotEmptyError, requireName, type LibraryRepo } from "./repo";
import type { Notebook, Page, Subject } from "./types";

const OWNER = "memory-owner";

/** In-memory LibraryRepo for tests and local prototyping. */
export class MemoryLibraryRepo implements LibraryRepo {
  private subjects: Subject[] = [];
  private notebooks: Notebook[] = [];
  private pages: Page[] = [];

  private clock = 0;

  /** Strictly increasing, so "newest first" is well defined even within one millisecond. */
  private now() {
    this.clock = Math.max(this.clock + 1, Date.now());
    return new Date(this.clock).toISOString();
  }

  async listSubjects() {
    return [...this.subjects].sort((a, b) => a.sort_order - b.sort_order);
  }

  async createSubject(input: { name: string; color: string }) {
    const name = requireName(input.name);
    const subject: Subject = {
      id: crypto.randomUUID(),
      owner_id: OWNER,
      name,
      color: input.color,
      sort_order: this.subjects.length ? Math.max(...this.subjects.map((s) => s.sort_order)) + 1 : 0,
      created_at: this.now(),
    };
    this.subjects.push(subject);
    return subject;
  }

  async renameSubject(id: string, name: string) {
    const clean = requireName(name);
    const s = this.subjects.find((x) => x.id === id);
    if (s) s.name = clean;
  }

  async deleteSubject(id: string) {
    if ((await this.listFolderPages(id)).length > 0) throw new FolderNotEmptyError();
    this.subjects = this.subjects.filter((s) => s.id !== id);
    this.notebooks = this.notebooks.filter((n) => n.subject_id !== id);
  }

  async listFolderPages(subjectId: string) {
    const nbIds = new Set(this.notebooks.filter((n) => n.subject_id === subjectId).map((n) => n.id));
    return this.pages
      .filter((p) => nbIds.has(p.notebook_id))
      .sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id));
  }

  async listNotebooks(subjectId: string) {
    return this.notebooks.filter((n) => n.subject_id === subjectId);
  }

  async createNotebook(subjectId: string, title: string) {
    const clean = requireName(title);
    const ts = this.now();
    const nb: Notebook = {
      id: crypto.randomUUID(),
      owner_id: OWNER,
      subject_id: subjectId,
      title: clean,
      created_at: ts,
      updated_at: ts,
    };
    this.notebooks.push(nb);
    return nb;
  }

  async listPages(notebookId: string) {
    return this.pages
      .filter((p) => p.notebook_id === notebookId)
      .sort((a, b) => a.sort_order - b.sort_order);
  }

  async createPage(notebookId: string, title = "Untitled") {
    const existing = this.pages.filter((p) => p.notebook_id === notebookId);
    const ts = this.now();
    const page: Page = {
      id: crypto.randomUUID(),
      owner_id: OWNER,
      notebook_id: notebookId,
      title,
      sort_order: existing.length ? Math.max(...existing.map((p) => p.sort_order)) + 1 : 0,
      created_at: ts,
      updated_at: ts,
    };
    this.pages.push(page);
    return page;
  }
}
