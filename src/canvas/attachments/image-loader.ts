import type { ImageLoader } from "../view/renderer";

/** Loads photos through signed URLs into <img> elements (decoded off-thread, works on every Safari). */
export function createImageLoader(signedUrl: (assetPath: string) => Promise<string>): ImageLoader {
  return async (assetPath) => {
    const url = await signedUrl(assetPath);
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    await img.decode();
    return img;
  };
}
