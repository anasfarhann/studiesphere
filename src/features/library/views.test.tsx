import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NotebookView, SubjectView } from "./views";
import { SUBJECT_COLORS } from "./colors";
import { PASTELS } from "@/ui/pastel";

afterEach(cleanup);

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));
vi.mock("./actions", () => ({
  createSubjectAction: async () => null,
  createNotebookAction: async () => null,
  createPageAction: async () => null,
}));

const long = "L".repeat(60);

describe("NotebookView", () => {
  const subject = { id: "s1", name: "Biology", color: "#dc2626" };
  const notebook = { id: "n1", title: "Cells" };
  const pages = [
    { id: "p1", title: "Cell structure" },
    { id: "p2", title: "Organelles" },
  ];

  it("shows the Recording badge only for pages with audio", () => {
    render(<NotebookView subject={subject} notebook={notebook} pages={pages} audioPageIds={new Set(["p1"])} />);
    expect(screen.getAllByText("Recording")).toHaveLength(1);
    const tile = screen.getByRole("link", { name: /Cell structure/ });
    expect(tile.textContent).toContain("Recording");
    expect(screen.getByRole("link", { name: /Organelles/ }).textContent).not.toContain("Recording");
  });

  it("links back to the subject by name", () => {
    render(<NotebookView subject={subject} notebook={notebook} pages={pages} audioPageIds={new Set()} />);
    const back = screen.getByRole("link", { name: "Back to Biology" });
    expect(back.getAttribute("href")).toBe("/app/s/s1");
    expect(screen.getByRole("button", { name: "New page" })).toBeTruthy();
  });

  it("truncates long titles", () => {
    render(<NotebookView subject={{ ...subject, name: long }} notebook={notebook} pages={[{ id: "p", title: long }]} audioPageIds={new Set()} />);
    expect(screen.getAllByText(long).every((el) => el.className.includes("truncate"))).toBe(true);
  });
});

describe("SubjectView", () => {
  const subject = { id: "s1", name: "Biology", color: "#2563eb" };
  const notebooks = [{ id: "n1", title: "Cells", pages: 8 }];

  it("links home, shows counts, notebooks and the new-notebook actions", () => {
    render(<SubjectView subject={subject} notebooks={notebooks} />);
    expect(screen.getByRole("link", { name: "Home" }).getAttribute("href")).toBe("/app");
    expect(screen.getByRole("heading", { level: 1, name: "Biology" })).toBeTruthy();
    expect(screen.getByText("1 notebook")).toBeTruthy();
    expect(screen.getAllByText("8 pages").length).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: /Cells/ }).getAttribute("href")).toBe("/app/n/n1");
    expect(screen.getAllByRole("button", { name: "New notebook" })).toHaveLength(2);
  });

  it("renders a legacy colour as its pastel", () => {
    render(<SubjectView subject={subject} notebooks={[]} />);
    const banner = screen.getByRole("heading", { level: 1 }).closest("section") as HTMLElement;
    expect(banner.style.background.toLowerCase()).toMatch(/#cfe3f7|rgb\(207, 227, 247\)/);
  });
});

describe("SUBJECT_COLORS", () => {
  it("are the six pastels", () => {
    expect(SUBJECT_COLORS.map((c) => c.hex)).toEqual(PASTELS.map((p) => p.hex));
  });
});
