import { describe, expect, it } from "vitest";
import { t } from "./en";

describe("t", () => {
  it("returns the string for a key", () => expect(t("appName")).toBe("Studiesphere"));
});

describe("t interpolation", () => {
  it("fills {placeholders}", () => expect(t("backTo", { name: "Biology" })).toBe("Back to Biology"));
});
