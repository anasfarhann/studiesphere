import { describe, expect, it } from "vitest";
import { InputRouter } from "./router";

describe("InputRouter", () => {
  it("mouse draws", () => {
    expect(new InputRouter().classify({ pointerType: "mouse", activeTouches: 0 })).toEqual({ kind: "draw" });
  });

  it("pen draws and marks the pen as seen", () => {
    const r = new InputRouter();
    expect(r.classify({ pointerType: "pen", activeTouches: 0 })).toEqual({ kind: "draw" });
    expect(r.penSeen).toBe(true);
  });

  it("one touch before any pen draws", () => {
    const r = new InputRouter();
    expect(r.penOnly).toBe("auto");
    expect(r.classify({ pointerType: "touch", activeTouches: 1 })).toEqual({ kind: "draw" });
  });

  it("two touches before any pen pinch", () => {
    expect(new InputRouter().classify({ pointerType: "touch", activeTouches: 2 })).toEqual({ kind: "pinch" });
  });

  it("touch never draws once a pen has been seen", () => {
    const r = new InputRouter();
    r.classify({ pointerType: "pen", activeTouches: 0 });
    expect(r.classify({ pointerType: "touch", activeTouches: 1 })).toEqual({ kind: "pan" });
    expect(r.classify({ pointerType: "touch", activeTouches: 2 })).toEqual({ kind: "pinch" });
    for (let n = 1; n <= 5; n++) expect(r.classify({ pointerType: "touch", activeTouches: n }).kind).not.toBe("draw");
    // Mouse is not a finger: it keeps drawing even with a pen around (e.g. iPad with trackpad).
    expect(r.classify({ pointerType: "pen", activeTouches: 3 })).toEqual({ kind: "draw" });
  });

  it("penOnly=true pans with one touch even before a pen is seen", () => {
    const r = new InputRouter();
    r.penOnly = true;
    expect(r.classify({ pointerType: "touch", activeTouches: 1 })).toEqual({ kind: "pan" });
  });

  it("penOnly=false set manually lets one touch draw again", () => {
    const r = new InputRouter();
    r.classify({ pointerType: "pen", activeTouches: 0 });
    r.penOnly = false;
    expect(r.classify({ pointerType: "touch", activeTouches: 1 })).toEqual({ kind: "draw" });
    expect(r.classify({ pointerType: "touch", activeTouches: 2 })).toEqual({ kind: "pinch" });
  });

  it("ignores impossible touch counts", () => {
    expect(new InputRouter().classify({ pointerType: "touch", activeTouches: 0 })).toEqual({ kind: "ignore" });
  });
});
