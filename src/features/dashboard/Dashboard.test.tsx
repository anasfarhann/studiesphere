import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Dashboard } from "./Dashboard";
import type { RecentPage, SubjectSummary } from "./queries";

afterEach(cleanup);

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));
vi.mock("@/features/library/actions", () => ({ createSubjectAction: async () => null }));

const today = new Date(2026, 10, 23, 12);
const subjects: SubjectSummary[] = [
  { id: "s1", name: "Biology", tint: "#F6CFCF", notebooks: 2, pages: 5 },
  { id: "s2", name: "Chemistry", tint: "#F9DFC0", notebooks: 1, pages: 1 },
];
const recent: RecentPage[] = [
  { id: "p1", title: "Cell walls", subjectName: "Biology", notebookTitle: "Cells", tint: "#F6CFCF", editedAt: new Date(2026, 10, 23, 9).toISOString() },
  { id: "p2", title: "Moles", subjectName: "Chemistry", notebookTitle: "Stoichiometry", tint: "#F9DFC0", editedAt: new Date(2026, 10, 22, 9).toISOString() },
];

describe("Dashboard", () => {
  it("greets by name and shows the date and panel cards", () => {
    render(<Dashboard name="Anas" subjects={subjects} recent={recent} today={today} />);
    expect(screen.getByRole("heading", { level: 1, name: "Hi, Anas!" })).toBeTruthy();
    expect(screen.getByText("Monday, 23 November")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Today's classes" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Flashcards due" })).toBeTruthy();
    expect(screen.getByText("edited today", { exact: false })).toBeTruthy();
  });

  it("shows a friendly empty state with a New subject button when there are no subjects", () => {
    render(<Dashboard name="Anas" subjects={[]} recent={[]} today={today} />);
    expect(screen.getByText("Create your first subject to start taking notes.")).toBeTruthy();
    const btn = screen.getByRole("button", { name: "New subject" });
    fireEvent.click(btn);
    expect(screen.getByRole("dialog", { name: "New subject" })).toBeTruthy();
    expect(screen.getByLabelText("Subject name")).toBeTruthy();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("chip filter narrows both the subjects and the recent pages", () => {
    render(<Dashboard name="Anas" subjects={subjects} recent={recent} today={today} />);
    fireEvent.click(screen.getByRole("button", { name: "Chemistry" }));
    expect(screen.getByRole("button", { name: "Chemistry" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.queryByRole("link", { name: /Biology/ })).toBeNull();
    expect(screen.queryByRole("link", { name: /Cell walls/ })).toBeNull();
    expect(screen.getByRole("link", { name: /Moles/ })).toBeTruthy();
    expect(screen.getByRole("link", { name: /Chemistry.*1 notebook/ })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "All subjects" }));
    expect(screen.getByRole("link", { name: /Cell walls/ })).toBeTruthy();
  });

  it("search filters by name", () => {
    render(<Dashboard name="Anas" subjects={subjects} recent={recent} today={today} />);
    fireEvent.change(screen.getByRole("searchbox", { name: "Search your subjects and pages" }), { target: { value: "cell" } });
    expect(screen.getByRole("link", { name: /Cell walls/ })).toBeTruthy();
    expect(screen.queryByRole("link", { name: /Moles/ })).toBeNull();
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "zzz" } });
    expect(screen.getAllByText("Nothing matches your search.").length).toBe(2);
  });

  it("truncates long names so cards keep their size", () => {
    const long = "L".repeat(60);
    render(
      <Dashboard
        name="Anas"
        subjects={[{ ...subjects[0], name: long }]}
        recent={[{ ...recent[0], title: long, subjectName: long }]}
        today={today}
      />,
    );
    for (const el of screen.getAllByText(long)) {
      expect(el.className).toMatch(/truncate/);
    }
  });
});
