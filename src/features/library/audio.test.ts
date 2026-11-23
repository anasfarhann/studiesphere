import { describe, expect, it } from "vitest";
import { pagesWithAudio } from "./audio";

describe("pagesWithAudio", () => {
  it("collects distinct page ids", () => {
    const s = pagesWithAudio([{ page_id: "a" }, { page_id: "a" }, { page_id: "b" }]);
    expect([...s].sort()).toEqual(["a", "b"]);
  });
  it("is empty for no rows", () => expect(pagesWithAudio([]).size).toBe(0));
});
