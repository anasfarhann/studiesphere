import { MAX_ATTACHMENT_BYTES } from "./upload";

/** Longest recording; at 64 kbps that is about 29 MB, under the 50 MB attachment limit. */
export const MAX_RECORDING_MS = 60 * 60 * 1000;
/** Keeps a 60-minute AAC/Opus recording near 29 MB (Safari's default can reach 60 MB). */
export const AUDIO_BITS_PER_SECOND = 64_000;
/**
 * A recording stops itself at this size (2 MB under the attachment limit, headroom for the last
 * chunk and the container), so it can always be uploaded. Only reached when a browser ignores the
 * requested bitrate.
 */
export const MAX_RECORDING_BYTES = MAX_ATTACHMENT_BYTES - 2 * 1024 * 1024;
/** The recorder hands over a chunk every second, so a long recording is never one giant buffer. */
const TIMESLICE_MS = 1000;

export type RecorderErrorCode = "recording_unsupported" | "permission_denied" | "recording_failed" | "cancelled";

export class RecorderError extends Error {
  constructor(readonly code: RecorderErrorCode) {
    super(code);
    this.name = "RecorderError";
  }
}

export interface RecordingResult {
  blob: Blob;
  durationMs: number;
  mime: string;
}

/** Safari (iPad) only does mp4/AAC, so it goes first; Chrome and Edge take webm/opus. */
const MIME_ORDER = ["audio/mp4", "audio/webm;codecs=opus", "audio/webm"] as const;

export function pickAudioMime(isSupported: (m: string) => boolean): string {
  for (const m of MIME_ORDER) if (isSupported(m)) return m;
  throw new RecorderError("recording_unsupported");
}

/** File extension for a recording's mime type. */
export function audioExt(mime: string): string {
  return mime.startsWith("audio/mp4") ? "m4a" : "webm";
}

interface MediaRecorderLike {
  state: string;
  ondataavailable: ((e: { data: Blob }) => void) | null;
  onstop: (() => void) | null;
  onerror: (() => void) | null;
  start(timeslice?: number): void;
  stop(): void;
}

export interface RecorderDeps {
  getUserMedia: (c: MediaStreamConstraints) => Promise<MediaStream>;
  MediaRecorderCtor: {
    new (stream: MediaStream, opts: { mimeType?: string; audioBitsPerSecond?: number }): MediaRecorderLike;
    isTypeSupported(m: string): boolean;
  };
  /** Monotonic milliseconds. */
  now: () => number;
}

/** Why a recording ended on its own: the 60-minute limit or the size limit. */
export type AutoStopReason = "time" | "size";

export interface RecorderOptions {
  /** Called with the pending result when the time or size limit stops the recording. */
  onAutoStop?: (result: Promise<RecordingResult>, reason: AutoStopReason) => void;
}

function browserDeps(): RecorderDeps {
  if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) throw new RecorderError("recording_unsupported");
  return {
    getUserMedia: (c) => navigator.mediaDevices.getUserMedia(c),
    MediaRecorderCtor: MediaRecorder as unknown as RecorderDeps["MediaRecorderCtor"],
    now: () => performance.now(),
  };
}

export class Recorder {
  private chunks: Blob[] = [];
  private bytes = 0;
  /** Set as soon as stop() runs (before its promise exists): the final chunk must not re-stop. */
  private stopRequested = false;
  private stream: MediaStream | null = null;
  private rec: MediaRecorderLike | null = null;
  private mime = "";
  private t0 = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private stopping: Promise<RecordingResult> | null = null;
  private cancelled = false;
  private deps: RecorderDeps | null;

  constructor(
    deps?: RecorderDeps,
    private opts: RecorderOptions = {},
  ) {
    this.deps = deps ?? null;
  }

  /**
   * Call straight from the Record tap: the microphone request is made before the first `await`,
   * which keeps it inside the user gesture (iPad Safari refuses it otherwise).
   */
  async start(): Promise<void> {
    const deps = (this.deps ??= browserDeps());
    this.mime = pickAudioMime((m) => deps.MediaRecorderCtor.isTypeSupported(m));
    let stream: MediaStream;
    try {
      stream = await deps.getUserMedia({ audio: true });
    } catch (e) {
      const name = e instanceof DOMException || e instanceof Error ? e.name : "";
      throw new RecorderError(name === "NotAllowedError" || name === "SecurityError" ? "permission_denied" : "recording_failed");
    }
    if (this.cancelled) {
      for (const tr of stream.getTracks()) tr.stop();
      throw new RecorderError("cancelled");
    }
    this.stream = stream;
    try {
      const rec = new deps.MediaRecorderCtor(stream, { mimeType: this.mime, audioBitsPerSecond: AUDIO_BITS_PER_SECOND });
      rec.ondataavailable = (e) => {
        if (e.data.size <= 0) return;
        this.chunks.push(e.data);
        this.bytes += e.data.size;
        if (this.bytes >= MAX_RECORDING_BYTES) this.autoStop("size");
      };
      this.rec = rec;
      this.t0 = deps.now();
      rec.start(TIMESLICE_MS);
    } catch {
      this.release();
      throw new RecorderError("recording_failed");
    }
    this.timer = setTimeout(() => {
      this.timer = null;
      this.autoStop("time");
    }, MAX_RECORDING_MS);
  }

  /** Stops once, whichever limit is hit first; the result goes to onAutoStop. */
  private autoStop(reason: AutoStopReason): void {
    if (this.stopRequested || this.cancelled) return;
    this.opts.onAutoStop?.(this.stop(), reason);
  }

  stop(): Promise<RecordingResult> {
    if (this.stopping) return this.stopping;
    const rec = this.rec;
    const deps = this.deps;
    if (!rec || !deps) return Promise.reject(new RecorderError("recording_failed"));
    this.stopRequested = true;
    this.clearTimer();
    const durationMs = Math.round(deps.now() - this.t0);
    this.stopping = new Promise<RecordingResult>((resolve, reject) => {
      const finish = () => {
        this.release();
        if (this.chunks.length === 0) return reject(new RecorderError("recording_failed"));
        const blob = new Blob(this.chunks, { type: this.mime });
        this.chunks = [];
        this.bytes = 0;
        resolve({ blob, durationMs, mime: this.mime });
      };
      rec.onstop = finish;
      rec.onerror = () => {
        // The browser ended the recording itself; keep whatever was captured.
        if (rec.state === "inactive") finish();
      };
      if (rec.state === "inactive") finish();
      else {
        try {
          rec.stop();
        } catch {
          finish();
        }
      }
    });
    return this.stopping;
  }

  /** Throws the recording away and releases the microphone. */
  cancel(): void {
    this.cancelled = true;
    this.clearTimer();
    const rec = this.rec;
    if (rec) {
      rec.ondataavailable = null;
      rec.onstop = null;
      rec.onerror = null;
      try {
        if (rec.state !== "inactive") rec.stop();
      } catch {
        // Already stopped.
      }
    }
    this.chunks = [];
    this.bytes = 0;
    this.release();
  }

  private clearTimer(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }

  private release(): void {
    if (this.stream) for (const tr of this.stream.getTracks()) tr.stop();
    this.stream = null;
    this.rec = null;
  }
}
