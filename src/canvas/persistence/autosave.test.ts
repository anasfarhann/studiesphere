import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { History } from "../model/history";
import { Scene } from "../model/scene";
import type { CanvasElement, StrokeEl } from "../model/types";
import { Autosave } from "./autosave";
import { MemoryElementStore, MemoryOfflineQueue } from "./memory-store";
import { applyBatches, ElementStoreError, type OfflineQueue, type SaveState } from "./store";

const PAGE = "page-1";

function stroke(id: string, updatedAt = Date.now(), z = 0): StrokeEl {
  return {
    id, z, updatedAt, type: "stroke", tool: "pen", color: "#000", size: 4,
    points: [[0, 0, 0.5], [10, 10, 0.5]], simulatePressure: true,
  };
}

function setVisibility(v: "hidden" | "visible") {
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => v });
  document.dispatchEvent(new Event("visibilitychange"));
}

function setOnline(v: boolean) {
  Object.defineProperty(navigator, "onLine", { configurable: true, get: () => v });
  if (v) window.dispatchEvent(new Event("online"));
  else window.dispatchEvent(new Event("offline"));
}

describe("Autosave", () => {
  let store: MemoryElementStore;
  let queue: MemoryOfflineQueue;
  let save: MockInstance<MemoryElementStore["save"]>;
  let autosave: Autosave | null;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);
    store = new MemoryElementStore();
    queue = new MemoryOfflineQueue(PAGE);
    save = vi.spyOn(store, "save");
    autosave = null;
    setOnline(true);
  });

  afterEach(async () => {
    await autosave?.dispose();
    vi.useRealTimers();
    setVisibility("visible");
  });

  function start(scene: Scene, opts: { debounceMs?: number } = {}) {
    autosave = new Autosave(scene, store, PAGE, { queue, ...opts });
    const states: SaveState[] = [];
    autosave.onState((s) => states.push(s));
    return { autosave, states };
  }

  it("saves one stroke once, 1500 ms after the last change", async () => {
    const scene = new Scene();
    start(scene);
    scene.add(stroke("a"));
    await vi.advanceTimersByTimeAsync(1499);
    expect(save).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0][0]).toBe(PAGE);
    expect(save.mock.calls[0][1].map((e) => e.id)).toEqual(["a"]);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(save).toHaveBeenCalledTimes(1);
    expect((await store.load(PAGE)).map((e) => e.id)).toEqual(["a"]);
  });

  it("ten quick strokes make one save call", async () => {
    const scene = new Scene();
    const { states } = start(scene);
    for (let i = 0; i < 10; i++) {
      scene.add(stroke(`s${i}`));
      await vi.advanceTimersByTimeAsync(100);
    }
    expect(save).not.toHaveBeenCalled();
    expect(states.at(-1)).toBe("saving");
    await vi.advanceTimersByTimeAsync(1500);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0][1]).toHaveLength(10);
    expect(states.at(-1)).toBe("saved");
  });

  it("a change reaches the store within 2 s even while edits keep coming", async () => {
    const scene = new Scene();
    start(scene);
    scene.add(stroke("first"));
    // Keep editing every second for 10 s: the save must not be postponed forever.
    for (let i = 0; i < 10; i++) {
      await vi.advanceTimersByTimeAsync(1000);
      scene.add(stroke(`more${i}`));
    }
    const saved = save.mock.calls.flatMap((c) => c[1].map((e) => e.id));
    expect(saved).toContain("first");
  });

  it("flushes on hide", async () => {
    const scene = new Scene();
    start(scene);
    scene.add(stroke("a"));
    setVisibility("hidden");
    await vi.advanceTimersByTimeAsync(0);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0][1].map((e) => e.id)).toEqual(["a"]);
  });

  it("flushes on pagehide", async () => {
    const scene = new Scene();
    start(scene);
    scene.add(stroke("a"));
    window.dispatchEvent(new Event("pagehide"));
    await vi.advanceTimersByTimeAsync(0);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("a batch is in the durable queue while its save is in flight (tab killed mid-request)", async () => {
    const scene = new Scene();
    let release!: () => void;
    save.mockImplementationOnce(() => new Promise<void>((r) => (release = r)));
    start(scene);
    scene.add(stroke("a"));
    setVisibility("hidden");
    await vi.advanceTimersByTimeAsync(0);
    // The request has not answered: if the tab dies now, the next visit still has the stroke.
    const queued = await queue.drain();
    expect(queued.flatMap((b) => b.upserts.map((e) => e.id))).toEqual(["a"]);
    release();
    await vi.advanceTimersByTimeAsync(0);
    expect(await queue.drain()).toEqual([]);
  });

  it("queues while offline and replays", async () => {
    const scene = new Scene();
    const { states } = start(scene);
    save.mockRejectedValue(new TypeError("Failed to fetch"));
    setOnline(false);
    scene.add(stroke("offline-1"));
    await vi.advanceTimersByTimeAsync(1500);
    expect(states.at(-1)).toBe("offline");
    expect((await queue.drain()).flatMap((b) => b.upserts.map((e) => e.id))).toEqual(["offline-1"]);

    // A newer edit while still offline, touching the same element plus a new one.
    scene.update("offline-1", { color: "#f00" });
    scene.add(stroke("offline-2"));
    await vi.advanceTimersByTimeAsync(1500);
    expect(states.at(-1)).toBe("offline");

    save.mockRestore();
    save = vi.spyOn(store, "save");
    setOnline(true);
    await vi.advanceTimersByTimeAsync(0);
    const order = save.mock.calls.map((c) => c[1].map((e) => e.id));
    expect(order[0]).toEqual(["offline-1"]); // the oldest queued batch first
    expect(order.flat()).toContain("offline-2");
    expect(states.at(-1)).toBe("saved");
    const loaded = await store.load(PAGE);
    expect(loaded.find((e) => e.id === "offline-1")).toMatchObject({ color: "#f00" });
    expect(loaded.map((e) => e.id).sort()).toEqual(["offline-1", "offline-2"]);
    expect(await queue.drain()).toEqual([]);
  });

  it("retries with backoff 2 s, 4 s, 8 s … capped at 60 s", async () => {
    const scene = new Scene();
    start(scene);
    save.mockRejectedValue(new TypeError("Failed to fetch"));
    scene.add(stroke("a"));
    await vi.advanceTimersByTimeAsync(1500);
    expect(save).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1999);
    expect(save).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(save).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(4000);
    expect(save).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(8000);
    expect(save).toHaveBeenCalledTimes(4);
    await vi.advanceTimersByTimeAsync(16_000 + 32_000);
    expect(save).toHaveBeenCalledTimes(6);
    await vi.advanceTimersByTimeAsync(59_999);
    expect(save).toHaveBeenCalledTimes(6);
    await vi.advanceTimersByTimeAsync(1);
    expect(save).toHaveBeenCalledTimes(7);
  });

  it("a server error shows 'error' and is still retried, never dropped", async () => {
    const scene = new Scene();
    const { states } = start(scene);
    save.mockRejectedValueOnce(new ElementStoreError("permission denied", false));
    scene.add(stroke("a"));
    await vi.advanceTimersByTimeAsync(1500);
    expect(states.at(-1)).toBe("error");
    await vi.advanceTimersByTimeAsync(2000);
    expect(states.at(-1)).toBe("saved");
    expect((await store.load(PAGE)).map((e) => e.id)).toEqual(["a"]);
  });

  it("replays batches queued in an earlier visit before new edits", async () => {
    await queue.push({ id: "b-old", pageId: PAGE, upserts: [stroke("old", 500)], deletes: [], queuedAt: 500 });
    const scene = new Scene(applyBatches([], await queue.drain()));
    start(scene);
    scene.add(stroke("new"));
    await vi.advanceTimersByTimeAsync(1500);
    const order = save.mock.calls.map((c) => c[1].map((e) => e.id));
    expect(order).toEqual([["old"], ["new"]]);
    expect(await queue.drain()).toEqual([]);
  });

  it("saves only changed elements, never the whole page", async () => {
    const many: CanvasElement[] = Array.from({ length: 500 }, (_, i) => stroke(`e${i}`, 1000, i));
    await store.save(PAGE, many, []);
    save.mockClear();
    const scene = new Scene(await store.load(PAGE));
    start(scene);
    scene.update("e42", { color: "#0f0" });
    await vi.advanceTimersByTimeAsync(1500);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0][1].map((e) => e.id)).toEqual(["e42"]);
    expect(save.mock.calls[0][2]).toEqual([]);
  });

  it("sends deletes", async () => {
    await store.save(PAGE, [stroke("a", 1000)], []);
    const scene = new Scene(await store.load(PAGE));
    start(scene);
    scene.remove("a");
    await vi.advanceTimersByTimeAsync(1500);
    expect(save.mock.calls.at(-1)?.[2]).toEqual([{ id: "a", updatedAt: expect.any(Number) }]);
    expect(await store.load(PAGE)).toEqual([]);
  });

  it("dispose does a final flush", async () => {
    const scene = new Scene();
    const { autosave: a } = start(scene);
    scene.add(stroke("a"));
    await a.dispose();
    autosave = null;
    expect(save).toHaveBeenCalledTimes(1);
    scene.add(stroke("after"));
    await vi.advanceTimersByTimeAsync(5000);
    expect(save).toHaveBeenCalledTimes(1);
  });
});

