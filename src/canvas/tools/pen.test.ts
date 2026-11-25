import { beforeEach, describe, expect, it } from "vitest";
import { Scene } from "../model/scene";
import type { StrokeEl } from "../model/types";
import { PenTool } from "./pen";
import type { PointerInfo } from "./tool";

const pen: PointerInfo = { kind: "pen", pressure: 0.7, timeStamp: 0, shiftKey: false };
const mouse: PointerInfo = { kind: "mouse", pressure: 0.5, timeStamp: 0, shiftKey: false };

describe("PenTool", () => {
  let scene: Scene;
  let live: (StrokeEl | null)[];
  let tool: PenTool;
  let ids: number;

  beforeEach(() => {
    scene = new Scene();
    live = [];
    ids = 0;
    tool = new PenTool({
      scene,
      style: () => ({ color: "#2563eb", size: 4 }),
      setLive: (s) => live.push(s),
      newId: () => `id-${++ids}`,
      now: () => 1000,
    });
  });

  it("down/move/up adds one stroke with all world points and z = scene.nextZ()", () => {
    scene.add({ ...{ id: "old", z: 7, updatedAt: 1, type: "stroke", tool: "pen", color: "#000", size: 2, points: [[0, 0, 0.5]], simulatePressure: true } });
    const expectedZ = scene.nextZ();
    tool.down([10, 20, 0.3], pen);
    tool.move([[11, 21, 0.4], [12, 22, 0.5]], pen);
    tool.move([[13, 23, 0.6]], pen);
    tool.up();
    const strokes = scene.all().filter((e) => e.id !== "old");
    expect(strokes).toHaveLength(1);
    const s = strokes[0] as StrokeEl;
    expect(s).toMatchObject({
      id: "id-1", type: "stroke", tool: "pen", color: "#2563eb", size: 4, z: expectedZ, updatedAt: 1000,
      simulatePressure: false,
    });
    expect(s.points).toEqual([[10, 20, 0.3], [11, 21, 0.4], [12, 22, 0.5], [13, 23, 0.6]]);
    expect(live.at(-1)).toBeNull();
    expect(live.some((l) => l !== null && l.points.length === 4)).toBe(true);
  });

  it("mouse strokes simulate pressure", () => {
    tool.down([0, 0, 0.5], mouse);
    tool.move([[5, 5, 0.5]], mouse);
    tool.up();
    expect((scene.all()[0] as StrokeEl).simulatePressure).toBe(true);
  });

  it("cancel() adds nothing and clears the live stroke", () => {
    tool.down([0, 0, 0.5], pen);
    tool.move([[5, 5, 0.5]], pen);
    tool.cancel();
    tool.up();
    expect(scene.all()).toHaveLength(0);
    expect(live.at(-1)).toBeNull();
  });

  it("a down/up with no movement adds a dot stroke (1 point)", () => {
    tool.down([3, 4, 0.5], pen);
    tool.up();
    const all = scene.all();
    expect(all).toHaveLength(1);
    expect((all[0] as StrokeEl).points).toEqual([[3, 4, 0.5]]);
  });

  it("move or up without down does nothing", () => {
    tool.move([[1, 1, 0.5]], pen);
    tool.up();
    expect(scene.all()).toHaveLength(0);
  });

  it("uses the style at the time the stroke starts", () => {
    let color = "#111827";
    const t = new PenTool({ scene, style: () => ({ color, size: 8 }), setLive: () => {} });
    t.down([0, 0, 0.5], pen);
    color = "#dc2626";
    t.up();
    expect((scene.all()[0] as StrokeEl).color).toBe("#111827");
    expect(typeof scene.all()[0].id).toBe("string");
  });
});

/** Manual clock: timers fire only when `advance` passes their due time. */
function fakeClock() {
  let t = 0;
  let seq = 0;
  const timers = new Map<number, { at: number; fn: () => void }>();
  return {
    now: () => t,
    setTimeout: (fn: () => void, ms: number) => {
      timers.set(++seq, { at: t + ms, fn });
      return seq;
    },
    clearTimeout: (h: unknown) => {
      timers.delete(h as number);
    },
    pending: () => timers.size,
    advance(ms: number) {
      const end = t + ms;
      for (;;) {
        let next: [number, { at: number; fn: () => void }] | null = null;
        for (const e of timers) if (e[1].at <= end && (!next || e[1].at < next[1].at)) next = e;
        if (!next) break;
        timers.delete(next[0]);
        t = next[1].at;
        next[1].fn();
      }
      t = end;
    },
  };
}

