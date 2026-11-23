import { describe, expect, it, vi } from "vitest";
import { History } from "../model/history";
import { Scene } from "../model/scene";
import type { StrokeEl } from "../model/types";
import { MemoryElementStore } from "./memory-store";
import { MemorySnapshotStore } from "./memory-snapshot-store";
import { maybeSnapshot, restoreSnapshot, SnapshotScheduler, SNAPSHOT_INTERVAL_MS } from "./snapshots";

const PAGE = "page-1";
const HOUR = SNAPSHOT_INTERVAL_MS;

const stroke = (id: string, color = "#000", z = 0): StrokeEl => ({
  id, z, updatedAt: 1000, type: "stroke", tool: "pen", color, size: 4,
  points: [[0, 0, 0.5], [10, 10, 0.5]], simulatePressure: true,
});

describe("maybeSnapshot", () => {
  it("does not snapshot within 60 minutes of the last one", async () => {
    const store = new MemorySnapshotStore();
    const scene = new Scene([stroke("a")]);
    expect(await maybeSnapshot(store, PAGE, scene, 0, HOUR - 1, true)).toBeNull();
    expect(await store.list(PAGE)).toEqual([]);
  });

  it("snapshots after 60 minutes when the page changed, and returns the new time", async () => {
    const store = new MemorySnapshotStore();
    const scene = new Scene([stroke("a")]);
    expect(await maybeSnapshot(store, PAGE, scene, 0, HOUR, true)).toBe(HOUR);
    const list = await store.list(PAGE);
    expect(list).toHaveLength(1);
    expect(list[0].elementCount).toBe(1);
  });

  it("does not snapshot when nothing changed since the last snapshot", async () => {
    const store = new MemorySnapshotStore();
    const scene = new Scene([stroke("a")]);
    expect(await maybeSnapshot(store, PAGE, scene, 0, HOUR * 5, false)).toBeNull();
    expect(await store.list(PAGE)).toEqual([]);
  });

  it("snapshots when there has never been one and the page changed", async () => {
    const store = new MemorySnapshotStore();
    expect(await maybeSnapshot(store, PAGE, new Scene([stroke("a")]), null, 5, true)).toBe(5);
  });
});

describe("restoreSnapshot", () => {
  it("replaces the page's elements and undo brings back the current version", async () => {
    const store = new MemorySnapshotStore();
    const scene = new Scene([stroke("a", "#111"), stroke("b")]);
    await store.create(PAGE, scene.all(), 1);
    const [snap] = await store.list(PAGE);

    scene.update("a", { color: "#f00" });
    scene.remove("b");
    scene.add(stroke("c"));
    const history = new History();

    const change = await restoreSnapshot(store, PAGE, snap.id, scene, history, { now: 2 });
    expect(scene.all().map((e) => e.id).sort()).toEqual(["a", "b"]);
    expect((scene.get("a") as StrokeEl).color).toBe("#111");
    expect(change.after.map((e) => e.id).sort()).toEqual(["a", "b"]);

    history.undo(scene);
    expect(scene.all().map((e) => e.id).sort()).toEqual(["a", "c"]);
    expect((scene.get("a") as StrokeEl).color).toBe("#f00");
    history.redo(scene);
    expect(scene.all().map((e) => e.id).sort()).toEqual(["a", "b"]);
  });

  it("takes a snapshot of the current state first, so restoring is never destructive", async () => {
    const store = new MemorySnapshotStore();
    const scene = new Scene([stroke("a")]);
    await store.create(PAGE, scene.all(), 1);
    const [snap] = await store.list(PAGE);
    scene.add(stroke("later"));
    await restoreSnapshot(store, PAGE, snap.id, scene, new History(), { now: 2 });
    const list = await store.list(PAGE);
    expect(list).toHaveLength(2);
    expect(list[0].elementCount).toBe(2); // newest first: the pre-restore state
  });

  it("stamps restored elements fresh, so autosave sends them", async () => {
    const store = new MemorySnapshotStore();
    const scene = new Scene([stroke("a"), stroke("b")]);
    await store.create(PAGE, scene.all(), 1);
    const [snap] = await store.list(PAGE);
    scene.remove("b");
    scene.takeDirty();
    await restoreSnapshot(store, PAGE, snap.id, scene, new History(), { now: 2 });
    const d = scene.takeDirty();
    expect(d.upserts.map((e) => e.id).sort()).toEqual(["a", "b"]);
    expect(d.upserts.find((e) => e.id === "b")!.updatedAt).toBeGreaterThan(1000);
  });

  it("fails without touching the scene when the snapshot is gone", async () => {
    const store = new MemorySnapshotStore();
    const scene = new Scene([stroke("a")]);
    await expect(restoreSnapshot(store, PAGE, "nope", scene, new History(), { now: 1 })).rejects.toThrow();
    expect(scene.all().map((e) => e.id)).toEqual(["a"]);
  });
});

