import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import type { Editor } from "../editor";
import type { Rect } from "../model/types";
import type { AudioEl, CanvasElement } from "../model/types";
import { AudioCards } from "./AudioCards";

const card = (id: string, x: number): AudioEl => ({ id, z: 0, updatedAt: 1, type: "audio", x, y: 10, assetPath: `p/${id}`, durationMs: 5000 });

function fakeEditor(els: CanvasElement[], handles: Rect[] = []) {
  const listeners = new Set<() => void>();
  const editor = {
    scaleHandleRects: () => handles,
    camera: { zoom: 1, worldToScreen: (x: number, y: number) => [x + 5, y + 7] },
    visibleElements: () => els,
    onSelectionChange: (fn: () => void) => (listeners.add(fn), () => listeners.delete(fn)),
    scene: { onChange: () => () => {} },
  };
  return { editor: editor as unknown as Editor, els, fire: () => listeners.forEach((f) => f()) };
}

describe("AudioCards", () => {
  let play: Mock<() => Promise<void>>;
  let pause: Mock<() => void>;
  beforeEach(() => {
    play = vi.fn<() => Promise<void>>(async () => {});
    pause = vi.fn<() => void>();
    vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(play);
    vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(pause);
    vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => {});
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  const flush = async () => act(async () => { await Promise.resolve(); });

  it("shows a 44px+ button per visible card and plays one at a time", async () => {
    const { editor } = fakeEditor([card("a", 0), card("b", 300)]);
    render(<AudioCards editor={editor} resolveUrl={async (p) => `https://x/${p}`} forgetUrl={() => {}} />);
    await flush();
    const buttons = screen.getAllByRole("button", { name: "Play recording" });
    expect(buttons).toHaveLength(2);
    expect(parseFloat(buttons[0].style.width)).toBeGreaterThanOrEqual(44);
    await act(async () => { fireEvent.click(buttons[0]); });
    expect(play).toHaveBeenCalledTimes(1);
    expect(screen.getAllByRole("button", { name: "Pause recording" })).toHaveLength(1);
    await act(async () => { fireEvent.click(screen.getAllByRole("button", { name: "Play recording" })[0]); });
    expect(play).toHaveBeenCalledTimes(2);
    // Only the second card is playing now.
    expect(screen.getAllByRole("button", { name: "Pause recording" })).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: "Play recording" })).toHaveLength(1);
  });

  it("a button under a corner scale handle lets presses through to the canvas", async () => {
    // Card "a" button centre: (0 + 32 + 5, 10 + 32 + 7) = (37, 49); a handle target around (20, 30).
    const { editor } = fakeEditor([card("a", 0), card("b", 300)], [{ minX: -2, minY: 8, maxX: 42, maxY: 52 }]);
    render(<AudioCards editor={editor} resolveUrl={async (p) => `https://x/${p}`} forgetUrl={() => {}} />);
    await flush();
    const [a, b] = screen.getAllByTestId("audio-play");
    expect(a.className).toContain("pointer-events-none");
    expect(b.className).not.toContain("pointer-events-none");
  });

  it("pause stops playback", async () => {
    const { editor } = fakeEditor([card("a", 0)]);
    render(<AudioCards editor={editor} resolveUrl={async (p) => `https://x/${p}`} forgetUrl={() => {}} />);
    await flush();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Play recording" })); });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Pause recording" })); });
    expect(pause).toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Play recording" })).toBeTruthy();
  });

  it("shows a message and forgets the link when playback fails", async () => {
    const forget = vi.fn();
    play.mockRejectedValue(new Error("expired"));
    const { editor } = fakeEditor([card("a", 0)]);
    render(<AudioCards editor={editor} resolveUrl={async () => "u"} forgetUrl={forget} />);
    await flush();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Play recording" })); });
    await flush();
    expect(forget).toHaveBeenCalledWith("p/a");
    expect(screen.getByText("Couldn't play this recording")).toBeTruthy();
  });

  it("drops buttons for cards that leave the view and stops their playback", async () => {
    const f = fakeEditor([card("a", 0)]);
    render(<AudioCards editor={f.editor} resolveUrl={async () => "u"} forgetUrl={() => {}} />);
    await flush();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Play recording" })); });
    f.els.length = 0;
    await act(async () => { f.fire(); await new Promise((r) => setTimeout(r, 40)); });
    expect(screen.queryByRole("button")).toBeNull();
    expect(pause).toHaveBeenCalled();
  });
});
