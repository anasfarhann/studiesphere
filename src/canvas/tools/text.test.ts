import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import { boundsOf } from "../model/bounds";
import { History } from "../model/history";
import { Scene } from "../model/scene";
import type { TextEl } from "../model/types";
import { wrapText } from "../model/wrap-text";
import { TextEditing, TextTool } from "./text";
import type { PointerInfo } from "./tool";

const mouse: PointerInfo = { kind: "mouse", pressure: 0.5, timeStamp: 0, shiftKey: false };
const fixed = (s: string, f: number) => s.length * f; // 1em per char: easy to reason about

describe("wrapText", () => {
  it("keeps explicit newlines and empty lines", () => {
    expect(wrapText(fixed, "a\n\nb", 1000, 1)).toEqual(["a", "", "b"]);
  });
  it("wraps at word boundaries to the width", () => {
    expect(wrapText(fixed, "aa bb cc", 5, 1)).toEqual(["aa bb", "cc"]);
  });
  it("keeps leading and repeated spaces, and does not use regex lookbehind", () => {
    expect(wrapText(fixed, " a  b", 1000, 1)).toEqual([" a  b"]);
    expect(wrapText(fixed, "aaa bbb", 3, 1)).toEqual(["aaa", "bbb"]);
    expect(readFileSync("src/canvas/model/wrap-text.ts", "utf8")).not.toMatch(/\(\?<[=!]/);
  });
  it("breaks a word longer than the width by characters", () => {
    expect(wrapText(fixed, "abcdefg", 3, 1)).toEqual(["abc", "def", "g"]);
  });
});

describe("TextEl bounds", () => {
  it("grow with the wrapped line count", () => {
    const el: TextEl = { id: "t", z: 0, updatedAt: 1, type: "text", x: 0, y: 0, w: 100, text: "word ".repeat(40), fontSize: 18, color: "#000" };
    const b = boundsOf(el);
    expect(b.maxY - b.minY).toBeGreaterThan(18 * 1.4 * 3);
  });
});

describe("TextEditing", () => {
  let scene: Scene;
  let history: History;
  let editing: TextEditing;
  let n: number;

  beforeEach(() => {
    scene = new Scene();
    history = new History();
    n = 0;
    editing = new TextEditing({ scene, history, style: () => ({ color: "#2563eb" }), newId: () => `t${++n}`, now: () => 1000 });
  });

  it("commit creates one TextEl with the typed text as one history step", () => {
    editing.beginAt(40, 50);
    editing.commit("Mitochondria");
    const els = scene.all();
    expect(els).toHaveLength(1);
    expect(els[0]).toMatchObject({ id: "t1", type: "text", x: 40, y: 50, w: 320, fontSize: 18, color: "#2563eb", text: "Mitochondria", z: 0 });
    expect(editing.session).toBeNull();
    history.undo(scene);
    expect(scene.all()).toHaveLength(0);
    expect(history.canUndo()).toBe(false);
  });

  it("empty (or blank) commit of a new box creates nothing", () => {
    editing.beginAt(0, 0);
    editing.commit("  \n ");
    expect(scene.all()).toHaveLength(0);
    expect(history.canUndo()).toBe(false);
  });

  it("editing updates the same id as one undo step", () => {
    editing.beginAt(0, 0);
    editing.commit("one");
    expect(editing.beginEdit("t1")).toBe(true);
    expect(editing.hiddenId).toBe("t1");
    editing.commit("two");
    expect(scene.all()).toHaveLength(1);
    expect((scene.get("t1") as TextEl).text).toBe("two");
    expect(editing.hiddenId).toBeNull();
    history.undo(scene);
    expect((scene.get("t1") as TextEl).text).toBe("one");
    history.redo(scene);
    expect((scene.get("t1") as TextEl).text).toBe("two");
  });

  it("editing to empty deletes the element in one step", () => {
    editing.beginAt(0, 0);
    editing.commit("one");
    editing.beginEdit("t1");
    editing.commit("");
    expect(scene.all()).toHaveLength(0);
    history.undo(scene);
    expect((scene.get("t1") as TextEl).text).toBe("one");
  });

  it("unchanged edit pushes no history step; second commit is a no-op", () => {
    editing.beginAt(0, 0);
    editing.commit("one");
    editing.beginEdit("t1");
    editing.commit("one");
    editing.commit("zzz");
    history.undo(scene); // undoes the creation, not an edit
    expect(scene.all()).toHaveLength(0);
  });

  it("reads the bound input when commit gets no text", () => {
    let focused = 0;
    editing.bind({ focus: () => focused++, value: () => "from input" });
    editing.beginAt(1, 2);
    expect(focused).toBe(1);
    editing.commit();
    expect((scene.get("t1") as TextEl).text).toBe("from input");
  });
});

describe("TextEditing styles", () => {
  const make = () => {
    const scene = new Scene();
    const history = new History();
    let n = 0;
    const editing = new TextEditing({
      scene, history, style: () => ({ color: "#dc2626", size: 30, font: "serif", bold: true, italic: false, underline: true }),
      newId: () => `t${++n}`, now: () => 1,
    });
    return { scene, history, editing };
  };

  it("a new box takes font, size, colour and styles from the settings seams", () => {
    const { scene, editing } = make();
    editing.beginAt(0, 0);
    editing.commit("hello");
    expect(scene.get("t1")).toMatchObject({ fontSize: 30, color: "#dc2626", font: "serif", bold: true, underline: true });
    expect((scene.get("t1") as TextEl).italic).toBeFalsy();
  });

  it("restyling the session of a new box changes what is created", () => {
    const { scene, editing } = make();
    editing.beginAt(0, 0);
    editing.restyle({ font: "mono", italic: true, fontSize: 40 });
    editing.commit("x");
    expect(scene.get("t1")).toMatchObject({ font: "mono", italic: true, bold: true, fontSize: 40 });
  });

  it("beginEdit carries the box's style into the session; a legacy box has none", () => {
    const { scene, editing } = make();
    scene.add({ id: "old", z: 0, updatedAt: 1, type: "text", x: 0, y: 0, w: 100, text: "o", fontSize: 18, color: "#000" });
    editing.beginEdit("old");
    expect(editing.session).toMatchObject({ fontSize: 18 });
    expect(editing.session?.font).toBeUndefined();
    expect(editing.session?.bold).toBeFalsy();
  });
});

describe("TextTool", () => {
  it("a tap on empty canvas begins a new box on pointer up; a tap on a text box edits it", () => {
    const scene = new Scene();
    const history = new History();
    const editing = new TextEditing({ scene, history, style: () => ({ color: "#000" }), newId: () => "a", now: () => 1 });
    const tool = new TextTool({ scene, editing, slop: () => 5 });
    tool.down([10, 10, 0.5], mouse);
    expect(editing.session).toBeNull(); // focus must happen on up (iOS keyboard gesture)
    tool.up();
    expect(editing.session).toMatchObject({ id: null, x: 10, y: 10 });
    editing.commit("hello");
    tool.down([20, 20, 0.5], mouse);
    tool.up();
    expect(editing.session).toMatchObject({ id: "a", text: "hello" });
  });

  it("a drag does not start a box", () => {
    const scene = new Scene();
    const editing = new TextEditing({ scene, history: new History(), style: () => ({ color: "#000" }) });
    const tool = new TextTool({ scene, editing, slop: () => 5 });
    tool.down([0, 0, 0.5], mouse);
    tool.move([[50, 0, 0.5]], mouse);
    tool.up();
    expect(editing.session).toBeNull();
  });
});
