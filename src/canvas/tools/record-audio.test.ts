import { describe, expect, it, vi } from "vitest";
import { AttachmentError } from "../attachments/upload";
import { RecorderError, type RecordingResult } from "../attachments/recorder";
import { History } from "../model/history";
import { Scene } from "../model/scene";
import type { AudioEl } from "../model/types";
import { MemoryRecordingOutbox } from "../attachments/recording-outbox";
import { MemoryElementStore } from "../persistence/memory-store";
import { AudioRecorder, type AudioRecorderContext, type AudioStatus } from "./record-audio";

const result: RecordingResult = { blob: new Blob(["abc"], { type: "audio/mp4" }), durationMs: 4200, mime: "audio/mp4" };

class FakeRecorder {
  started = false;
  cancelled = false;
  constructor(
    public opts: { onAutoStop?: (p: Promise<RecordingResult>) => void },
    private startError?: Error,
    public res: RecordingResult = result,
  ) {}
  async start() {
    if (this.startError) throw this.startError;
    this.started = true;
  }
  async stop() {
    return this.res;
  }
  cancel() {
    this.cancelled = true;
  }
}

function setup(upload: AudioRecorderContext["upload"], startError?: Error, res?: RecordingResult) {
  const scene = new Scene();
  const history = new History();
  const outbox = new MemoryRecordingOutbox();
  const store = new MemoryElementStore();
  let rec!: FakeRecorder;
  const audio = new AudioRecorder({
    scene, history, ownerId: "own", pageId: "pg", center: () => [1000, 500], upload, newId: () => "aud-1", outbox, store,
    createRecorder: (opts) => (rec = new FakeRecorder(opts, startError, res)) as never,
  });
  const statuses: AudioStatus[] = [];
  audio.onStatus((s) => statuses.push(s));
  return { scene, history, audio, statuses, outbox, store, rec: () => rec };
}

