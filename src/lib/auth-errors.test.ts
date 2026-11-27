import { describe, expect, it } from "vitest";
import { en } from "@/i18n/en";
import { authErrorMessage, isTransientAuthError } from "./auth-errors";

describe("authErrorMessage", () => {
  it.each([
    [{ message: "Invalid login credentials" }, en.invalidCredentials],
    [{ message: "x", code: "invalid_credentials" }, en.invalidCredentials],
    [{ message: "x", code: "weak_password" }, en.weakPassword],
    [{ message: "x", code: "over_request_rate_limit" }, en.rateLimited],
    [{ message: "x", code: "over_email_send_rate_limit" }, en.rateLimited],
    [{ message: "User already registered", code: "user_already_exists" }, en.userAlreadyExists],
    [{ message: "x", code: "email_address_invalid" }, en.invalidEmail],
    [{ message: "Failed to fetch", name: "AuthRetryableFetchError", status: 0 }, en.networkError],
    [new TypeError("Failed to fetch"), en.networkError],
    [{ message: "x", code: "same_password" }, en.samePassword],
  ])("maps %j", (err, expected) => expect(authErrorMessage(err)).toBe(expected));

  it("never leaks raw messages for unknown errors", () => {
    expect(authErrorMessage({ message: "pg: secret internals", code: "weird" })).toBe(en.authGenericError);
    expect(authErrorMessage("boom")).toBe(en.authGenericError);
    expect(authErrorMessage(undefined)).toBe(en.authGenericError);
  });
});

describe("isTransientAuthError", () => {
  it.each([
    [new TypeError("Failed to fetch"), true],
    [{ name: "AuthRetryableFetchError", status: 0 }, true],
    [{ code: "over_email_send_rate_limit" }, true],
    [{ code: "over_request_rate_limit" }, true],
    [{ status: 429 }, true],
    [{ code: "user_not_found" }, false],
    [{ code: "email_address_invalid" }, false],
    [{ message: "anything" }, false],
  ])("%j -> %s", (err, expected) => expect(isTransientAuthError(err)).toBe(expected));
});
