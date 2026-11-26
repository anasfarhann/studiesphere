import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PreviewTarget } from "@/canvas/preview/page-preview";
import { LivePageTargetProvider } from "@/canvas/react/live-page-target";

const m = vi.hoisted(() => ({
  state: { busy: false, error: null as string | null, ready: false },
  share: vi.fn(),
  shareReady: vi.fn(),
  args: [] as unknown[][],
}));
vi.mock("@/features/share/useSharePdf", () => ({
  useSharePdf: (...a: unknown[]) => {
    m.args.push(a);
    return { ...m.state, share: m.share, shareReady: m.shareReady, clearError: vi.fn() };
  },
}));

import { SharePageButton } from "./SharePageButton";

afterEach(() => {
  cleanup();
  m.state = { busy: false, error: null, ready: false };
  m.args = [];
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

  it("exports the live editor scene when the canvas has one, and the saved page before that", () => {
    const live: PreviewTarget = { elements: () => [], drawSnapshot: () => true };
    const { unmount } = render(<SharePageButton pageId="p1" title="Cells" />);
    expect(m.args.at(-1)![1]).toBeNull();
    unmount();
    render(
      <LivePageTargetProvider value={live}>
        <SharePageButton pageId="p1" title="Cells" />
      </LivePageTargetProvider>,
    );
    expect(m.args.at(-1)![0]).toEqual({ id: "p1", title: "Cells" });
    expect(m.args.at(-1)![1]).toBe(live);
  });

  it("is disabled with a busy label while working, and shows errors in an alert inside the viewport", () => {
    m.state = { busy: true, error: "Couldn't make the PDF. Please try again.", ready: false };
    render(<SharePageButton pageId="p1" title="Cells" />);
    expect((screen.getByRole("button", { name: "Making PDF…" }) as HTMLButtonElement).disabled).toBe(true);
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toMatch(/Couldn't make the PDF/);
    expect(alert.className).toMatch(/max-w-\[calc\(100vw-/);
  });

  it("offers a Share button once the PDF is ready but needs a fresh tap", () => {
    m.state = { busy: false, error: null, ready: true };
    render(<SharePageButton pageId="p1" title="Cells" />);
    fireEvent.click(screen.getByRole("button", { name: "PDF ready. Tap to share" }));
    expect(m.shareReady).toHaveBeenCalledTimes(1);
  });
});
