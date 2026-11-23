import { describe, expect, it } from "vitest";
import { t } from "./en";

describe("t", () => {
  it("returns the string for a key", () => expect(t("appName")).toBe("Studiesphere"));
});
