/** `m:ss` (minutes are not capped, so a 60-minute recording reads `60:00`). */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const s = total % 60;
  return `${Math.floor(total / 60)}:${s < 10 ? "0" : ""}${s}`;
}
