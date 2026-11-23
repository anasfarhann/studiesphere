import { describe, expect, it, vi } from "vitest";
import { AttachmentError } from "../attachments/upload";
import { RecorderError, type RecordingResult } from "../attachments/recorder";
import { History } from "../model/history";
import { Scene } from "../model/scene";
import type { AudioEl } from "../model/types";
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
  let rec!: FakeRecorder;
  const audio = new AudioRecorder({
    scene, history, ownerId: "own", pageId: "pg", center: () => [1000, 500], upload, newId: () => "aud-1",
    createRecorder: (opts) => (rec = new FakeRecorder(opts, startError, res)) as never,
  });
  const statuses: AudioStatus[] = [];
  audio.onStatus((s) => statuses.push(s));
  return { scene, history, audio, statuses, rec: () => rec };
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

  it("dispose while recording cancels and adds nothing", async () => {
    const { scene, audio, rec } = setup(vi.fn());
    await audio.start();
    audio.dispose();
    expect(rec().cancelled).toBe(true);
    expect(scene.all()).toHaveLength(0);
  });
});
