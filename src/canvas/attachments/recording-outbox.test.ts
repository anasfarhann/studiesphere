import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { IdbRecordingOutbox, type OutboxEntry } from "./recording-outbox";

const entry = (id: string, createdAt: number): OutboxEntry => ({ id, blob: new Blob(["abc"], { type: "audio/mp4" }), mime: "audio/mp4", durationMs: 1, x: 0, y: 0, createdAt });

describe("IdbRecordingOutbox", () => {
  it("keeps entries across instances until removed, per page", async () => {
    await new IdbRecordingOutbox("p1").put(entry("a", 1));
    await new IdbRecordingOutbox("p1").put({ ...entry("b", 2), assetPath: "x" });
    await new IdbRecordingOutbox("p2").put(entry("c", 3));
    const list = await new IdbRecordingOutbox("p1").list();
    expect(list.map((e) => e.id)).toEqual(["a", "b"]);
    expect(list[1].assetPath).toBe("x");
    await new IdbRecordingOutbox("p1").remove("a");
    expect((await new IdbRecordingOutbox("p1").list()).map((e) => e.id)).toEqual(["b"]);
    expect(await new IdbRecordingOutbox("p2").list()).toHaveLength(1);
  });
});
