import { describe, expect, it } from "vitest";
import { cleanFileName, ellipsize, fileExt, fileKind, formatBytes } from "./file-card";

describe("file card helpers", () => {
  it("sanitises extensions", () => {
    expect(fileExt("Report.PDF")).toBe("pdf");
    expect(fileExt("noext")).toBe("bin");
    expect(fileExt("a.tar.gz")).toBe("gz");
    expect(fileExt("a.verylongextension")).toBe("bin");
    expect(fileExt("a.p d")).toBe("bin");
  });
  it("picks a kind by mime then extension", () => {
    expect(fileKind("application/pdf", "x")).toBe("pdf");
    expect(fileKind("image/png", "x")).toBe("image");
    expect(fileKind("audio/mpeg", "x")).toBe("audio");
    expect(fileKind("video/mp4", "x")).toBe("video");
    expect(fileKind("application/vnd.openxmlformats-officedocument.wordprocessingml.document", "x")).toBe("doc");
    expect(fileKind("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "x")).toBe("sheet");
    expect(fileKind("application/vnd.openxmlformats-officedocument.presentationml.presentation", "x")).toBe("slides");
    expect(fileKind("", "deck.pptx")).toBe("slides");
    expect(fileKind("application/zip", "a.zip")).toBe("other");
  });
  it("formats sizes", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(12 * 1024)).toBe("12 KB");
    expect(formatBytes(2.4 * 1024 * 1024)).toBe("2.4 MB");
  });
  it("ellipsises to fit and keeps the extension", () => {
    const m = (s: string) => s.length * 10;
    expect(ellipsize(m, "short.pdf", 200)).toBe("short.pdf");
    const out = ellipsize(m, "a-very-long-file-name.pdf", 100);
    expect(out.endsWith("….pdf")).toBe(true);
    expect(m(out)).toBeLessThanOrEqual(100);
  });
  it("trims and caps names", () => {
    expect(cleanFileName("  a.pdf ")).toBe("a.pdf");
    expect(cleanFileName("x".repeat(300))).toHaveLength(200);
  });
});
