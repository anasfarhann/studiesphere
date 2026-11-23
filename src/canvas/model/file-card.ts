export type FileKind = "pdf" | "image" | "audio" | "video" | "doc" | "sheet" | "slides" | "other";

const BY_EXT: Record<string, FileKind> = {
  pdf: "pdf",
  doc: "doc", docx: "doc", odt: "doc", rtf: "doc", txt: "doc", md: "doc", pages: "doc",
  xls: "sheet", xlsx: "sheet", ods: "sheet", csv: "sheet", numbers: "sheet",
  ppt: "slides", pptx: "slides", odp: "slides", key: "slides",
};

/** Lowercase `[a-z0-9]{1,10}` extension of a file name, else "bin". */
export function fileExt(name: string): string {
  const i = name.lastIndexOf(".");
  const raw = i >= 0 ? name.slice(i + 1).toLowerCase() : "";
  return /^[a-z0-9]{1,10}$/.test(raw) ? raw : "bin";
}

export function fileKind(mime: string, fileName: string): FileKind {
  const m = mime.toLowerCase();
  if (m === "application/pdf") return "pdf";
  if (m.startsWith("image/")) return "image";
  if (m.startsWith("audio/")) return "audio";
  if (m.startsWith("video/")) return "video";
  if (m.includes("wordprocessingml") || m === "application/msword" || m.startsWith("text/")) {
    if (!m.includes("csv")) return "doc";
  }
  if (m.includes("spreadsheetml") || m === "application/vnd.ms-excel" || m.includes("csv")) return "sheet";
  if (m.includes("presentationml") || m === "application/vnd.ms-powerpoint") return "slides";
  return BY_EXT[fileExt(fileName)] ?? "other";
}

export const FILE_BADGE: Record<FileKind, string> = {
  pdf: "PDF",
  image: "IMG",
  audio: "AUD",
  video: "VID",
  doc: "DOC",
  sheet: "XLS",
  slides: "PPT",
  other: "FILE",
};

/** "812 B", "12 KB", "2.4 MB". */
export function formatBytes(n: number): string {
  if (n < 1024) return `${Math.max(0, Math.round(n))} B`;
  const kb = n / 1024;
  if (kb < 1024) return `${kb < 10 ? kb.toFixed(1) : Math.round(kb)} KB`;
  const mb = kb / 1024;
  return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`;
}

/** Shortens `text` with an ellipsis (keeping the extension visible) until it fits `maxWidth`. */
export function ellipsize(measure: (s: string) => number, text: string, maxWidth: number): string {
  if (measure(text) <= maxWidth) return text;
  const i = text.lastIndexOf(".");
  const tail = i > 0 && text.length - i <= 6 ? text.slice(i) : "";
  const stem = tail ? text.slice(0, i) : text;
  let n = stem.length;
  while (n > 0 && measure(`${stem.slice(0, n)}…${tail}`) > maxWidth) n--;
  return `${stem.slice(0, n)}…${tail}`;
}

/** Stored name: trimmed, at most 200 characters, never empty. */
export function cleanFileName(name: string): string {
  const s = name.trim().slice(0, 200);
  return s || "file";
}
