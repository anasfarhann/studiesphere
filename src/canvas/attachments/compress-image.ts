/** Scales photos down before upload: JPEG 0.8 up to 2048 px, or PNG when the PNG really has transparency. */

export interface Decoded {
  width: number;
  height: number;
  source?: CanvasImageSource;
  release(): void;
}

export interface Surface {
  width: number;
  height: number;
  /** True when any sampled pixel is not fully opaque. */
  hasAlpha(): boolean;
  toBlob(type: string, quality: number): Promise<Blob>;
}

/** Browser seams (decoding and canvas) so the sizing and format rules can be tested without a canvas. */
export interface ImageIO {
  decode(file: Blob): Promise<Decoded>;
  render(decoded: Decoded, width: number, height: number): Surface;
}

export interface CompressedImage {
  blob: Blob;
  width: number;
  height: number;
}

export function fitWithin(width: number, height: number, maxDim: number): { width: number; height: number } {
  const scale = Math.min(1, maxDim / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

const ALPHA_SAMPLE = 64;

function loadImgElement(file: Blob): Promise<Decoded> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () =>
      resolve({
        width: img.naturalWidth,
        height: img.naturalHeight,
        source: img,
        release: () => URL.revokeObjectURL(url),
      });
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("image decode failed"));
    };
    img.src = url;
  });
}

async function decodeBrowser(file: Blob): Promise<Decoded> {
  if (typeof createImageBitmap === "function") {
    try {
      // Bakes EXIF rotation in where supported (older engines throw on the option and fall through).
      const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
      return { width: bmp.width, height: bmp.height, source: bmp, release: () => bmp.close() };
    } catch {
      // Fall back to <img>, which applies orientation by itself in current Safari/Chrome.
    }
  }
  return loadImgElement(file);
}

function renderBrowser(decoded: Decoded, width: number, height: number): Surface {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx || !decoded.source) throw new Error("2D canvas context unavailable");
  ctx.drawImage(decoded.source, 0, 0, width, height);
  return {
    width,
    height,
    hasAlpha() {
      // A tiny downscale is enough: transparent regions that matter survive averaging as alpha < 255.
      const probe = document.createElement("canvas");
      probe.width = ALPHA_SAMPLE;
      probe.height = ALPHA_SAMPLE;
      const pctx = probe.getContext("2d", { willReadFrequently: true });
      if (!pctx) return false;
      pctx.drawImage(canvas, 0, 0, ALPHA_SAMPLE, ALPHA_SAMPLE);
      const data = pctx.getImageData(0, 0, ALPHA_SAMPLE, ALPHA_SAMPLE).data;
      for (let i = 3; i < data.length; i += 4) if (data[i] < 255) return true;
      return false;
    },
    toBlob: (type, quality) =>
      new Promise((resolve, reject) =>
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("encode failed"))), type, quality),
      ),
  };
}

export const browserImageIO: ImageIO = { decode: decodeBrowser, render: renderBrowser };

/** Like compressImage, but also reports the output size (callers need it for the card's aspect ratio). */
export async function compressImageWithSize(
  file: Blob,
  maxDim = 2048,
  quality = 0.8,
  io: ImageIO = browserImageIO,
): Promise<CompressedImage> {
  const decoded = await io.decode(file);
  try {
    const { width, height } = fitWithin(decoded.width, decoded.height, maxDim);
    const surface = io.render(decoded, width, height);
    const keepPng = file.type === "image/png" && surface.hasAlpha();
    const blob = await surface.toBlob(keepPng ? "image/png" : "image/jpeg", quality);
    return { blob, width, height };
  } finally {
    decoded.release();
  }
}

export async function compressImage(file: File, maxDim = 2048, quality = 0.8, io: ImageIO = browserImageIO): Promise<Blob> {
  return (await compressImageWithSize(file, maxDim, quality, io)).blob;
}
