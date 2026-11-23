import { afterEach, describe, expect, it, vi } from "vitest";
import { pickAudioMime, Recorder, MAX_RECORDING_BYTES, MAX_RECORDING_MS, type RecorderDeps } from "./recorder";

class FakeMediaRecorder {
  static supported = new Set(["audio/mp4", "audio/webm;codecs=opus", "audio/webm"]);
  static last: FakeMediaRecorder | null = null;
  static isTypeSupported(m: string): boolean {
    return FakeMediaRecorder.supported.has(m);
  }
  state: "inactive" | "recording" = "inactive";
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  onerror: (() => void) | null = null;
  stopCalls = 0;
  constructor(
    public stream: MediaStream,
    public opts: { mimeType?: string; audioBitsPerSecond?: number },
  ) {
    FakeMediaRecorder.last = this;
  }
  start(timeslice?: number): void {
    this.state = "recording";
    this.timeslice = timeslice;
  }
  timeslice: number | undefined;
  stop(): void {
    this.stopCalls++;
    this.state = "inactive";
    this.ondataavailable?.({ data: new Blob(["abc"], { type: this.opts.mimeType }) });
    this.onstop?.();
  }
}

function setup(over: Partial<RecorderDeps> = {}) {
  const stopTrack = vi.fn();
  const stream = { getTracks: () => [{ stop: stopTrack }] } as unknown as MediaStream;
  const getUserMedia = vi.fn(async () => stream);
  let t = 1000;
  const deps: RecorderDeps = {
    getUserMedia,
    MediaRecorderCtor: FakeMediaRecorder as unknown as RecorderDeps["MediaRecorderCtor"],
    now: () => t,
    ...over,
  };
  return { deps, getUserMedia, stopTrack, advance: (ms: number) => (t += ms) };
}

afterEach(() => {
  vi.useRealTimers();
  FakeMediaRecorder.supported = new Set(["audio/mp4", "audio/webm;codecs=opus", "audio/webm"]);
});

describe("pickAudioMime", () => {
  it("picks a mime type Safari supports", () => {
    expect(pickAudioMime((m) => m === "audio/mp4")).toBe("audio/mp4");
  });
  it("prefers mp4, then webm opus, then webm", () => {
    expect(pickAudioMime(() => true)).toBe("audio/mp4");
    expect(pickAudioMime((m) => m.startsWith("audio/webm"))).toBe("audio/webm;codecs=opus");
    expect(pickAudioMime((m) => m === "audio/webm")).toBe("audio/webm");
  });
  it("throws recording_unsupported when nothing is supported", () => {
    expect(() => pickAudioMime(() => false)).toThrow("recording_unsupported");
  });
});

describe("Recorder", () => {
  it("records with 64 kbps in 1 s slices and returns blob, duration and mime", async () => {
    const { deps, getUserMedia, stopTrack, advance } = setup();
    const r = new Recorder(deps);
    await r.start();
    expect(getUserMedia).toHaveBeenCalledWith({ audio: true });
    expect(FakeMediaRecorder.last?.opts).toEqual({ mimeType: "audio/mp4", audioBitsPerSecond: 64000 });
    expect(FakeMediaRecorder.last?.timeslice).toBe(1000);
    advance(2500);
    const res = await r.stop();
    expect(res.mime).toBe("audio/mp4");
    expect(res.durationMs).toBe(2500);
    expect(res.blob.size).toBe(3);
    expect(stopTrack).toHaveBeenCalledTimes(1);
  });

  it("throws recording_unsupported before asking for the microphone", async () => {
    FakeMediaRecorder.supported = new Set();
    const { deps, getUserMedia } = setup();
    await expect(new Recorder(deps).start()).rejects.toThrow("recording_unsupported");
    expect(getUserMedia).not.toHaveBeenCalled();
  });

  it("maps a denied microphone to permission_denied", async () => {
    const { deps } = setup({ getUserMedia: async () => { throw new DOMException("no", "NotAllowedError"); } });
    await expect(new Recorder(deps).start()).rejects.toThrow("permission_denied");
  });

  it("auto-stops at 60 minutes and hands over the result", async () => {
    vi.useFakeTimers();
    const { deps, stopTrack, advance } = setup();
    const onAutoStop = vi.fn();
    const r = new Recorder(deps, { onAutoStop });
    await r.start();
    vi.advanceTimersByTime(MAX_RECORDING_MS - 1);
    expect(onAutoStop).not.toHaveBeenCalled();
    advance(MAX_RECORDING_MS);
    vi.advanceTimersByTime(1);
    expect(onAutoStop).toHaveBeenCalledTimes(1);
    expect(onAutoStop.mock.calls[0][1]).toBe("time");
    const res = await (onAutoStop.mock.calls[0][0] as Promise<{ durationMs: number }>);
    expect(res.durationMs).toBe(MAX_RECORDING_MS);
    expect(FakeMediaRecorder.last?.stopCalls).toBe(1);
    expect(stopTrack).toHaveBeenCalled();
  });

  it("auto-stops once the recorded chunks reach 48 MB, keeping every chunk", async () => {
    const { deps, stopTrack } = setup();
    const onAutoStop = vi.fn();
    const r = new Recorder(deps, { onAutoStop });
    await r.start();
    expect(MAX_RECORDING_BYTES).toBe(48 * 1024 * 1024);
    const chunk = (size: number) => {
      const b = new Blob(["x"]);
      Object.defineProperty(b, "size", { value: size });
      return b;
    };
    const rec = FakeMediaRecorder.last!;
    const MB = 1024 * 1024;
    for (let i = 0; i < 47; i++) rec.ondataavailable?.({ data: chunk(MB) });
    expect(onAutoStop).not.toHaveBeenCalled();
    rec.ondataavailable?.({ data: chunk(MB) }); // 48 MB
    expect(onAutoStop).toHaveBeenCalledTimes(1);
    expect(onAutoStop.mock.calls[0][1]).toBe("size");
    expect(rec.stopCalls).toBe(1); // the final chunk from stop() does not stop again
    const res = await (onAutoStop.mock.calls[0][0] as Promise<{ blob: Blob }>);
    expect(res.blob.size).toBeGreaterThan(0);
    expect(stopTrack).toHaveBeenCalled();
    rec.ondataavailable?.({ data: chunk(MB) });
    expect(onAutoStop).toHaveBeenCalledTimes(1);
  });

  it("cancel stops the tracks and yields nothing", async () => {
    vi.useFakeTimers();
    const { deps, stopTrack } = setup();
    const onAutoStop = vi.fn();
    const r = new Recorder(deps, { onAutoStop });
    await r.start();
    r.cancel();
    expect(stopTrack).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(MAX_RECORDING_MS * 2);
    expect(onAutoStop).not.toHaveBeenCalled();
  });

  it("cancel during the permission prompt releases the microphone", async () => {
    let resolve!: (s: MediaStream) => void;
    const stopTrack = vi.fn();
    const stream = { getTracks: () => [{ stop: stopTrack }] } as unknown as MediaStream;
    const { deps } = setup({ getUserMedia: () => new Promise<MediaStream>((r) => (resolve = r)) });
    const r = new Recorder(deps);
    const started = r.start();
    r.cancel();
    resolve(stream);
    await expect(started).rejects.toThrow("cancelled");
    expect(stopTrack).toHaveBeenCalled();
  });
});
