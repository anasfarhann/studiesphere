"use client";

import { useEffect, useRef, useState } from "react";
import { t } from "@/i18n/en";
import type { Editor } from "../editor";
import { CARD_H, FILE_ICON_SIZE, FILE_ICON_X } from "../model/bounds";

export interface FileCardsProps {
  editor: Editor;
  resolveUrl: (assetPath: string) => Promise<string>;
  forgetUrl: (assetPath: string) => void;
}

type Spot = { id: string; assetPath: string; name: string; cx: number; cy: number; size: number };

const MIN_BUTTON = 44;
/** Our own copy of a signed URL is trusted this long (the service keeps them 50 min, they live 60). */
const URL_FRESH_MS = 45 * 60 * 1000;

function sameSpots(a: Spot[], b: Spot[]): boolean {
  return a.length === b.length && a.every((s, i) => {
    const o = b[i];
    return s.id === o.id && s.assetPath === o.assetPath && s.name === o.name && s.cx === o.cx && s.cy === o.cy && s.size === o.size;
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
  const urls = useRef(new Map<string, { url: string; at: number }>());
  const resolveRef = useRef(resolveUrl);
  const forgetRef = useRef(forgetUrl);
  useEffect(() => {
    resolveRef.current = resolveUrl;
    forgetRef.current = forgetUrl;
  });

  const warm = (assetPath: string): Promise<string> =>
    resolveRef.current(assetPath).then((url) => {
      urls.current.set(assetPath, { url, at: Date.now() });
      return url;
    });

  const fresh = (assetPath: string): string | null => {
    const hit = urls.current.get(assetPath);
    return hit && Date.now() - hit.at < URL_FRESH_MS ? hit.url : null;
  };

  useEffect(() => {
    let frame: number | null = null;
    const sync = () => {
      frame = null;
      const z = editor.camera.zoom;
      const next: Spot[] = [];
      for (const el of editor.visibleElements()) {
        if (el.type !== "file") continue;
        const [sx, sy] = editor.camera.worldToScreen(el.x + FILE_ICON_X, el.y + CARD_H / 2);
        next.push({ id: el.id, assetPath: el.assetPath, name: el.fileName, cx: sx, cy: sy, size: Math.max(MIN_BUTTON, FILE_ICON_SIZE * z) });
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
          <button
            type="button"
            data-testid="file-open"
            aria-label={t("fileOpen").replace("{name}", s.name)}
            onClick={() => open(s)}
            className="absolute z-10 touch-manipulation rounded-lg bg-transparent"
            style={{ left: s.cx - s.size / 2, top: s.cy - s.size / 2, width: s.size, height: s.size, touchAction: "manipulation" }}
          />
          {notice === s.id ? (
            <div role="status" className="absolute z-10 rounded bg-white px-2 py-1 text-xs text-gray-900 shadow" style={{ left: s.cx - s.size / 2, top: s.cy + s.size / 2 + 4 }}>
              {t("filePreparing")}
            </div>
          ) : null}
        </div>
      ))}
    </>
  );
}