describe("Autosave with a hanging IndexedDB", () => {
  const never = <T,>() => new Promise<T>(() => {});
  const hanging: OfflineQueue = { push: () => never(), drain: () => never(), remove: () => never() };

  afterEach(() => vi.useRealTimers());

  it("keeps saving every stroke within 2 s, with no growing lag", async () => {
    vi.useFakeTimers();
    const store = new MemoryElementStore();
    const saveAt: number[] = [];
    const t0 = Date.now();
    vi.spyOn(store, "save").mockImplementation(async () => {
      saveAt.push(Date.now() - t0);
    });
    const scene = new Scene();
    const a = new Autosave(scene, store, PAGE, { queue: hanging });
    const editAt: number[] = [];
    for (let i = 0; i < 5; i++) {
      editAt.push(Date.now() - t0);
      scene.add(stroke(`h${i}`));
      await vi.advanceTimersByTimeAsync(2500);
    }
    expect(saveAt).toHaveLength(5);
    saveAt.forEach((t, i) => expect(t - editAt[i]).toBeLessThanOrEqual(2000));
    const states: SaveState[] = [];
    a.onState((s) => states.push(s));
    expect(states.at(-1)).toBe("saved");
    void a.dispose();
  });
});

describe("MemoryElementStore (same merge rules as save_elements)", () => {
  it("an older updatedAt never overwrites a newer row", async () => {
    const s = new MemoryElementStore();
    await s.save(PAGE, [{ ...stroke("a", 2000), color: "#new" }], []);
    await s.save(PAGE, [{ ...stroke("a", 1000), color: "#old" }], []);
    expect((await s.load(PAGE))[0]).toMatchObject({ color: "#new", updatedAt: 2000 });
  });

  it("an older upsert arriving after a delete does not resurrect the element", async () => {
    const s = new MemoryElementStore();
    await s.save(PAGE, [stroke("a", 2000)], []);
    await s.save(PAGE, [], [{ id: "a", updatedAt: 2001 }, { id: "never-saved", updatedAt: 2001 }]);
    await s.save(PAGE, [stroke("a", 2000)], []);
    expect(await s.load(PAGE)).toEqual([]);
  });
});

