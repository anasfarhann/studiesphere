import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Editor } from "../editor";
import type { CanvasElement, FileEl, Rect } from "../model/types";
import { t } from "@/i18n/en";
import { FileCards } from "./FileCards";

const file = (id: string, thumbPath?: string): FileEl => ({ id, z: 0, updatedAt: 1, type: "file", x: 0, y: 200, assetPath: `p/${id}.pdf`, fileName: `${id}.pdf`, mime: "application/pdf", bytes: 1, thumbPath });

let fire: () => void = () => {};
function fakeEditor(els: CanvasElement[], visible: (pad?: number) => CanvasElement[] = () => els, handles: Rect[] = []) {
  return {
    scaleHandleRects: () => handles,
    camera: { zoom: 1, worldToScreen: (x: number, y: number) => [x, y] },
    visibleElements: visible,
    onSelectionChange: (fn: () => void) => (fire = fn, () => {}),
    scene: { onChange: () => () => {} },
  } as unknown as Editor;
}
const flush = async () => act(async () => { await Promise.resolve(); });

afterEach(cleanup);

describe("FileCards under scale handles", () => {
  it("an open button under a corner scale handle lets presses through to the canvas", async () => {
    // Button centre (30, 232), at least 44 px: a handle target at the card's top-left corner overlaps it.
    const els = [file("a"), { ...file("b"), x: 600 }];
    render(<FileCards editor={fakeEditor(els, () => els, [{ minX: -22, minY: 178, maxX: 22, maxY: 222 }])} resolveUrl={async (p) => `https://x/${p}`} forgetUrl={() => {}} />);
    await flush();
    const [a, b] = screen.getAllByTestId("file-open");
    expect(a.className).toContain("pointer-events-none");
    expect(b.className).not.toContain("pointer-events-none");
  });
});

describe("FileCards thumbnail", () => {
  it("renders an img from the signed URL when thumbPath is set", async () => {
    const asked: string[] = [];
    render(<FileCards editor={fakeEditor([file("a", "p/a.thumb.jpg")])} resolveUrl={async (p) => (asked.push(p), `https://x/${p}`)} forgetUrl={() => {}} />);
    await flush();
    const img = screen.getByTestId("file-thumb") as HTMLImageElement;
    expect(img.src).toBe("https://x/p/a.thumb.jpg");
    expect(img.className).toContain("object-cover");
    expect(img.className).toContain("object-top");
    expect(asked).toContain("p/a.thumb.jpg");
  });

  it("renders no img without thumbPath, and falls back to the icon when signing or loading fails", async () => {
    render(<FileCards editor={fakeEditor([file("a"), file("b", "p/b.thumb.jpg")])} resolveUrl={async (p) => { if (p.endsWith(".thumb.jpg")) throw new Error("x"); return `https://x/${p}`; }} forgetUrl={() => {}} />);
    await flush();
    expect(screen.queryByTestId("file-thumb")).toBeNull();
    expect(screen.getAllByTestId("file-open")).toHaveLength(2);
  });

  it("drops the img when it fails to load", async () => {
    render(<FileCards editor={fakeEditor([file("a", "p/a.thumb.jpg")])} resolveUrl={async (p) => `https://x/${p}`} forgetUrl={() => {}} />);
    await flush();
    fireEvent.error(screen.getByTestId("file-thumb"));
    expect(screen.queryByTestId("file-thumb")).toBeNull();
    expect(screen.getByTestId("file-open")).toBeTruthy();
  });

  const thumbCalls = (r: { mock: { calls: unknown[][] } }) => r.mock.calls.filter((c) => String(c[0]).endsWith(".thumb.jpg")).length;

  it("retries a failed image once with a fresh URL, then falls back to the icon", async () => {
    let n = 0;
    const resolve = vi.fn(async (p: string) => (p.endsWith(".thumb.jpg") ? `https://x/${++n}` : `https://x/${p}`));
    const forget = vi.fn();
    render(<FileCards editor={fakeEditor([file("a", "p/a.thumb.jpg")])} resolveUrl={resolve} forgetUrl={forget} />);
    await flush();
    expect((screen.getByTestId("file-thumb") as HTMLImageElement).src).toBe("https://x/1");
    fireEvent.error(screen.getByTestId("file-thumb"));
    await flush();
    expect(forget).toHaveBeenCalledWith("p/a.thumb.jpg");
    expect((screen.getByTestId("file-thumb") as HTMLImageElement).src).toBe("https://x/2");
    fireEvent.error(screen.getByTestId("file-thumb"));
    await flush();
    expect(screen.queryByTestId("file-thumb")).toBeNull();
    expect(thumbCalls(resolve)).toBe(2);
  });

  it("re-signs a stale preview URL when the card comes back into view", async () => {
    let n = 0;
    const resolve = vi.fn(async (p: string) => (p.endsWith(".thumb.jpg") ? `https://x/${++n}` : `https://x/${p}`));
    render(<FileCards editor={fakeEditor([file("a", "p/a.thumb.jpg")])} resolveUrl={resolve} forgetUrl={() => {}} />);
    await flush();
    expect(thumbCalls(resolve)).toBe(1);
    const real = Date.now();
    const now = vi.spyOn(Date, "now").mockReturnValue(real + 10 * 60 * 1000);
    await act(async () => { fire(); await new Promise((r) => setTimeout(r, 50)); });
    expect(thumbCalls(resolve)).toBe(1); // still fresh
    now.mockReturnValue(real + 46 * 60 * 1000);
    await act(async () => { fire(); await new Promise((r) => setTimeout(r, 50)); });
    expect(thumbCalls(resolve)).toBe(2);
    expect((screen.getByTestId("file-thumb") as HTMLImageElement).src).toBe("https://x/2");
    now.mockRestore();
  });

  it("a preview whose signing failed is retried after 60 s, not before", async () => {
    let fail = true;
    const resolve = vi.fn(async (p: string) => {
      if (p.endsWith(".thumb.jpg") && fail) throw new Error("offline");
      return `https://x/${p}`;
    });
    render(<FileCards editor={fakeEditor([file("a", "p/a.thumb.jpg")])} resolveUrl={resolve} forgetUrl={() => {}} />);
    await flush();
    expect(screen.queryByTestId("file-thumb")).toBeNull();
    expect(thumbCalls(resolve)).toBe(1);
    fail = false;
    const real = Date.now();
    const now = vi.spyOn(Date, "now").mockReturnValue(real + 30 * 1000);
    await act(async () => { fire(); await new Promise((r) => setTimeout(r, 50)); });
    expect(thumbCalls(resolve)).toBe(1); // failure still remembered
    now.mockReturnValue(real + 61 * 1000);
    await act(async () => { fire(); await new Promise((r) => setTimeout(r, 50)); });
    expect(thumbCalls(resolve)).toBe(2);
    expect((screen.getByTestId("file-thumb") as HTMLImageElement).src).toBe("https://x/p/a.thumb.jpg");
    expect(screen.getByTestId("file-thumb").getAttribute("alt")).toBe(t("filePreview", { name: "a.pdf" }));
    now.mockRestore();
  });

  it("asks for elements padded below the view so previews do not pop in late", async () => {
    const visible = vi.fn((pad?: number) => (void pad, [] as CanvasElement[]));
    render(<FileCards editor={fakeEditor([], visible)} resolveUrl={async (p) => p} forgetUrl={() => {}} />);
    await flush();
    expect(visible.mock.calls[0][0]).toBeGreaterThanOrEqual(140);
  });
});
