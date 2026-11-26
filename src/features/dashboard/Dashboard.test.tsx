import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Dashboard } from "./Dashboard";
import type { FolderSummary, RecentPage } from "./queries";

afterEach(cleanup);

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));
vi.mock("@/features/library/actions", () => ({ createFolderAction: async () => null, createQuickPageAction: async () => null }));

const today = new Date(2026, 10, 23, 12);
const folders: FolderSummary[] = [
  { id: "s1", name: "Biology", tint: "#F6CFCF", pages: 5 },
  { id: "s2", name: "Chemistry", tint: "#F9DFC0", pages: 1 },
];
const recent: RecentPage[] = [
  { id: "p1", title: "Cell walls", folderId: "s1", folderName: "Biology", tint: "#F6CFCF", editedAt: new Date(2026, 10, 23, 9).toISOString() },
  { id: "p2", title: "Moles", folderId: "s2", folderName: "Chemistry", tint: "#F9DFC0", editedAt: new Date(2026, 10, 22, 9).toISOString() },
];

describe("Dashboard", () => {
  it("offers a one-tap New page button in the header", () => {
    render(<Dashboard name="Anas" folders={folders} recent={recent} today={today} />);
    const b = screen.getByRole("button", { name: "New page" }) as HTMLButtonElement;
    expect(b.type).toBe("submit");
    expect(b.closest("form")).toBeTruthy();
    expect(b.closest("header")).toBeTruthy();
  });
  it("lists Your folders, each card linking to its folder with its page count", () => {
    render(<Dashboard name="Anas" folders={folders} recent={recent} today={today} />);
    expect(screen.getByRole("heading", { name: "Your folders" })).toBeTruthy();
    const card = screen.getByRole("link", { name: /Biology.*5 pages|5 pages.*Biology/ });
    expect(card.getAttribute("href")).toBe("/app/s/s1");
    expect(screen.getByRole("button", { name: "New folder" })).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/notebook|subject/i);
  });
  it("greets by name and shows the date and panel cards", () => {
    render(<Dashboard name="Anas" folders={folders} recent={recent} today={today} />);
    expect(screen.getByRole("heading", { level: 1, name: "Hi, Anas!" })).toBeTruthy();
    expect(screen.getByText("Monday, 23 November")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Today's classes" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Flashcards due" })).toBeTruthy();
    expect(screen.getByText("edited today", { exact: false })).toBeTruthy();
  });

  it("shows a friendly empty state with a New folder button when there are no folders", () => {
    render(<Dashboard name="Anas" folders={[]} recent={[]} today={today} />);
    expect(screen.getByText("Create your first folder to start taking notes.")).toBeTruthy();
    const btn = screen.getByRole("button", { name: "New folder" });
    btn.focus();
    fireEvent.click(btn);
    expect(screen.getByRole("dialog", { name: "New folder" })).toBeTruthy();
    expect(screen.getByLabelText("Folder name")).toBeTruthy();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(btn);
  });

  it("returns focus to the trigger on Close and traps Tab inside the dialog", () => {
    render(<Dashboard name="Anas" folders={[]} recent={[]} today={today} />);
    const trigger = screen.getByRole("button", { name: "New folder" });
    trigger.focus();
    fireEvent.click(trigger);
    const dialog = screen.getByRole("dialog");
    const items = Array.from(dialog.querySelectorAll<HTMLElement>("button:not([disabled]), input:not([disabled])"));
    const first = items[0];
    const last = items[items.length - 1];
    last.focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(document.activeElement).toBe(first);
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(last);
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("keeps focus in the field when the dashboard re-renders while the dialog is open", () => {
    const { rerender } = render(<Dashboard name="Anas" folders={[]} recent={[]} today={today} />);
    fireEvent.click(screen.getByRole("button", { name: "New folder" }));
    const input = screen.getByLabelText("Folder name");
    input.focus();
    rerender(<Dashboard name="Anas" folders={[]} recent={[]} today={new Date(2026, 10, 24, 12)} />);
    expect(document.activeElement).toBe(input);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("chip filter narrows both the folders and the recent pages", () => {
    render(<Dashboard name="Anas" folders={folders} recent={recent} today={today} />);
    fireEvent.click(screen.getByRole("button", { name: "Chemistry" }));
    expect(screen.getByRole("button", { name: "Chemistry" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.queryByRole("link", { name: /Biology/ })).toBeNull();
    expect(screen.queryByRole("link", { name: /Cell walls/ })).toBeNull();
    expect(screen.getByRole("link", { name: /Moles/ })).toBeTruthy();
    expect(screen.getByRole("link", { name: /1 page.*Chemistry/ })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "All folders" }));
    expect(screen.getByRole("link", { name: /Cell walls/ })).toBeTruthy();
  });

  it("a folder chip with no recent pages and an empty search shows the no-recent message, not no-matches", () => {
    render(<Dashboard name="Anas" folders={folders} recent={[recent[0]]} today={today} />);
    fireEvent.click(screen.getByRole("button", { name: "Chemistry" }));
    expect(screen.getByText("Pages you edit will show up here.")).toBeTruthy();
    expect(screen.queryByText("Nothing matches your search.")).toBeNull();
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "zzz" } });
    expect(screen.getAllByText("Nothing matches your search.").length).toBeGreaterThan(0);
  });

  it("matches recent pages to the chip by folder id, not name", () => {
    const twin = [{ ...recent[0], id: "p9", title: "Twin", folderId: "other", folderName: "Chemistry" }, recent[1]];
    render(<Dashboard name="Anas" folders={folders} recent={twin} today={today} />);
    fireEvent.click(screen.getByRole("button", { name: "Chemistry" }));
    expect(screen.queryByRole("link", { name: /Twin/ })).toBeNull();
    expect(screen.getByRole("link", { name: /Moles/ })).toBeTruthy();
  });

  it("search filters by name", () => {
    render(<Dashboard name="Anas" folders={folders} recent={recent} today={today} />);
    fireEvent.change(screen.getByRole("searchbox", { name: "Search your folders and pages" }), { target: { value: "cell" } });
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
        folders={[{ ...folders[0], name: long }]}
        recent={[{ ...recent[0], title: long, folderName: long }]}
        today={today}
      />,
    );
    for (const el of screen.getAllByText(long)) {
      expect(el.className).toMatch(/truncate/);
    }
  });
});
