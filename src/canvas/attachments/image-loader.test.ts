import { afterEach, describe, expect, it, vi } from "vitest";
import { createImageLoader, isTaintedImage } from "./image-loader";

const made: { crossOrigin?: string; src: string; setBefore: boolean }[] = [];
let failCors = false;
let failAll = false;

class FakeImage {
  decoding = "";
  width = 10;
  height = 10;
  private _src = "";
  private _co: string | undefined;
  rec = { crossOrigin: undefined as string | undefined, src: "", setBefore: false };
  constructor() {
    made.push(this.rec);
  }
  set crossOrigin(v: string) {
    this._co = v;
    this.rec.crossOrigin = v;
  }
  get crossOrigin() {
    return this._co as string;
  }
  set src(v: string) {
    this._src = v;
    this.rec.src = v;
    this.rec.setBefore = this._co !== undefined;
  }
  get src() {
    return this._src;
  }
  async decode() {
    if (failAll || (failCors && this._co === "anonymous")) throw new Error("decode");
  }
}

afterEach(() => {
  made.length = 0;
  failCors = false;
  failAll = false;
  vi.unstubAllGlobals();
});

describe("createImageLoader", () => {
  it("requests with crossOrigin=anonymous, set before src, and the image is not tainted", async () => {
    vi.stubGlobal("Image", FakeImage);
    const img = await createImageLoader(async () => "https://x/a.jpg")("a");
    expect(made).toHaveLength(1);
    expect(made[0].crossOrigin).toBe("anonymous");
    expect(made[0].setBefore).toBe(true);
    expect(isTaintedImage(img)).toBe(false);
  });

  it("retries once without CORS when that fails, and flags the image as tainted", async () => {
    vi.stubGlobal("Image", FakeImage);
    failCors = true;
    const img = await createImageLoader(async () => "https://x/a.jpg")("a");
    expect(made).toHaveLength(2);
    expect(made[1].crossOrigin).toBeUndefined();
    expect(made[1].src).toBe("https://x/a.jpg");
    expect(isTaintedImage(img)).toBe(true);
  });

  it("rejects when both attempts fail", async () => {
    vi.stubGlobal("Image", FakeImage);
    failAll = true;
    await expect(createImageLoader(async () => "u")("a")).rejects.toThrow();
    expect(made).toHaveLength(2);
  });
});
