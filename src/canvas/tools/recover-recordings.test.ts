import { describe, expect, it, vi } from "vitest";
import { MemoryRecordingOutbox, type OutboxEntry } from "../attachments/recording-outbox";
import { Scene } from "../model/scene";
import { MemoryElementStore } from "../persistence/memory-store";
import { recoverRecordings } from "./recover-recordings";

const entry = (id: string, assetPath?: string): OutboxEntry => ({ id, blob: new Blob(["x"]), mime: "audio/webm", durationMs: 5, x: 1, y: 2, createdAt: 1, assetPath });

function setup(upload = vi.fn(async () => ({ assetPath: "new.webm" }))) {
  const outbox = new MemoryRecordingOutbox();
  const store = new MemoryElementStore();
  const scene = new Scene();
  const run = () => recoverRecordings({ outbox, store, scene, ownerId: "o", pageId: "p", upload });
  return { outbox, store, scene, upload, run };
}

describe("recoverRecordings", () => {
  it("skips the upload when an assetPath was already recorded", async () => {
    const { outbox, store, scene, upload, run } = setup();
    await outbox.put(entry("a", "have.webm"));
    expect(await run()).toBe(1);
    expect(upload).not.toHaveBeenCalled();
    expect(scene.get("a")).toMatchObject({ assetPath: "have.webm" });
    expect(await store.load("p")).toHaveLength(1);
    expect(await outbox.list()).toHaveLength(0);
  });

  it("keeps an entry whose upload still fails", async () => {
    const { outbox, scene, run } = setup(vi.fn().mockRejectedValue(new Error("offline")));
    await outbox.put(entry("a"));
    expect(await run()).toBe(0);
    expect(await outbox.list()).toHaveLength(1);
    expect(scene.all()).toHaveLength(0);
  });

  it("only cleans up an entry whose card is already in the scene", async () => {
    const { outbox, scene, upload, run } = setup();
    scene.add({ id: "a", z: 0, updatedAt: 1, type: "audio", x: 0, y: 0, assetPath: "p", durationMs: 1 });
    await outbox.put(entry("a"));
    expect(await run()).toBe(0);
    expect(upload).not.toHaveBeenCalled();
    expect(await outbox.list()).toHaveLength(0);
  });

  it("never uploads an entry over the attachment limit; keeps it and hands it to onOversize", async () => {
    const { outbox, store, scene, upload } = setup();
    const big = entry("big");
    Object.defineProperty(big.blob, "size", { value: 51 * 1024 * 1024 });
    await outbox.put(big);
    await outbox.put(entry("small"));
    const onOversize = vi.fn();
    const n = await recoverRecordings({ outbox, store, scene, ownerId: "o", pageId: "p", upload, onOversize });
    expect(n).toBe(1);
    expect(upload).toHaveBeenCalledTimes(1);
    expect((upload.mock.calls[0] as unknown[])[0]).not.toBe(big.blob);
    expect(onOversize).toHaveBeenCalledWith([big]);
    expect((await outbox.list()).map((e) => e.id)).toEqual(["big"]);
    expect(scene.get("big")).toBeUndefined();
  });
});
