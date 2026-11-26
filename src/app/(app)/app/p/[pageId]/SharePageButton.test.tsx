import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ state: { busy: false, error: null as string | null }, share: vi.fn() }));
vi.mock("@/features/share/useSharePdf", () => ({ useSharePdf: () => ({ ...m.state, share: m.share, clearError: vi.fn() }) }));

import { SharePageButton } from "./SharePageButton";

afterEach(() => {
  cleanup();
  m.state = { busy: false, error: null };
  vi.clearAllMocks();
});

describe("SharePageButton", () => {
  it("is a 44 px button that shares the page", () => {
    render(<SharePageButton pageId="p1" title="Cells" />);
    const b = screen.getByRole("button", { name: "Share page as PDF" });
    expect(b.className).toMatch(/size-11/);
    fireEvent.click(b);
    expect(m.share).toHaveBeenCalledTimes(1);
  });

  it("is disabled with a busy label while working, and shows errors in an alert", () => {
    m.state = { busy: true, error: "Couldn't make the PDF. Please try again." };
    render(<SharePageButton pageId="p1" title="Cells" />);
    expect((screen.getByRole("button", { name: "Making PDF…" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole("alert").textContent).toMatch(/Couldn't make the PDF/);
  });
});
