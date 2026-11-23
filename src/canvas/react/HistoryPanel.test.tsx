import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { History } from "../model/history";
import { Scene } from "../model/scene";
import type { StrokeEl } from "../model/types";
import type { Editor } from "../editor";
import { MemorySnapshotStore } from "../persistence/memory-snapshot-store";
import { HistoryPanel } from "./HistoryPanel";

const stroke = (id: string): StrokeEl => ({
  id, z: 0, updatedAt: 1000, type: "stroke", tool: "pen", color: "#000", size: 4,
  points: [[0, 0, 0.5]], simulatePressure: true,
});

const fakeEditor = (scene: Scene) => ({ scene, history: new History(), text: { commit: () => {} }, selection: { clear: () => {} } }) as unknown as Editor;

describe("HistoryPanel", () => {
  afterEach(cleanup);

  it("shows the empty state", async () => {
    render(<HistoryPanel store={new MemorySnapshotStore()} pageId="p" editor={fakeEditor(new Scene())} onClose={() => {}} />);
    expect(screen.getByText("Loading history…")).toBeInTheDocument();
    expect(await screen.findByText(/No earlier versions yet/)).toBeInTheDocument();
  });

  it("lists snapshots newest first and restores one", async () => {
    const store = new MemorySnapshotStore();
    await store.create("p", [stroke("a")], 1000);
    await store.create("p", [stroke("a"), stroke("b")], 2000);
    const scene = new Scene([stroke("z")]);
    const onClose = vi.fn();
    render(<HistoryPanel store={store} pageId="p" editor={fakeEditor(scene)} onClose={onClose} />);
    const buttons = await screen.findAllByRole("button", { name: "Restore" });
    expect(buttons).toHaveLength(2);
    expect(screen.getAllByText(/items?$/).map((n) => n.textContent)).toEqual(["2 items", "1 item"]);
    await userEvent.click(buttons[1]);
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(scene.all().map((e) => e.id)).toEqual(["a"]);
  });

  it("commits an open text session before restoring and clears the selection", async () => {
    const store = new MemorySnapshotStore();
    await store.create("p", [stroke("a")], 1000);
    const scene = new Scene([stroke("a")]);
    const clear = vi.fn();
    const editor = {
      scene, history: new History(), selection: { clear },
      text: { commit: () => scene.add({ ...stroke("typed"), id: "typed" }) },
    } as unknown as Editor;
    render(<HistoryPanel store={store} pageId="p" editor={editor} onClose={() => {}} />);
    await userEvent.click(await screen.findByRole("button", { name: "Restore" }));
    await waitFor(() => expect(clear).toHaveBeenCalled());
    const [pre] = await store.list("p");
    expect((await store.load(pre.id)).map((e) => e.id).sort()).toEqual(["a", "typed"]);
    expect(scene.all().map((e) => e.id)).toEqual(["a"]);
  });

  it("shows an error with retry when the list fails", async () => {
    const store = new MemorySnapshotStore();
    vi.spyOn(store, "list").mockRejectedValueOnce(new Error("x"));
    render(<HistoryPanel store={store} pageId="p" editor={fakeEditor(new Scene())} onClose={() => {}} />);
    expect(await screen.findByText("Couldn't load the page history.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText(/No earlier versions yet/)).toBeInTheDocument();
  });
});