describe("MemoryOfflineQueue", () => {
  it("two tabs queuing at the same millisecond keep both batches", async () => {
    const q = new MemoryOfflineQueue(PAGE);
    await q.push({ id: "tab1", pageId: PAGE, upserts: [stroke("x", 1)], deletes: [], queuedAt: 7 });
    await q.push({ id: "tab2", pageId: PAGE, upserts: [stroke("y", 1)], deletes: [], queuedAt: 7 });
    expect((await q.drain()).map((b) => b.id)).toEqual(["tab1", "tab2"]);
    await q.remove("tab1");
    expect((await q.drain()).map((b) => b.id)).toEqual(["tab2"]);
  });
});

describe("applyBatches", () => {
  it("keeps the newer element and applies deletes", () => {
    const loaded = [stroke("a", 2000), stroke("b", 1000)];
    const out = applyBatches(loaded, [
      { id: "b1", pageId: PAGE, upserts: [{ ...stroke("a", 1500), color: "#old" }, stroke("c", 1)], deletes: [{ id: "b", updatedAt: 1001 }], queuedAt: 1 },
    ]);
    expect(out.map((e) => e.id).sort()).toEqual(["a", "c"]);
    expect(out.find((e) => e.id === "a")?.updatedAt).toBe(2000);
  });
});