describe("PenTool snap to shape", () => {
  let scene: Scene;
  let ghosts: (StrokeEl | null)[];
  let commits: number;
  let snap: boolean;
  let zoom: number;
  let clock: ReturnType<typeof fakeClock>;
  let tool: PenTool;

  beforeEach(() => {
    scene = new Scene();
    ghosts = [];
    commits = 0;
    snap = true;
    zoom = 1;
    clock = fakeClock();
    tool = new PenTool({
      scene,
      style: () => ({ color: "#2563eb", size: 4 }),
      setLive: () => {},
      setGhost: (g) => ghosts.push(g),
      snap: () => snap,
      zoom: () => zoom,
      clock,
      onCommit: () => commits++,
      newId: () => "s",
      now: () => 1000,
    });
  });

  /** A rough rectangle, as move batches of a few points each (like coalesced events), 16 ms apart. */
  function drawRect(x0 = 0, y0 = 0) {
    const v: [number, number][] = [[x0, y0], [x0 + 200, y0], [x0 + 200, y0 + 120], [x0, y0 + 120], [x0, y0]];
    tool.down([x0, y0, 0.5], pen);
    for (let i = 0; i < v.length - 1; i++) {
      for (let k = 1; k <= 20; k++) {
        const t = k / 20;
        const j = (k % 3) - 1; // +-1 jitter
        clock.advance(16);
        tool.move([[v[i][0] + (v[i + 1][0] - v[i][0]) * t + j, v[i][1] + (v[i + 1][1] - v[i][1]) * t - j, 0.5]], pen);
      }
    }
  }
  const last = () => ghosts.at(-1) ?? null;

  it("holding still for 500 ms shows the ghost of the recognised shape", () => {
    drawRect();
    clock.advance(499);
    expect(last()).toBeNull();
    clock.advance(1);
    expect(last()?.points.length).toBeGreaterThan(50);
    expect(last()).toMatchObject({ color: "#2563eb", size: 4, tool: "pen" });
  });

  it("tiny movement within 4 screen px keeps the hold; the threshold scales with zoom", () => {
    zoom = 0.5; // 4 screen px = 8 world units
    drawRect();
    clock.advance(200);
    tool.move([[6, 0, 0.5], [3, 4, 0.5]], pen);
    clock.advance(300);
    expect(last()).not.toBeNull();
  });

  it("moving more than 4 screen px clears the ghost and resumes drawing", () => {
    drawRect();
    clock.advance(500);
    expect(last()).not.toBeNull();
    tool.move([[20, 20, 0.5]], pen);
    expect(last()).toBeNull();
    tool.move([[60, 60, 0.5]], pen);
    tool.up();
    const s = scene.all()[0] as StrokeEl;
    expect(s.points.at(-1)).toEqual([60, 60, 0.5]); // raw stroke
  });

  it("lifting with a ghost commits the clean shape as one undo step", () => {
    drawRect();
    clock.advance(600);
    tool.up();
    expect(scene.all()).toHaveLength(1);
    expect(commits).toBe(1);
    const s = scene.all()[0] as StrokeEl;
    expect(s.simulatePressure).toBe(false);
    expect(s.points.every((p) => p[2] === 0.5)).toBe(true);
    expect(s.points.at(-1)).toEqual(s.points[0]);
    const xs = s.points.map((p) => p[0]);
    const ys = s.points.map((p) => p[1]);
    for (const p of s.points) {
      const onX = Math.abs(p[0] - Math.min(...xs)) < 1e-6 || Math.abs(p[0] - Math.max(...xs)) < 1e-6;
      const onY = Math.abs(p[1] - Math.min(...ys)) < 1e-6 || Math.abs(p[1] - Math.max(...ys)) < 1e-6;
      expect(onX || onY).toBe(true);
    }
    expect(last()).toBeNull();
    expect(clock.pending()).toBe(0);
  });

  it("lifting before 500 ms commits the raw stroke", () => {
    drawRect();
    clock.advance(450);
    tool.up();
    const s = scene.all()[0] as StrokeEl;
    expect(s.points).toHaveLength(81);
    expect(s.simulatePressure).toBe(false);
    expect(ghosts.every((g) => g === null)).toBe(true);
    expect(clock.pending()).toBe(0);
    clock.advance(1000);
    expect(ghosts.every((g) => g === null)).toBe(true);
  });

  it("snap off never ghosts and arms no timer", () => {
    snap = false;
    drawRect();
    expect(clock.pending()).toBe(0);
    clock.advance(2000);
    expect(ghosts.every((g) => g === null)).toBe(true);
  });

  it("slow handwriting with 300 ms pauses never ghosts", () => {
    tool.down([0, 0, 0.5], pen);
    let x = 0;
    for (let word = 0; word < 12; word++) {
      // A loop-ish letter, then a pause.
      for (let k = 0; k < 10; k++) {
        clock.advance(16);
        x += 2;
        tool.move([[x, Math.sin(k) * 10, 0.5]], pen);
      }
      clock.advance(300);
    }
    tool.up();
    expect(ghosts.every((g) => g === null)).toBe(true);
    expect((scene.all()[0] as StrokeEl).points).toHaveLength(121);
  });

  it("a hold on an unrecognisable stroke shows no ghost and commits it raw", () => {
    tool.down([0, 0, 0.5], pen);
    for (let k = 1; k <= 60; k++) tool.move([[k * 3, Math.sin(k / 3) * 30, 0.5]], pen);
    clock.advance(800);
    expect(ghosts.every((g) => g === null)).toBe(true);
    tool.up();
    expect((scene.all()[0] as StrokeEl).points).toHaveLength(61);
  });

  it("cancel clears the ghost and the timer", () => {
    drawRect();
    clock.advance(500);
    tool.cancel();
    expect(last()).toBeNull();
    expect(scene.all()).toHaveLength(0);
    expect(clock.pending()).toBe(0);
  });
});
