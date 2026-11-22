import { describe, expect, it } from "vitest";
import { redirect } from "next/navigation";
import { toFormError } from "./form-error";
import { MemoryLibraryRepo } from "./memory-repo";
import { ValidationError } from "./repo";

describe("toFormError", () => {
  it("maps validation errors to nameRequired", () => {
    expect(toFormError(new ValidationError("x"))).toEqual({ error: "Name is required" });
  });
  it("maps a repo blank-name failure to nameRequired", async () => {
    const err = await new MemoryLibraryRepo().createSubject({ name: "  ", color: "#000" }).catch((e) => e);
    expect(toFormError(err)).toEqual({ error: "Name is required" });
  });
  it("maps unknown errors to the generic message without raw text", () => {
    const r = toFormError(new Error('duplicate key value violates "pg_x"'));
    expect(r).toEqual({ error: "Something went wrong, please try again" });
    expect(toFormError("boom").error).not.toContain("boom");
  });

  it("rethrows Next redirect errors instead of mapping them", () => {
    let redirectError: unknown;
    try {
      redirect("/login");
    } catch (e) {
      redirectError = e;
    }
    expect(() => toFormError(redirectError)).toThrow(redirectError as Error);
  });
});
