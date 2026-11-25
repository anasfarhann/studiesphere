import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { Editor } from "../editor";
import type { CanvasElement, FileEl } from "../model/types";
import { FileCards } from "./FileCards";

const file = (id: string, thumbPath?: string): FileEl => ({ id, z: 0, updatedAt: 1, type: "file", x: 0, y: 200, assetPath: `p/${id}.pdf`, fileName: `${id}.pdf`, mime: "application/pdf", bytes: 1, thumbPath });

function fakeEditor(els: CanvasElement[]) {
  return {
    camera: { zoom: 1, worldToScreen: (x: number, y: number) => [x, y] },
    visibleElements: () => els,
    onSelectionChange: () => () => {},
    scene: { onChange: () => () => {} },
  } as unknown as Editor;
}
const flush = async () => act(async () => { await Promise.resolve(); });

afterEach(cleanup);

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
});
