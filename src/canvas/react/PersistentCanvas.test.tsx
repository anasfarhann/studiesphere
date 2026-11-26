import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Scene } from "../model/scene";
import type { StrokeEl, TextEl } from "../model/types";
import type { Editor } from "../editor";
import { ElementStoreError, type OfflineQueue } from "../persistence/store";
import { MemoryElementStore, MemoryOfflineQueue } from "../persistence/memory-store";
import { PersistentCanvas } from "./PersistentCanvas";
import { MemoryRecordingOutbox } from "../attachments/recording-outbox";
import type { AttachmentService } from "../attachments/upload";

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
          beginPath: noop, roundRect: noop, stroke: noop, save: noop, restore: noop, clearRect: noop, moveTo: noop, lineTo: noop, arc: noop,
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

  it("shows parked (server-refused) edits after a reload and says some changes couldn't be saved", async () => {
    const store = new MemoryElementStore();
    const real = store.save.bind(store);
    vi.spyOn(store, "save").mockImplementation(async (page, ups, dels) => {
      if (ups.some((e) => e.id === "refused")) throw new ElementStoreError("bad value", false, { permanent: true, code: "22P02" });
      return real(page, ups, dels);
    });
    const queue = new MemoryOfflineQueue("p");
    await queue.park({ id: "pk", pageId: "p", upserts: [stroke("refused", 2000)], deletes: [], queuedAt: 2000 });
    render(<PersistentCanvas pageId="p" store={store} queue={queue} />);
    expect(await screen.findByTestId("canvas")).toBeInTheDocument();
    expect((window as unknown as EditorHook).__editor!.scene.all().map((e) => e.id)).toEqual(["refused"]);
    expect(await screen.findByText("Some changes couldn't be saved")).toBeInTheDocument();
    expect(await queue.parked()).toHaveLength(1);
  });

  it("ignores queued batches that belong to another page", async () => {
    const store = new MemoryElementStore();
    const queue = new MemoryOfflineQueue("p");
    await queue.push({ id: "mine", pageId: "p", upserts: [stroke("mine", 2000)], deletes: [], queuedAt: 2000 });
    await queue.push({ id: "other", pageId: "other-page", upserts: [stroke("foreign", 2000)], deletes: [], queuedAt: 2001 });
    render(<PersistentCanvas pageId="p" store={store} queue={queue} />);
    expect(await screen.findByTestId("canvas")).toBeInTheDocument();
    expect((window as unknown as EditorHook).__editor!.scene.all().map((e) => e.id)).toEqual(["mine"]);
  });

  it("mounts and saves a stroke within 2 s when IndexedDB hangs", async () => {
    const store = new MemoryElementStore();
    await store.save("p", [stroke("server", 1000)], []);
    const never = <T,>() => new Promise<T>(() => {});
    const hanging: OfflineQueue = { push: () => never(), drain: () => never(), remove: () => never(), park: () => never(), parked: () => never(), unpark: () => never() };
    render(<PersistentCanvas pageId="p" store={store} queue={hanging} />);
    expect(await screen.findByTestId("canvas", {}, { timeout: 3000 })).toBeInTheDocument();
    const scene = (window as unknown as EditorHook).__editor!.scene as unknown as Scene;
    expect(scene.all().map((e) => e.id)).toEqual(["server"]);
    const before = Date.now();
    act(() => scene.add(stroke("new", Date.now())));
    await waitFor(async () => expect((await store.load("p")).map((e) => e.id)).toContain("new"), { timeout: 3000 });
    expect(Date.now() - before).toBeLessThanOrEqual(2000);
  });

  it("text still being typed when the page unmounts is saved", async () => {
    const store = new MemoryElementStore();
    const { unmount } = render(<PersistentCanvas pageId="p" store={store} queue={new MemoryOfflineQueue("p")} />);
    await screen.findByTestId("canvas");
    const editor = (window as unknown as { __editor: Editor }).__editor;
    act(() => editor.text.beginAt(10, 10));
    const ta = (await screen.findByTestId("text-editor")) as HTMLTextAreaElement;
    await userEvent.type(ta, "Mitochondria");
    unmount();
    await waitFor(async () => expect((await store.load("p")).map((e) => (e as TextEl).text)).toEqual(["Mitochondria"]));
  });

  it("text being typed is saved when the page is hidden", async () => {
    const store = new MemoryElementStore();
    render(<PersistentCanvas pageId="p" store={store} queue={new MemoryOfflineQueue("p")} />);
    await screen.findByTestId("canvas");
    const editor = (window as unknown as { __editor: Editor }).__editor;
    act(() => editor.text.beginAt(10, 10));
    await userEvent.type(await screen.findByTestId("text-editor"), "Ribosome");
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await waitFor(async () => expect((await store.load("p")).map((e) => (e as TextEl).text)).toEqual(["Ribosome"]));
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

describe("PersistentCanvas recording recovery", () => {
  it("recovers a recording left in the outbox: uploads, adds the card, saves it and says so", async () => {
    const noop = () => {};
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
      () => ({ setTransform: noop, fillRect: noop, fill: noop, fillText: noop, strokeRect: noop, setLineDash: noop, beginPath: noop, roundRect: noop, stroke: noop, save: noop, restore: noop, clearRect: noop, moveTo: noop, lineTo: noop, arc: noop }) as unknown as CanvasRenderingContext2D,
    );
    vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
    vi.stubGlobal("matchMedia", () => ({ addEventListener() {}, removeEventListener() {} }));
    vi.stubGlobal("Path2D", class { moveTo() {} lineTo() {} quadraticCurveTo() {} closePath() {} });
    const store = new MemoryElementStore();
    const outbox = new MemoryRecordingOutbox();
    await outbox.put({ id: "rec-1", blob: new Blob(["x"], { type: "audio/mp4" }), mime: "audio/mp4", durationMs: 9000, x: 10, y: 20, createdAt: 1 });
    const upload = vi.fn(async () => ({ assetPath: "o/p/r.m4a" }));
    const service = { uploadAttachment: upload, signedUrl: async () => "u", forgetSignedUrl: () => {} } as unknown as AttachmentService;
    render(<PersistentCanvas pageId="p" store={store} queue={new MemoryOfflineQueue("p")} outbox={outbox} attachments={{ service, ownerId: "o", pageId: "p" }} />);
    await waitFor(() => expect(screen.getByText("Recovered 1 recording(s)")).toBeTruthy());
    expect((await store.load("p"))[0]).toMatchObject({ id: "rec-1", type: "audio", assetPath: "o/p/r.m4a", durationMs: 9000 });
    expect(await outbox.list()).toHaveLength(0);
    expect(upload).toHaveBeenCalledTimes(1);
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });
});

describe("PersistentCanvas page previews", () => {
  beforeEach(() => {
    const noop = () => {};
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
      () =>
        ({
          setTransform: noop, fillRect: noop, fill: noop, fillText: noop, strokeRect: noop, setLineDash: noop,
          beginPath: noop, roundRect: noop, stroke: noop, save: noop, restore: noop, clearRect: noop, moveTo: noop, lineTo: noop, arc: noop,
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

  const sink = () => ({
    save: vi.fn<(b: Blob, o: { touch: boolean }) => Promise<void>>(async () => {}),
    remove: vi.fn(async () => {}),
    exists: vi.fn(async () => true),
  });
  beforeEach(() => {
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(function (cb: BlobCallback) {
      cb(new Blob(["j"], { type: "image/jpeg" }));
    });
  });

  it("an edited page uploads a preview when the canvas unmounts (leaving within the app)", async () => {
    const store = new MemoryElementStore();
    const preview = sink();
    const { unmount } = render(<PersistentCanvas pageId="p" store={store} queue={new MemoryOfflineQueue("p")} preview={preview} />);
    await screen.findByTestId("canvas");
    const editor = (window as unknown as { __editor: Editor }).__editor;
    act(() => editor.scene.add(stroke("new", 5000)));
    expect(preview.save).not.toHaveBeenCalled();
    unmount();
    await waitFor(() => expect(preview.save).toHaveBeenCalledTimes(1));
    expect(preview.save.mock.calls[0][1]).toEqual({ touch: true });
    expect(preview.save.mock.calls[0][0].type).toBe("image/jpeg");
  });

  it("a page only looked at uploads nothing", async () => {
    const store = new MemoryElementStore();
    await store.save("p", [stroke("s", 1)], []);
    const preview = sink();
    const { unmount } = render(<PersistentCanvas pageId="p" store={store} queue={new MemoryOfflineQueue("p")} preview={preview} />);
    await screen.findByTestId("canvas");
    unmount();
    await new Promise((r) => setTimeout(r, 10));
    expect(preview.save).not.toHaveBeenCalled();
  });

  it("a failing preview upload is silent: the page still saves", async () => {
    const store = new MemoryElementStore();
    const preview = { ...sink(), save: vi.fn(async () => { throw new Error("offline"); }) };
    const { unmount } = render(<PersistentCanvas pageId="p" store={store} queue={new MemoryOfflineQueue("p")} preview={preview} />);
    await screen.findByTestId("canvas");
    const editor = (window as unknown as { __editor: Editor }).__editor;
    act(() => editor.scene.add(stroke("new", 5000)));
    unmount();
    await waitFor(() => expect(preview.save).toHaveBeenCalled());
    await waitFor(async () => expect((await store.load("p")).map((e) => e.id)).toEqual(["new"]));
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
