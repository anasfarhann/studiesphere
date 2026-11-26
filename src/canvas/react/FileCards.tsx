"use client";

import { useEffect, useRef, useState } from "react";
import { t } from "@/i18n/en";
import type { Editor } from "../editor";
import { overlapsAny } from "../tools/selection-scale";
import { CARD_H, CARD_W, FILE_ICON_SIZE, FILE_ICON_X } from "../model/bounds";

export interface FileCardsProps {
  editor: Editor;
  resolveUrl: (assetPath: string) => Promise<string>;
  forgetUrl: (assetPath: string) => void;
}

type Spot = {
  id: string;
  assetPath: string;
  name: string;
  cx: number;
  cy: number;
  size: number;
  thumbPath?: string;
  /** Screen rect of the first-page preview, which sits just above the card. */
  tx: number;
  ty: number;
  tw: number;
  th: number;
  /** The button overlaps a corner scale handle, so presses there go to the canvas. */
  under: boolean;
};

/** Preview height in world units, shown above the card. */
const THUMB_H = 140;
const THUMB_GAP = 6;

const MIN_BUTTON = 44;
/** The one clock for URL and preview ages here (tests fake it with vi.setSystemTime). */
const nowMs = () => Date.now();
/** Our own copy of a signed URL is trusted this long (the service keeps them 50 min, they live 60). */
const URL_FRESH_MS = 45 * 60 * 1000;
/** A preview that failed is shown as the icon alone, then tried again after this long (on the next redraw). */
const THUMB_RETRY_MS = 60 * 1000;

function sameSpots(a: Spot[], b: Spot[]): boolean {
  return a.length === b.length && a.every((s, i) => {
    const o = b[i];
    return s.id === o.id && s.assetPath === o.assetPath && s.name === o.name && s.cx === o.cx && s.cy === o.cy && s.size === o.size && s.thumbPath === o.thumbPath && s.tx === o.tx && s.ty === o.ty && s.tw === o.tw && s.th === o.th && s.under === o.under;
  });
}

/**
 * Tap targets over the type badge of each file card in view. Signed URLs are prefetched for visible
 * cards so a tap calls window.open synchronously (iOS Safari blocks it after an await). If the URL
 * is not ready yet, a blank tab is opened inside the tap and pointed at the URL once it arrives;
 * if even that is blocked, a "tap again" notice is shown while the URL finishes loading.
 */
