import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Scene } from "../model/scene";
import type { StrokeEl } from "../model/types";
import type { OfflineQueue } from "../persistence/store";
import { MemoryElementStore, MemoryOfflineQueue } from "../persistence/memory-store";
import { PersistentCanvas } from "./PersistentCanvas";

const stroke = (id: string, updatedAt: number): StrokeEl => ({
  id, z: 0, updatedAt, type: "stroke", tool: "pen", color: "#000", size: 4,
  points: [[0, 0, 0.5]], simulatePressure: true,
});

type EditorHook = { __editor?: { scene: { all(): Array<{ id: string }> } } };

describe("PersistentCanvas", () => {
  beforeEach(() => {
    const noop = () => {};
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
      () =>
        ({
          setTransform: noop, fillRect: noop, fill: noop, fillText: noop, strokeRect: noop, setLineDash: noop,
          beginPath: noop, roundRect: noop, stroke: noop, save: noop, restore: noop, clearRect: noop,
        }) as unknown as CanvasRenderingContext2D,
    );
    vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
    vi.stubGlobal("matchMedia", () => ({ addEventListener() {}, removeEventListener() {} }));
    vi.stubGlobal("Path2D", class { moveTo() {} lineTo() {} quadraticCurveTo() {} closePath() {} });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("shows loading, then the saved elements plus queued offline edits, and 'Saved'", async () => {
    const store = new MemoryElementStore();
    await store.save("p", [stroke("server", 1000)], []);
    const queue = new MemoryOfflineQueue("p");
    await queue.push({ id: "q1", pageId: "p", upserts: [stroke("queued", 2000)], deletes: [], queuedAt: 2000 });
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const load = store.load.bind(store);
    vi.spyOn(store, "load").mockImplementation(async (id) => {
      await gate;
      return load(id);
    });

    render(<PersistentCanvas pageId="p" store={store} queue={queue} />);
    expect(screen.getByText("Loading page…")).toBeInTheDocument();
    expect(screen.queryByTestId("canvas")).toBeNull();
    await act(async () => release());

    expect(await screen.findByTestId("canvas")).toBeInTheDocument();
    const ids = (window as unknown as EditorHook).__editor!.scene.all().map((e) => e.id).sort();
    expect(ids).toEqual(["queued", "server"]);
    // The queued batch is replayed to the store on start.
    expect(await screen.findByText("Saved")).toBeInTheDocument();
    expect((await store.load("p")).map((e) => e.id).sort()).toEqual(["queued", "server"]);
  });

  it("mounts and saves a stroke within 2 s when IndexedDB hangs", async () => {
    const store = new MemoryElementStore();
    await store.save("p", [stroke("server", 1000)], []);
    const never = <T,>() => new Promise<T>(() => {});
    const hanging: OfflineQueue = { push: () => never(), drain: () => never(), remove: () => never() };
    render(<PersistentCanvas pageId="p" store={store} queue={hanging} />);
    expect(await screen.findByTestId("canvas", {}, { timeout: 3000 })).toBeInTheDocument();
    const scene = (window as unknown as EditorHook).__editor!.scene as unknown as Scene;
    expect(scene.all().map((e) => e.id)).toEqual(["server"]);
    const before = Date.now();
    act(() => scene.add(stroke("new", Date.now())));
    await waitFor(async () => expect((await store.load("p")).map((e) => e.id)).toContain("new"), { timeout: 3000 });
    expect(Date.now() - before).toBeLessThanOrEqual(2000);
  });

  it("never shows an empty canvas when loading fails; offers a retry", async () => {
    const store = new MemoryElementStore();
    await store.save("p", [stroke("server", 1000)], []);
    vi.spyOn(store, "load").mockRejectedValueOnce(new TypeError("Failed to fetch"));
    render(<PersistentCanvas pageId="p" store={store} queue={new MemoryOfflineQueue("p")} />);
    expect(await screen.findByText("Couldn't load this page. Check your connection and try again.")).toBeInTheDocument();
    expect(screen.queryByTestId("canvas")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByTestId("canvas")).toBeInTheDocument();
  });
});