describe("AudioRecorder", () => {
  it("uploads on stop and adds one centred card as a single undo step", async () => {
    const upload = vi.fn(async () => ({ assetPath: "own/pg/u.m4a" }));
    const { scene, history, audio, statuses } = setup(upload);
    await audio.start();
    expect(audio.status.kind).toBe("recording");
    await audio.stop();
    expect(upload).toHaveBeenCalledWith(result.blob, { ownerId: "own", pageId: "pg", ext: "m4a" });
    expect(scene.get("aud-1")).toMatchObject({ type: "audio", assetPath: "own/pg/u.m4a", durationMs: 4200, x: 880, y: 468 });
    expect(statuses.map((s) => s.kind)).toEqual(["recording", "uploading", "idle"]);
    history.undo(scene);
    expect(scene.all()).toHaveLength(0);
  });

  it("cancel uploads nothing and adds nothing", async () => {
    const upload = vi.fn();
    const { scene, audio, rec } = setup(upload);
    await audio.start();
    audio.cancel();
    expect(rec().cancelled).toBe(true);
    expect(upload).not.toHaveBeenCalled();
    expect(scene.all()).toHaveLength(0);
    expect(audio.status.kind).toBe("idle");
  });

  it("permission denied shows the settings message", async () => {
    const { audio } = setup(vi.fn(), new RecorderError("permission_denied"));
    await audio.start();
    expect(audio.status).toEqual({ kind: "error", message: "Allow microphone access in Settings to record", retryable: false });
  });

  it("unsupported browsers get their own message", async () => {
    const { audio } = setup(vi.fn(), new RecorderError("recording_unsupported"));
    await audio.start();
    expect(audio.status).toMatchObject({ kind: "error", retryable: false });
  });

  it("a failed upload keeps the recording and retry re-sends the same blob", async () => {
    const upload = vi
      .fn()
      .mockRejectedValueOnce(new AttachmentError("upload_failed", "offline"))
      .mockResolvedValueOnce({ assetPath: "own/pg/u.m4a" });
    const { scene, history, audio } = setup(upload);
    await audio.start();
    await audio.stop();
    expect(scene.all()).toHaveLength(0);
    expect(history.canUndo()).toBe(false);
    expect(audio.status).toMatchObject({ kind: "error", retryable: true });
    await audio.retry();
    expect(upload.mock.calls[1][0]).toBe(upload.mock.calls[0][0]);
    expect((scene.get("aud-1") as AudioEl).assetPath).toBe("own/pg/u.m4a");
  });

  it("a recording over 50 MB is refused with the size message, not uploaded", async () => {
    const big = new Blob(["x"], { type: "audio/mp4" });
    Object.defineProperty(big, "size", { value: 51 * 1024 * 1024 });
    const upload = vi.fn();
    const { scene, audio } = setup(upload, undefined, { blob: big, durationMs: 1, mime: "audio/mp4" });
    await audio.start();
    await audio.stop();
    expect(upload).not.toHaveBeenCalled();
    expect(scene.all()).toHaveLength(0);
    expect(audio.status).toEqual({ kind: "error", message: "This file is larger than 50 MB", retryable: false });
  });

  it("auto-stop uploads, adds the card and leaves a notice", async () => {
    const upload = vi.fn(async () => ({ assetPath: "own/pg/u.m4a" }));
    const { scene, audio, rec } = setup(upload);
    await audio.start();
    rec().opts.onAutoStop?.(Promise.resolve(result));
    await vi.waitFor(() => expect(audio.status.kind).toBe("notice"));
    expect(scene.get("aud-1")).toBeDefined();
    expect(audio.status).toMatchObject({ message: "Recording stopped at 60 minutes and was saved" });
  });

  it("hiding the page stops and saves the recording", async () => {
    const upload = vi.fn(async () => ({ assetPath: "own/pg/u.m4a" }));
    const { scene, audio } = setup(upload);
    await audio.start();
    window.dispatchEvent(new Event("pagehide"));
    await vi.waitFor(() => expect(scene.get("aud-1")).toBeDefined());
  });

  it("pagehide while recording writes the outbox entry before the upload starts", async () => {
    let seenInOutbox = -1;
    const ref: { outbox?: MemoryRecordingOutbox } = {};
    const upload = vi.fn(async () => {
      seenInOutbox = (await ref.outbox!.list()).length;
      return { assetPath: "own/pg/u.m4a" };
    });
    const { audio, outbox } = setup(upload);
    ref.outbox = outbox;
    await audio.start();
    window.dispatchEvent(new Event("pagehide"));
    await vi.waitFor(() => expect(upload).toHaveBeenCalled());
    expect(seenInOutbox).toBe(1);
  });

  it("a saved card clears its outbox entry", async () => {
    const { audio, outbox, store } = setup(vi.fn(async () => ({ assetPath: "a.m4a" })));
    await audio.start();
    await audio.stop();
    await vi.waitFor(async () => expect(await outbox.list()).toHaveLength(0));
    expect(await store.load("pg")).toHaveLength(1);
  });

  it("unmount while recording hands the recording off and saves the card via the store", async () => {
    const { scene, audio, outbox, store, rec } = setup(vi.fn(async () => ({ assetPath: "own/pg/u.m4a" })));
    await audio.start();
    audio.dispose();
    expect(rec().cancelled).toBe(false);
    await vi.waitFor(async () => expect(await store.load("pg")).toHaveLength(1));
    expect(scene.all()).toHaveLength(0); // the canvas is gone; the store has it
    expect((await store.load("pg"))[0]).toMatchObject({ type: "audio", assetPath: "own/pg/u.m4a", durationMs: 4200 });
    await vi.waitFor(async () => expect(await outbox.list()).toHaveLength(0));
  });

  it("unmount while uploading still saves the card via the store", async () => {
    let finish!: (v: { assetPath: string }) => void;
    const upload = vi.fn(() => new Promise<{ assetPath: string }>((r) => (finish = r)));
    const { audio, outbox, store } = setup(upload);
    await audio.start();
    const stopping = audio.stop();
    await vi.waitFor(() => expect(upload).toHaveBeenCalled());
    audio.dispose();
    finish({ assetPath: "own/pg/u.m4a" });
    await stopping;
    expect(await store.load("pg")).toHaveLength(1);
    await vi.waitFor(async () => expect(await outbox.list()).toHaveLength(0));
  });

  it("unmount after a failed upload leaves the recording in the outbox", async () => {
    const { audio, outbox, store, scene } = setup(vi.fn().mockRejectedValue(new AttachmentError("upload_failed", "offline")));
    await audio.start();
    await audio.stop();
    audio.dispose();
    expect(await outbox.list()).toHaveLength(1);
    expect(await store.load("pg")).toHaveLength(0);
    expect(scene.all()).toHaveLength(0);
  });

  it("Cancel saves nothing and leaves the outbox empty", async () => {
    const upload = vi.fn();
    const { audio, outbox, store } = setup(upload);
    await audio.start();
    audio.cancel();
    expect(upload).not.toHaveBeenCalled();
    expect(await outbox.list()).toHaveLength(0);
    expect(await store.load("pg")).toHaveLength(0);
  });
});
