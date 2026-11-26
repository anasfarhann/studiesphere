import type { ImageLoader } from "../view/renderer";

/**
 * Photos that could only be loaded without CORS: they draw fine on the live canvas, but reading the canvas back
 * (toBlob, toDataURL, getImageData) would throw a SecurityError. Exports (page previews, PDFs) must not draw them.
 */
const tainted = new WeakSet<object>();
/** Flags an image as tainted (for loaders other than createImageLoader, and tests). */
export const markTaintedImage = (img: object): void => void tainted.add(img);
export const isTaintedImage = (img: unknown): boolean => typeof img === "object" && img !== null && tainted.has(img);

async function decoded(url: string, crossOrigin: boolean): Promise<HTMLImageElement> {
  const img = new Image();
  img.decoding = "async";
  if (crossOrigin) img.crossOrigin = "anonymous";
  img.src = url;
  await img.decode();
  return img;
}

/**
 * Loads photos through signed URLs into <img> elements (decoded off-thread, works on every Safari). The request is
 * CORS-enabled so the canvas stays readable; if that fails (the storage host sends no CORS headers) it is retried
 * once without, so the photo still shows, and the image is flagged as tainted (see isTaintedImage).
 */
export function createImageLoader(signedUrl: (assetPath: string) => Promise<string>): ImageLoader {
  return async (assetPath) => {
    const url = await signedUrl(assetPath);
    try {
      return await decoded(url, true);
    } catch {
      const img = await decoded(url, false);
      tainted.add(img);
      return img;
    }
  };
}
