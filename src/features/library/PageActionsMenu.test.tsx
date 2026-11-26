import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  rename: vi.fn(),
  move: vi.fn(),
  dup: vi.fn(),
  del: vi.fn(),
  pdfShare: vi.fn(),
  pdfClear: vi.fn(),
  pdfBusy: false,
  pdfError: null as string | null,
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("@/features/share/useSharePdf", () => ({
  useSharePdf: () => ({ busy: m.pdfBusy, error: m.pdfError, share: m.pdfShare, clearError: m.pdfClear }),
}));
vi.mock("./actions", () => ({
  renamePageAction: (...a: unknown[]) => m.rename(...a),
  movePageAction: (...a: unknown[]) => m.move(...a),
  duplicatePageAction: (...a: unknown[]) => m.dup(...a),
  deletePageAction: (...a: unknown[]) => m.del(...a),
}));

import { PageActionsMenu } from "./PageActionsMenu";

const page = { id: "p1", title: "Cell walls", folderId: "f1" };
const folders = [
  { id: "f1", name: "Biology" },
  { id: "f2", name: "Chemistry" },
];

beforeEach(() => {
  vi.clearAllMocks();
  m.pdfBusy = false;
  m.pdfError = null;
  m.pdfShare.mockResolvedValue(true);
  for (const k of ["rename", "move", "dup", "del"] as const) m[k].mockResolvedValue(null);
});
afterEach(cleanup);

const trigger = () => screen.getByRole("button", { name: "Actions for Cell walls" });
const open = () => {
  fireEvent.click(trigger());
};

