import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import AppError from "./error";

afterEach(cleanup);

it("shows a translated message and Try again re-renders the segment", () => {
  const retry = vi.fn();
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  render(<AppError error={new Error("boom: secret")} retry={retry} />);
  expect(screen.getByRole("heading", { name: "Something went wrong" })).toBeTruthy();
  expect(screen.getByRole("alert").textContent).not.toContain("secret");
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  expect(retry).toHaveBeenCalledTimes(1);
  log.mockRestore();
});