describe("restore after an earlier session deleted an element", () => {
  it("brings it back even though this Scene never saw the tombstone", async () => {
    // Stamps above the real clock, so Date.now() alone could never beat the tombstone.
    const T0 = Date.now(), T1 = T0 + 60_000, T2 = T1 + 60_000;
    const elements = new MemoryElementStore();
    const snaps = new MemorySnapshotStore();
    const a: StrokeEl = { ...stroke("a"), updatedAt: T0 };
    await elements.save(PAGE, [a], []);
    await snaps.create(PAGE, [a], T0);
    // Earlier session: its Scene deletes the element; the tombstone (stamped T1) reaches the server.
    const earlier = new Scene(await elements.load(PAGE));
    vi.useFakeTimers();
    vi.setSystemTime(T1);
    earlier.remove("a");
    const tomb = earlier.takeDirty().deletes;
    vi.useRealTimers();
    expect(tomb).toEqual([{ id: "a", updatedAt: T1 }]);
    await elements.save(PAGE, [], tomb);
    // New session: loads the live elements only.
    const scene = new Scene(await elements.load(PAGE));
    expect(scene.all()).toEqual([]);
    const [snap] = await snaps.list(PAGE);
    await restoreSnapshot(snaps, PAGE, snap.id, scene, new History(), { now: T2 });
    const d = scene.takeDirty();
    await elements.save(PAGE, d.upserts, d.deletes);
    expect(d.upserts.map((e) => e.updatedAt)).toEqual([T2]); // Scene.add keeps the injected clock here
    expect((await elements.load(PAGE)).map((e) => e.id)).toEqual(["a"]);
  });

  it("runs beforeRestore before the pre-restore snapshot and afterRestore after the change", async () => {
    const store = new MemorySnapshotStore();
    const scene = new Scene([stroke("a")]);
    await store.create(PAGE, scene.all(), 1);
    const [snap] = await store.list(PAGE);
    await restoreSnapshot(store, PAGE, snap.id, scene, new History(), {
      now: 2,
      beforeRestore: () => scene.add(stroke("typed")),
      afterRestore: () => expect(scene.get("typed")).toBeUndefined(),
    });
    const [pre] = await store.list(PAGE);
    expect((await store.load(pre.id)).map((e) => e.id).sort()).toEqual(["a", "typed"]);
  });
});

describe("MemorySnapshotStore", () => {
  it("keeps the latest 30: the 31st removes the oldest", async () => {
    const store = new MemorySnapshotStore();
    for (let i = 1; i <= 31; i++) await store.create(PAGE, [stroke(`e${i}`)], i);
    const list = await store.list(PAGE);
    expect(list).toHaveLength(30);
    expect(list[0].createdAt).toBe(31);
    expect(list.at(-1)!.createdAt).toBe(2);
  });

  it("prunes per page and reports the newest time", async () => {
    const store = new MemorySnapshotStore();
    await store.create("other", [], 100);
    for (let i = 1; i <= 31; i++) await store.create(PAGE, [], i);
    expect(await store.list("other")).toHaveLength(1);
    expect(await store.latestAt(PAGE)).toBe(31);
    expect(await store.latestAt("empty")).toBeNull();
  });
});

describe("SnapshotScheduler", () => {
  it("snapshots only when due and changed; reads the last time from the store", async () => {
    const store = new MemorySnapshotStore();
    await store.create(PAGE, [], 1000);
    const scene = new Scene([stroke("a")]);
    let now = 1000 + HOUR - 1;
    const s = new SnapshotScheduler(scene, store, PAGE, () => now);
    scene.update("a", { color: "#f00" });
    await s.check();
    expect(await store.list(PAGE)).toHaveLength(1); // not yet 60 min
    now = 1000 + HOUR;
    await s.check();
    expect(await store.list(PAGE)).toHaveLength(2);
    now += 5 * HOUR;
    await s.check(); // unchanged since
    expect(await store.list(PAGE)).toHaveLength(2);
    scene.add(stroke("b"));
    await s.check();
    expect(await store.list(PAGE)).toHaveLength(3);
    s.dispose();
  });

  it("backs off 1, 2, 4 … 30 min after failures, warns once, resets on success", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(HOUR * 3);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const store = new MemorySnapshotStore();
    const scene = new Scene();
    const s = new SnapshotScheduler(scene, store, PAGE);
    scene.add(stroke("a"));
    const create = vi.spyOn(store, "create").mockRejectedValue(new Error("too big"));
    const MIN = 60_000;
    await s.check();
    expect(create).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(MIN - 1);
    await s.check();
    expect(create).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    await s.check(); // failure 2
    expect(create).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(2 * MIN - 1);
    await s.check();
    expect(create).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    await s.check(); // failure 3, next wait 4 min
    expect(create).toHaveBeenCalledTimes(3);
    expect(warn).toHaveBeenCalledTimes(1);
    for (const wait of [4, 8, 16, 30, 30]) {
      await vi.advanceTimersByTimeAsync(wait * MIN - 1);
      const n = create.mock.calls.length;
      await s.check();
      expect(create).toHaveBeenCalledTimes(n);
      await vi.advanceTimersByTimeAsync(1);
      await s.check();
      expect(create).toHaveBeenCalledTimes(n + 1);
    }
    create.mockRestore();
    await vi.advanceTimersByTimeAsync(30 * MIN);
    await s.check();
    expect(await store.list(PAGE)).toHaveLength(1);
    scene.add(stroke("b"));
    await vi.advanceTimersByTimeAsync(HOUR);
    await s.check(); // streak reset: due immediately
    expect(await store.list(PAGE)).toHaveLength(2);
    vi.useRealTimers();
    warn.mockRestore();
  });
});
