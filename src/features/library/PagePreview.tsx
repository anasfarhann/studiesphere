"use client";

import { useState, type ReactNode } from "react";

/**
 * A page card's picture: the page's real preview when it has one, else (and when it fails to load, e.g. an
 * expired URL) the given placeholder. Decorative: the card's title names the page.
 */
export function PagePreview({ src, fallback }: { src?: string | null; fallback: ReactNode }) {
  const [failed, setFailed] = useState<string | null>(null);
  if (!src || failed === src) return <>{fallback}</>;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- signed storage URL, not optimisable
    <img
      src={src}
      alt=""
      loading="lazy"
      decoding="async"
      draggable={false}
      onError={() => setFailed(src)}
      className="absolute inset-0 size-full rounded-[inherit] object-cover object-left-top"
    />
  );
}
