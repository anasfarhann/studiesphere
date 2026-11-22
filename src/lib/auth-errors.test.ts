import { describe, expect, it } from "vitest";
import { authErrorMessage } from "./auth-errors";

describe("authErrorMessage", () => {
  it("maps invalid credentials to the friendly string", () => {
    expect(authErrorMessage({ message: "Invalid login credentials" })).toBe("Email or password is incorrect");
    expect(authErrorMessage({ message: "x", code: "invalid_credentials" })).toBe("Email or password is incorrect");
  });
  it("passes other messages through", () => {
    expect(authErrorMessage({ message: "Password too short" })).toBe("Password too short");
  });
});