describe("PageActionsMenu", () => {
  it("is closed until the trigger is pressed, then lists the actions", () => {
    render(<PageActionsMenu page={page} folders={folders} />);
    expect(trigger().getAttribute("aria-haspopup")).toBe("menu");
    expect(trigger().getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("menu")).toBeNull();
    open();
    expect(trigger().getAttribute("aria-expanded")).toBe("true");
    const items = screen.getAllByRole("menuitem").map((i) => i.textContent);
    expect(items).toEqual(["Open", "Duplicate", "Rename", "Move to folder", "Share as PDF", "Delete"]);
    expect(screen.getByRole("menuitem", { name: "Open" }).getAttribute("href")).toBe("/app/p/p1");
    for (const i of screen.getAllByRole("menuitem")) expect(i.className).toMatch(/\bh-11\b|min-h-11/);
    expect(trigger().className).toMatch(/size-11/);
  });

  it("focuses the first item, moves with arrow keys (wrapping), and Escape closes and returns focus to the trigger", () => {
    render(<PageActionsMenu page={page} folders={folders} />);
    open();
    const items = screen.getAllByRole("menuitem");
    expect(document.activeElement).toBe(items[0]);
    fireEvent.keyDown(items[0], { key: "ArrowDown" });
    expect(document.activeElement).toBe(items[1]);
    fireEvent.keyDown(items[1], { key: "ArrowUp" });
    fireEvent.keyDown(items[0], { key: "ArrowUp" });
    expect(document.activeElement).toBe(items[items.length - 1]);
    fireEvent.keyDown(items[items.length - 1], { key: "Home" });
    expect(document.activeElement).toBe(items[0]);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(trigger());
  });

  it("closes on an outside press and when pressing the trigger again", () => {
    render(
      <div>
        <PageActionsMenu page={page} folders={folders} />
        <p>elsewhere</p>
      </div>,
    );
    open();
    fireEvent.pointerDown(screen.getByText("elsewhere"));
    expect(screen.queryByRole("menu")).toBeNull();
    open();
    fireEvent.click(trigger());
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("Duplicate runs the action for this page and closes the menu", async () => {
    render(<PageActionsMenu page={page} folders={folders} />);
    open();
    fireEvent.click(screen.getByRole("menuitem", { name: "Duplicate" }));
    await waitFor(() => expect(m.dup).toHaveBeenCalledWith("p1"));
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
  });

  it("Duplicate failure keeps the menu open with an inline error", async () => {
    m.dup.mockResolvedValue({ error: "Something went wrong, please try again" });
    render(<PageActionsMenu page={page} folders={folders} />);
    open();
    fireEvent.click(screen.getByRole("menuitem", { name: "Duplicate" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Something went wrong");
    expect(screen.getByRole("menu")).toBeTruthy();
  });

  it("Rename opens a dialog with the title, saves via the action, and closes on success", async () => {
    render(<PageActionsMenu page={page} folders={folders} />);
    open();
    fireEvent.click(screen.getByRole("menuitem", { name: "Rename" }));
    expect(screen.queryByRole("menu")).toBeNull();
    const dlg = screen.getByRole("dialog", { name: "Rename page" });
    const input = screen.getByLabelText("Page name") as HTMLInputElement;
    expect(dlg).toBeTruthy();
    expect(input.value).toBe("Cell walls");
    fireEvent.change(input, { target: { value: "Membranes" } });
    await act(async () => {
      fireEvent.submit(input.closest("form")!);
    });
    await waitFor(() => expect(m.rename).toHaveBeenCalled());
    expect(m.rename.mock.calls[0][0]).toBe("p1");
    expect((m.rename.mock.calls[0][2] as FormData).get("title")).toBe("Membranes");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(document.activeElement).toBe(trigger());
  });

  it("Move lists the folders with the current one disabled and sends the chosen folder", async () => {
    render(<PageActionsMenu page={page} folders={folders} />);
    open();
    fireEvent.click(screen.getByRole("menuitem", { name: "Move to folder" }));
    expect(screen.getByRole("dialog", { name: "Move to folder" })).toBeTruthy();
    expect((screen.getByRole("button", { name: "Biology (current)" }) as HTMLButtonElement).disabled).toBe(true);
    const chem = screen.getByRole("button", { name: "Chemistry" });
    expect(chem.className).toMatch(/h-11|h-12/);
    await act(async () => {
      fireEvent.click(chem);
    });
    await waitFor(() => expect(m.move).toHaveBeenCalled());
    expect(m.move.mock.calls[0][0]).toBe("p1");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("Delete asks first, names the page, says it can't be undone, and only deletes on confirm", async () => {
    render(<PageActionsMenu page={page} folders={folders} />);
    open();
    fireEvent.click(screen.getByRole("menuitem", { name: "Delete" }));
    const dlg = screen.getByRole("dialog", { name: "Delete page" });
    expect(dlg.textContent).toContain("Delete “Cell walls”? This can't be undone.");
    expect(m.del).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(m.del).not.toHaveBeenCalled();
    open();
    fireEvent.click(screen.getByRole("menuitem", { name: "Delete" }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Delete page" }));
    });
    await waitFor(() => expect(m.del).toHaveBeenCalled());
    expect(m.del.mock.calls[0][0]).toBe("p1");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("a failed delete shows the error in the dialog and keeps it open", async () => {
    m.del.mockResolvedValue({ error: "Something went wrong, please try again" });
    render(<PageActionsMenu page={page} folders={folders} />);
    open();
    fireEvent.click(screen.getByRole("menuitem", { name: "Delete" }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Delete page" }));
    });
    expect((await screen.findByRole("alert")).textContent).toContain("Something went wrong");
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("Share as PDF runs the share and closes the menu on success", async () => {
    render(<PageActionsMenu page={page} folders={folders} />);
    open();
    fireEvent.click(screen.getByRole("menuitem", { name: "Share as PDF" }));
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
    expect(m.pdfShare).toHaveBeenCalledTimes(1);
  });

  it("keeps the menu open and shows the friendly error when sharing fails", async () => {
    m.pdfShare.mockResolvedValue(false);
    m.pdfError = "Couldn't make the PDF. Please try again.";
    render(<PageActionsMenu page={page} folders={folders} />);
    open();
    fireEvent.click(screen.getByRole("menuitem", { name: "Share as PDF" }));
    await waitFor(() => expect(m.pdfShare).toHaveBeenCalled());
    expect(screen.getByRole("menu")).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toBe("Couldn't make the PDF. Please try again.");
  });

  it("shows a busy label while the PDF is being made", () => {
    m.pdfBusy = true;
    render(<PageActionsMenu page={page} folders={folders} />);
    open();
    const item = screen.getByRole("menuitem", { name: "Making PDF…" });
    expect(item.getAttribute("aria-disabled")).toBe("true");
  });
});
