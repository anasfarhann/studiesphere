"use client";

import { useEffect, useRef, useState } from "react";
import { t } from "@/i18n/en";
import type { Editor } from "../editor";
import { AUDIO_ICON_X, CARD_H } from "../model/bounds";

export interface AudioCardsProps {
  editor: Editor;
  resolveUrl: (assetPath: string) => Promise<string>;
  forgetUrl: (assetPath: string) => void;
}

type Spot = { id: string; assetPath: string; cx: number; cy: number; size: number };

/** Buttons are never smaller than this, however far the page is zoomed out. */
const MIN_BUTTON = 44;

function sameSpots(a: Spot[], b: Spot[]): boolean {
  return a.length === b.length && a.every((s, i) => {
    const o = b[i];
    return s.id === o.id && s.assetPath === o.assetPath && s.cx === o.cx && s.cy === o.cy && s.size === o.size;
  });
}

/**
 * Play/pause buttons laid over the audio cards the renderer draws. Only cards in view get a
 * button (positions follow the editor's coalesced pan/zoom/scene events), and one shared <audio>
 * element means only one card can play at a time.
 */
export function AudioCards({ editor, resolveUrl, forgetUrl }: AudioCardsProps) {
  const [spots, setSpots] = useState<Spot[]>([]);
  const [playing, setPlaying] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const urls = useRef(new Map<string, string>());
  const playingRef = useRef<string | null>(null);
  const visible = useRef(new Set<string>());
  // Callers pass fresh closures every render; the effect must not restart (and stop playback) for them.
  const resolveRef = useRef(resolveUrl);
  const forgetRef = useRef(forgetUrl);
  useEffect(() => {
    resolveRef.current = resolveUrl;
    forgetRef.current = forgetUrl;
  });

  const setPlayingId = (id: string | null) => {
    playingRef.current = id;
    setPlaying(id);
  };

  const stopPlayback = () => {
    const a = audioRef.current;
    if (a) {
      a.pause();
      a.removeAttribute("src");
      a.load();
    }
    setPlayingId(null);
  };

  useEffect(() => {
    let frame: number | null = null;
    const sync = () => {
      frame = null;
      const z = editor.camera.zoom;
      const next: Spot[] = [];
      for (const el of editor.visibleElements()) {
        if (el.type !== "audio") continue;
        const [sx, sy] = editor.camera.worldToScreen(el.x + AUDIO_ICON_X, el.y + CARD_H / 2);
        next.push({ id: el.id, assetPath: el.assetPath, cx: sx, cy: sy, size: Math.max(MIN_BUTTON, 40 * z) });
        // Warm the signed URL so a tap can start playback synchronously (iPad Safari needs that).
        if (!urls.current.has(el.assetPath)) {
          void resolveRef.current(el.assetPath).then(
            (u) => urls.current.set(el.assetPath, u),
            () => {},
          );
        }
      }
      visible.current = new Set(next.map((s) => s.id));
      setSpots((prev) => (sameSpots(prev, next) ? prev : next));
      const cur = playingRef.current;
      if (cur && !visible.current.has(cur)) stopPlayback();
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
      stopPlayback();
    };
    // stopPlayback only touches refs and a setState that is harmless after unmount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor]);

  const toggle = (spot: Spot) => {
    const a = audioRef.current;
    if (!a) return;
    setFailed(null);
    if (playingRef.current === spot.id) {
      a.pause();
      setPlayingId(null);
      return;
    }
    const start = (url: string) => {
      a.src = url;
      setPlayingId(spot.id);
      a.play().catch(() => {
        // Expired URL or blocked playback: drop the cached link so the next tap asks again.
        urls.current.delete(spot.assetPath);
        forgetRef.current(spot.assetPath);
        if (playingRef.current === spot.id) setPlayingId(null);
        setFailed(spot.id);
      });
    };
    const cached = urls.current.get(spot.assetPath);
    if (cached) {
      start(cached); // synchronous: still inside the tap
      return;
    }
    setPlayingId(spot.id);
    resolveRef.current(spot.assetPath).then(
      (url) => {
        urls.current.set(spot.assetPath, url);
        if (playingRef.current === spot.id) start(url);
      },
      () => {
        if (playingRef.current === spot.id) setPlayingId(null);
        setFailed(spot.id);
      },
    );
  };

  return (
    <>
      <audio ref={audioRef} preload="none" onEnded={() => setPlayingId(null)} />
      {spots.map((s) => {
        const on = playing === s.id;
        return (
          <div key={s.id}>
            <button
              type="button"
              data-testid="audio-play"
              aria-label={on ? t("audioPause") : t("audioPlay")}
              aria-pressed={on}
              onClick={() => toggle(s)}
              className="absolute z-10 flex items-center justify-center rounded-full bg-slate-800 text-white"
              style={{ left: s.cx - s.size / 2, top: s.cy - s.size / 2, width: s.size, height: s.size, touchAction: "manipulation" }}
            >
              <svg width="40%" height="40%" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                {on ? <path d="M6 5h4v14H6zM14 5h4v14h-4z" /> : <path d="M7 4l14 8-14 8z" />}
              </svg>
            </button>
            {failed === s.id ? (
              <div role="status" className="absolute z-10 rounded bg-white px-2 py-1 text-xs shadow" style={{ left: s.cx - s.size / 2, top: s.cy + s.size / 2 + 4 }}>
                {t("audioPlayFailed")}
              </div>
            ) : null}
          </div>
        );
      })}
    </>
  );
}