describe("undo/redo survive the server (client-stamped tombstones)", () => {
  const T0 = 5_000_000;
  let store: MemoryElementStore;
  let scene: Scene;
  let history: History;
  let autosave: Autosave;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(T0);
    store = new MemoryElementStore();
    scene = new Scene();
    history = new History();
    autosave = new Autosave(scene, store, PAGE, { debounceMs: 1_000_000, maxWaitMs: 1_000_000 });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const ids = async () => (await store.load(PAGE)).map((e) => e.id).sort();

  /** Erase stroke "A" into two pieces, as one history step. */
  function erase() {
    const a = scene.get("A") as StrokeEl;
    scene.remove("A");
    const p1 = stroke("P1", Date.now());
    const p2 = stroke("P2", Date.now());
    scene.add(p1);
    scene.add(p2);
    history.push({ before: [a], after: [p1, p2] });
  }

  it("erase, flush, undo later, flush: the stroke is back and the pieces are gone after reload", async () => {
    scene.add(stroke("A", T0));
    await autosave.flush();
    erase();
    await autosave.flush();
    expect(await ids()).toEqual(["P1", "P2"]);
    vi.setSystemTime(T0 + 3000);
    history.undo(scene);
    await autosave.flush();
    expect(await ids()).toEqual(["A"]);
    await autosave.dispose();
  });

  it("offline: both batches queued, replayed after reconnect, same result", async () => {
    scene.add(stroke("A", T0));
    await autosave.flush();
    let online = false;
    const real = store.save.bind(store);
    vi.spyOn(store, "save").mockImplementation(async (...args) => {
      if (!online) throw new ElementStoreError("Failed to fetch", true);
      return real(...args);
    });
    erase();
    await autosave.flush();
    vi.setSystemTime(T0 + 2000);
    history.undo(scene);
    await autosave.flush();
    expect(await ids()).toEqual(["A"]);
    online = true;
    vi.setSystemTime(T0 + 9000); // the server-side clock is long past the undo
    await autosave.flush();
    expect(await ids()).toEqual(["A"]);
    await autosave.dispose();
  });

  it("draw, undo, redo offline: the stroke is present after reconnect", async () => {
    let online = false;
    const real = store.save.bind(store);
    vi.spyOn(store, "save").mockImplementation(async (...args) => {
      if (!online) throw new ElementStoreError("Failed to fetch", true);
      return real(...args);
    });
    const a = stroke("A", T0);
    scene.add(a);
    history.push({ before: [], after: [a] });
    await autosave.flush();
    history.undo(scene);
    await autosave.flush();
    history.redo(scene);
    await autosave.flush();
    online = true;
    await autosave.flush();
    expect(await ids()).toEqual(["A"]);
    await autosave.dispose();
  });

  it("an older tombstone does not hide a newer upsert from another device", async () => {
    await store.save(PAGE, [stroke("A", T0 + 500)], []);
    await store.save(PAGE, [], [{ id: "A", updatedAt: T0 }]);
    expect(await ids()).toEqual(["A"]);
    await store.save(PAGE, [], [{ id: "A", updatedAt: T0 + 600 }]);
    expect(await ids()).toEqual([]);
    expect(applyBatches([stroke("A", T0 + 500)], [
      { id: "q", pageId: PAGE, upserts: [], deletes: [{ id: "A", updatedAt: T0 }], queuedAt: 1 },
    ]).map((e) => e.id)).toEqual(["A"]);
  });
});
