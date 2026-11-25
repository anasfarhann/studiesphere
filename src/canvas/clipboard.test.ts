import { beforeEach, describe, expect, it } from "vitest";
import { Clipboard, CLIPBOARD_KEY, pasteInto } from "./clipboard";
import { boundsOf } from "./model/bounds";
import { History } from "./model/history";
import { Scene } from "./model/scene";
import type { CanvasElement, ImageEl, StrokeEl, TextEl } from "./model/types";
import { Selection } from "./selection";

const ink: StrokeEl = {
  id: "ink", type: "stroke", tool: "pen", color: "#000", size: 2, z: 3, updatedAt: 1, simulatePressure: true,
  points: [[101, 201, 0.4], [151, 251, 0.6]],
};
const img: ImageEl = { id: "img", type: "image", x: 200, y: 200, w: 100, h: 50, assetPath: "owner/page/a.png", z: 5, updatedAt: 1 };
const txt: TextEl = { id: "txt", type: "text", x: 0, y: 0, w: 50, text: "hi", fontSize: 10, color: "#000", z: 1, updatedAt: 1 };

function memoryStorage(): Storage {
  const m = new Map<string, string>();
  return {
    get length() {
      return m.size;
    },
    clear: () => m.clear(),
    getItem: (k) => m.get(k) ?? null,
    key: (i) => [...m.keys()][i] ?? null,
    removeItem: (k) => void m.delete(k),
    setItem: (k, v) => void m.set(k, String(v)),
  };
}

let storage: Storage;
let n: number;
const newId = () => `new-${++n}`;
beforeEach(() => {
  storage = memoryStorage();
  n = 0;
});

describe("Clipboard", () => {
  it("starts empty and copy stores deep copies normalised to the bounds' top-left", () => {
    const clip = new Clipboard({ storage });
    expect(clip.isEmpty).toBe(true);
    const source = structuredClone(ink);
    clip.copy([source, img]);
    source.points[0][0] = 999;
    expect(clip.isEmpty).toBe(false);
    const items = clip.items();
    // ink bounds start at (100, 200) (1 px pad); img at (200, 200).
    expect((items.find((e) => e.type === "stroke") as StrokeEl).points[0]).toEqual([1, 1, 0.4]);
    expect(items.find((e) => e.type === "image")).toMatchObject({ x: 100, y: 0, assetPath: "owner/page/a.png" });
    expect(JSON.parse(storage.getItem(CLIPBOARD_KEY) ?? "null")).toMatchObject({ v: 1 });
  });

  it("survives a reload through storage", () => {
    new Clipboard({ storage }).copy([img]);
    const again = new Clipboard({ storage });
    expect(again.isEmpty).toBe(false);
    expect(again.items()).toEqual([expect.objectContaining({ type: "image", x: 0, y: 0, w: 100, h: 50 })]);
  });

  it("treats corrupt or malformed storage as empty", () => {
    storage.setItem(CLIPBOARD_KEY, "{not json");
    expect(new Clipboard({ storage }).isEmpty).toBe(true);
    storage.setItem(CLIPBOARD_KEY, JSON.stringify({ v: 1, w: 1, h: 1, elements: [{ type: "image", x: "a" }] }));
    expect(new Clipboard({ storage }).isEmpty).toBe(true);
    storage.setItem(CLIPBOARD_KEY, JSON.stringify({ v: 2, w: 1, h: 1, elements: [] }));
    expect(new Clipboard({ storage }).isEmpty).toBe(true);
  });

  it("keeps working in memory when storage throws", () => {
    const broken = memoryStorage();
    broken.setItem = () => {
      throw new Error("quota");
    };
    broken.getItem = () => {
      throw new Error("denied");
    };
    const clip = new Clipboard({ storage: broken });
    expect(clip.isEmpty).toBe(true);
    clip.copy([txt]);
    expect(clip.items()).toHaveLength(1);
  });

  it("picks up a copy made in another tab", () => {
    const a = new Clipboard({ storage });
    const b = new Clipboard({ storage });
    a.copy([txt]);
    expect(b.items()).toEqual([expect.objectContaining({ type: "text", text: "hi" })]);
  });
});

describe("pasteInto", () => {
  it("adds copies with new ids, on top, centred at the point, as one undo step, and selects them", () => {
    const scene = new Scene([ink, img, txt]);
    const history = new History();
    const selection = new Selection(scene);
    const clip = new Clipboard({ storage });
    clip.copy([ink, img]);
    const ids = pasteInto({ scene, history, selection, newId }, clip, [1000, 1000]);
    expect(ids).toEqual(["new-1", "new-2"]);
    expect(selection.ids).toEqual(["new-1", "new-2"]);
    const pasted = ids.map((id) => scene.get(id) as CanvasElement);
    expect(pasted.map((e) => e.z)).toEqual([6, 7]); // above everything, original order kept
    expect(pasted[1]).toMatchObject({ type: "image", assetPath: "owner/page/a.png" });
    const b = selection.bounds()!;
    expect((b.minX + b.maxX) / 2).toBeCloseTo(1000);
    expect((b.minY + b.maxY) / 2).toBeCloseTo(1000);
    // The originals are untouched.
    expect(boundsOf(scene.get("img")!)).toEqual(boundsOf(img));
    expect(scene.all()).toHaveLength(5);
    history.undo(scene);
    expect(scene.all()).toHaveLength(3);
    expect(history.canUndo()).toBe(false);
  });

  it("pasting twice gives distinct ids, and an empty clipboard pastes nothing", () => {
    const scene = new Scene([]);
    const history = new History();
    const selection = new Selection(scene);
    const clip = new Clipboard({ storage });
    expect(pasteInto({ scene, history, selection, newId }, clip, [0, 0])).toEqual([]);
    expect(history.canUndo()).toBe(false);
    clip.copy([txt]);
    const a = pasteInto({ scene, history, selection, newId }, clip, [0, 0]);
    const c = pasteInto({ scene, history, selection, newId }, clip, [0, 0]);
    expect(a[0]).not.toBe(c[0]);
    expect(scene.all()).toHaveLength(2);
  });
});
