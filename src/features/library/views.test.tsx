import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FolderView } from "./views";
import { SUBJECT_COLORS } from "./colors";
import { PASTELS } from "@/ui/pastel";

afterEach(cleanup);

const m = vi.hoisted(() => ({ rename: vi.fn(), del: vi.fn(), folderPage: vi.fn() }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));
vi.mock("./actions", () => ({
  createFolderAction: async () => null,
  createQuickPageAction: async () => null,
  createFolderPageAction: m.folderPage,
  renamePageAction: async () => null,
  movePageAction: async () => null,
  duplicatePageAction: async () => null,
  deletePageAction: async () => null,
  renameFolderAction: m.rename,
  deleteFolderAction: m.del,
}));
beforeEach(() => {
  vi.clearAllMocks();
  m.rename.mockResolvedValue(null);
  m.del.mockResolvedValue(null);
  m.folderPage.mockResolvedValue(null);
});

const long = "L".repeat(60);
const folders = [
  { id: "f1", name: "Biology" },
  { id: "f2", name: "Chemistry" },
];
const folder = { id: "f1", name: "Biology", color: "#dc2626" };
// An older folder: pages came from two notebooks ("Cells" and the hidden "Pages"), already merged newest first.
const pages = [
  { id: "p3", title: "Organelles" },
  { id: "p2", title: "Cell structure" },
  { id: "p1", title: "Photosynthesis" },
];

describe("FolderView", () => {
  it("links home, names the folder, counts and lists every page in order", () => {
    render(<FolderView folder={folder} pages={pages} audioPageIds={new Set()} folders={folders} />);
    expect(screen.getByRole("link", { name: "Home" }).getAttribute("href")).toBe("/app");
    expect(screen.getByRole("heading", { level: 1, name: "Biology" })).toBeTruthy();
    expect(screen.getByText("3 pages")).toBeTruthy();
    const tiles = screen.getAllByRole("link").filter((a) => a.getAttribute("href")?.startsWith("/app/p/"));
    expect(tiles.map((a) => a.getAttribute("href"))).toEqual(["/app/p/p3", "/app/p/p2", "/app/p/p1"]);
    expect(document.body.textContent).not.toMatch(/notebook|subject/i);
  });

  it("New page creates a page in this folder", async () => {
    render(<FolderView folder={folder} pages={[]} audioPageIds={new Set()} folders={folders} />);
    expect(screen.getByText("No pages in this folder yet.")).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "New page" }));
    });
    expect(m.folderPage).toHaveBeenCalledTimes(1);
    expect(m.folderPage.mock.calls[0][0]).toBe("f1");
  });

  it("each page row has the same actions menu, separate from the link that opens the page", () => {
    render(<FolderView folder={folder} pages={pages} audioPageIds={new Set()} folders={folders} />);
    const btn = screen.getByRole("button", { name: "Actions for Organelles" });
    expect(btn.closest("a")).toBeNull();
    fireEvent.click(btn);
    expect(screen.getAllByRole("menuitem").map((i) => i.textContent)).toEqual(["Open", "Duplicate", "Rename", "Move to folder", "Delete"]);
  });

  it("shows the Recording badge only for pages with audio", () => {
    render(<FolderView folder={folder} pages={pages} audioPageIds={new Set(["p2"])} folders={folders} />);
    expect(screen.getAllByText("Recording")).toHaveLength(1);
    expect(screen.getByRole("link", { name: /Cell structure/ }).textContent).toContain("Recording");
  });

  it("renames the folder from a dialog that closes on success", async () => {
    render(<FolderView folder={folder} pages={pages} audioPageIds={new Set()} folders={folders} />);
    fireEvent.click(screen.getByRole("button", { name: "Rename" }));
    const input = screen.getByLabelText("Folder name") as HTMLInputElement;
    expect(input.value).toBe("Biology");
    fireEvent.change(input, { target: { value: "Chemistry" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Save" }));
    });
    expect(m.rename).toHaveBeenCalledTimes(1);
    expect(m.rename.mock.calls[0][0]).toBe("f1");
    expect((m.rename.mock.calls[0][2] as FormData).get("name")).toBe("Chemistry");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("refuses to delete a folder that has pages, with no delete button", () => {
    render(<FolderView folder={folder} pages={pages} audioPageIds={new Set()} folders={folders} />);
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    const dialog = screen.getByRole("dialog", { name: "Delete folder" });
    expect(dialog.textContent).toContain("This folder still has pages. Delete or move them first.");
    expect(screen.queryByRole("button", { name: "Delete folder" })).toBeNull();
  });

  it("confirms before deleting an empty folder, naming it, and shows a server refusal", async () => {
    m.del.mockResolvedValue({ error: "This folder still has pages. Delete or move them first." });
    render(<FolderView folder={folder} pages={[]} audioPageIds={new Set()} folders={folders} />);
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(screen.getByRole("dialog").textContent).toContain("Delete “Biology”? This can't be undone.");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Delete folder" }));
    });
    expect(m.del.mock.calls[0][0]).toBe("f1");
    expect(screen.getByRole("alert").textContent).toBe("This folder still has pages. Delete or move them first.");
  });

  it("truncates long names", () => {
    render(<FolderView folder={{ ...folder, name: long }} pages={[{ id: "p", title: long }]} audioPageIds={new Set()} folders={folders} />);
    expect(screen.getAllByText(long).every((el) => el.className.includes("truncate"))).toBe(true);
  });

  it("renders a legacy colour as its pastel", () => {
    render(<FolderView folder={{ ...folder, color: "#2563eb" }} pages={[]} audioPageIds={new Set()} folders={folders} />);
    const banner = screen.getByRole("heading", { level: 1 }).closest("section") as HTMLElement;
    expect(banner.style.background.toLowerCase()).toMatch(/#cfe3f7|rgb\(207, 227, 247\)/);
  });
});

describe("SUBJECT_COLORS", () => {
  it("are the six pastels", () => {
    expect(SUBJECT_COLORS.map((c) => c.hex)).toEqual(PASTELS.map((p) => p.hex));
  });
});