export function FileCards({ editor, resolveUrl, forgetUrl }: FileCardsProps) {
  const [spots, setSpots] = useState<Spot[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [thumbUrls, setThumbUrls] = useState<Record<string, { url: string | null; at: number }>>({});
  const thumbState = useRef(new Map<string, { asking: boolean; retried: boolean }>());
  const urls = useRef(new Map<string, { url: string; at: number }>());
  const resolveRef = useRef(resolveUrl);
  const forgetRef = useRef(forgetUrl);
  useEffect(() => {
    resolveRef.current = resolveUrl;
    forgetRef.current = forgetUrl;
  });

  const warm = (assetPath: string): Promise<string> =>
    resolveRef.current(assetPath).then((url) => {
      urls.current.set(assetPath, { url, at: nowMs() });
      return url;
    });

  const fresh = (assetPath: string): string | null => {
    const hit = urls.current.get(assetPath);
    return hit && nowMs() - hit.at < URL_FRESH_MS ? hit.url : null;
  };

  const thumbsRef = useRef(thumbUrls);
  useEffect(() => {
    thumbsRef.current = thumbUrls;
  });

  /** Signs a preview URL unless a fresh one (or a recent failure) is already held; stale ones are re-signed. */
  const loadThumb = (tp: string) => {
    const st = thumbState.current.get(tp) ?? { asking: false, retried: false };
    thumbState.current.set(tp, st);
    const have = thumbsRef.current[tp];
    if (st.asking || (have && nowMs() - have.at < (have.url === null ? THUMB_RETRY_MS : URL_FRESH_MS))) return;
    // An expired failure starts over, with its one image-error retry again.
    if (have?.url === null) st.retried = false;
    st.asking = true;
    resolveRef.current(tp).then(
      (url) => {
        st.asking = false;
        setThumbUrls((m) => ({ ...m, [tp]: { url, at: nowMs() } }));
      },
      () => {
        st.asking = false;
        setThumbUrls((m) => ({ ...m, [tp]: { url: null, at: nowMs() } }));
      },
    );
  };

  /** A preview that fails to load gets one fresh URL, then the icon alone. */
  const thumbFailed = (tp: string) => {
    const st = thumbState.current.get(tp) ?? { asking: false, retried: false };
    thumbState.current.set(tp, st);
    forgetRef.current(tp);
    if (st.retried) {
      setThumbUrls((m) => ({ ...m, [tp]: { url: null, at: nowMs() } }));
      return;
    }
    st.retried = true;
    st.asking = false;
    const without = (m: typeof thumbUrls) => Object.fromEntries(Object.entries(m).filter(([k]) => k !== tp));
    thumbsRef.current = without(thumbsRef.current);
    setThumbUrls(without);
    loadThumb(tp);
  };

  useEffect(() => {
    let frame: number | null = null;
    const sync = () => {
      frame = null;
      const z = editor.camera.zoom;
      const next: Spot[] = [];
      const handles = editor.scaleHandleRects();
      for (const el of editor.visibleElements(THUMB_H + THUMB_GAP)) {
        if (el.type !== "file") continue;
        const [sx, sy] = editor.camera.worldToScreen(el.x + FILE_ICON_X, el.y + CARD_H / 2);
        const [px, py] = editor.camera.worldToScreen(el.x, el.y - THUMB_H - THUMB_GAP);
        next.push({
          id: el.id,
          assetPath: el.assetPath,
          name: el.fileName,
          cx: sx,
          cy: sy,
          size: Math.max(MIN_BUTTON, FILE_ICON_SIZE * z),
          under: overlapsAny(handles, sx, sy, Math.max(MIN_BUTTON, FILE_ICON_SIZE * z)),
          thumbPath: el.thumbPath,
          tx: px,
          ty: py,
          tw: CARD_W * z,
          th: THUMB_H * z,
        });
        if (el.thumbPath) loadThumb(el.thumbPath);
        if (!fresh(el.assetPath)) void warm(el.assetPath).catch(() => {});
      }
      setSpots((prev) => (sameSpots(prev, next) ? prev : next));
    };
    const schedule = () => {
      if (frame === null) frame = window.requestAnimationFrame(sync);
    };
    sync();
    const offSel = editor.onSelectionChange(schedule);
    const offScene = editor.scene.onChange(schedule);
    return () => {
      if (frame !== null) window.cancelAnimationFrame(frame);
      offSel();
      offScene();
    };
  }, [editor]);

  const open = (spot: Spot) => {
    setNotice(null);
    const url = fresh(spot.assetPath);
    if (url) {
      window.open(url, "_blank", "noopener"); // synchronous: still inside the tap
      return;
    }
    // Not ready: claim a tab now (allowed inside the tap), fill it in when the URL arrives.
    const tab = window.open("about:blank", "_blank");
    if (!tab) {
      void warm(spot.assetPath).catch(() => {});
      setNotice(spot.id);
      return;
    }
    try {
      tab.opener = null;
    } catch {
      // Cross-origin hardening is best-effort.
    }
    forgetRef.current(spot.assetPath);
    warm(spot.assetPath).then(
      (u) => {
        tab.location.href = u;
      },
      () => {
        tab.close();
        setNotice(spot.id);
      },
    );
  };

  return (
    <>
      {spots.map((s) => (
        <div key={s.id}>
          {s.thumbPath && thumbUrls[s.thumbPath]?.url ? (
            // eslint-disable-next-line @next/next/no-img-element -- signed storage URL, not optimisable
            <img
              data-testid="file-thumb"
              src={thumbUrls[s.thumbPath]?.url ?? undefined}
              alt={t("filePreview", { name: s.name })}
              draggable={false}
              onError={() => thumbFailed(s.thumbPath as string)}
              className="pointer-events-none absolute z-10 rounded-lg border border-[#cbd5e1] bg-white object-cover object-top"
              style={{ left: s.tx, top: s.ty, width: s.tw, height: s.th }}
            />
          ) : null}
          <button
            type="button"
            data-testid="file-open"
            aria-label={t("fileOpen", { name: s.name })}
            onClick={() => open(s)}
            className={`absolute z-10 touch-manipulation rounded-lg bg-transparent ${s.under ? "pointer-events-none" : ""}`}
            style={{ left: s.cx - s.size / 2, top: s.cy - s.size / 2, width: s.size, height: s.size, touchAction: "manipulation" }}
          />
          {notice === s.id ? (
            <div role="status" className="absolute z-10 rounded-full bg-card px-3 py-1 text-xs text-ink shadow-[0_8px_28px_rgba(27,26,31,0.12)]" style={{ left: s.cx - s.size / 2, top: s.cy + s.size / 2 + 4 }}>
              {t("filePreparing")}
            </div>
          ) : null}
        </div>
      ))}
    </>
  );
}
