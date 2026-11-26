import { describe, expect, it } from "vitest";
import { en, t } from "./en";

describe("t", () => {
  it("returns the string for a key", () => expect(t("appName")).toBe("Studiesphere"));
});

describe("t interpolation", () => {
  it("fills {placeholders}", () => expect(t("backTo", { name: "Biology" })).toBe("Back to Biology"));
});

describe("folder wording", () => {
  it("no UI string mentions notebooks or subjects", () => {
    for (const [key, value] of Object.entries(en)) {
      expect(value, key).not.toMatch(/notebook|subject/i);
    }
  });
  it("has the folder strings", () => {
    expect(t("dashYourFolders")).toBe("Your folders");
    expect(t("newFolder")).toBe("New folder");
  });
});
