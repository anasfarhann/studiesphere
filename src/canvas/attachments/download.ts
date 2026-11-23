/** How long the object URL stays valid: Safari's share sheet / Files picker reads it lazily. */
const REVOKE_AFTER_MS = 5 * 60 * 1000;

/**
 * Saves a blob as a file on the device via `<a download>` and an object URL. Chrome and Edge save
 * to Downloads; iPad Safari shows the download/share sheet (Save to Files).
 */
export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.rel = "noopener";
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), REVOKE_AFTER_MS);
}

/** "recording-2026-11-23-1405.m4a" style name for a recording made at `createdAt`. */
export function recordingFileName(base: string, createdAt: number, ext: string): string {
  const d = new Date(createdAt);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${base}-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}.${ext}`;
}
