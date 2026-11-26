"use client";

import { useEffect, useRef, useState } from "react";
import { t } from "@/i18n/en";
import { Dialog } from "@/ui/Dialog";
import type { ImageEl } from "../model/types";
import { validCrop } from "../tools/image-crop";

/** Room kept for the dialog's padding, heading and the viewport margin (CSS). */
const CHROME = "9rem";

export interface ImagePreviewProps {
  image: ImageEl;
  resolveUrl: (assetPath: string) => Promise<string>;
  onClose: () => void;
}

/**
 * In-app lightbox for one photo: the part the page shows (its crop; a toggle shows the whole photo), as large as fits the viewport, at the full
 * resolution of the stored original. Escape, the close button or a backdrop tap close it; focus returns.
 */
export function ImagePreview({ image, resolveUrl, onClose }: ImagePreviewProps) {
  const [loaded, setLoaded] = useState<{ path: string; url: string | null } | null>(null);
  const path = image.assetPath;
  // The latest resolver, without re-fetching when the parent passes a new function.
  const resolveRef = useRef(resolveUrl);
  useEffect(() => {
    resolveRef.current = resolveUrl;
  });
  useEffect(() => {
    let live = true;
    resolveRef.current(path).then(
      (url) => live && setLoaded({ path, url }),
      () => live && setLoaded({ path, url: null }),
    );
    return () => {
      live = false;
    };
  }, [path]);
  const state = loaded?.path === path ? loaded : null;
  const [failed, setFailed] = useState<string | null>(null);

  const [whole, setWhole] = useState(false);
  const cropped = validCrop(image.crop);
  const crop = (!whole && cropped) || { x: 0, y: 0, w: 1, h: 1 };
  // The frame's shape follows what is shown: the card's, or the whole photo's (the card's shape undone by the crop).
  const cardAspect = image.w > 0 && image.h > 0 ? image.w / image.h : 1;
  const aspect = whole && cropped ? cardAspect * (cropped.h / cropped.w) : cardAspect;
  const broken = state?.url === null || failed === state?.url;
  return (
    <Dialog title={t("imagePreviewTitle")} onClose={onClose} wide>
      <div className="flex min-h-0 justify-center">
        <div
          data-testid="image-preview-frame"
          className="relative overflow-hidden rounded-2xl bg-white"
          // A faint checkerboard shows through transparent parts (a removed background).
          style={{
            aspectRatio: `${aspect}`,
            width: `min(100%, calc((100dvh - ${CHROME}) * ${aspect}))`,
            backgroundImage: "repeating-conic-gradient(rgba(27,26,31,0.06) 0 25%, transparent 0 50%)",
            backgroundSize: "20px 20px",
          }}
        >
          {state?.url && !broken ? (
            // eslint-disable-next-line @next/next/no-img-element -- a signed, short-lived storage URL; not for next/image
            <img
              src={state.url}
              alt={t("imagePreviewTitle")}
              draggable={false}
              onError={() => setFailed(state.url)}
              className="absolute max-w-none select-none"
              style={{
                left: `${(-crop.x / crop.w) * 100}%`,
                top: `${(-crop.y / crop.h) * 100}%`,
                width: `${100 / crop.w}%`,
                height: `${100 / crop.h}%`,
              }}
            />
          ) : null}
          {broken ? <p className="absolute inset-0 flex items-center justify-center p-4 text-center text-sm text-ink">{t("imagePreviewUnavailable")}</p> : null}
        </div>
      </div>
      {cropped ? (
        <div className="mt-3 flex justify-center">
          <button
            type="button"
            aria-pressed={whole}
            onClick={() => setWhole((w) => !w)}
            className="inline-flex h-11 min-w-11 cursor-pointer touch-manipulation items-center justify-center rounded-full px-5 text-sm font-medium text-ink underline underline-offset-2"
          >
            {whole ? t("imagePreviewShowCropped") : t("imagePreviewShowWhole")}
          </button>
        </div>
      ) : null}
    </Dialog>
  );
}
