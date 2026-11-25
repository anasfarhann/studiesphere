import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { NewPageForm } from "./NewPageForm";

const m = vi.hoisted(() => ({ action: vi.fn() }));
vi.mock("./actions", () => ({ createQuickPageAction: m.action }));
beforeEach(() => {
  m.action.mockReset();
  m.action.mockResolvedValue(null);
});
afterEach(cleanup);

it("submits the browser's time zone in a hidden tz field", () => {
  const { container } = render(<NewPageForm variant="pill" />);
  const tz = container.querySelector("input[name=tz]") as HTMLInputElement;
  expect(tz.type).toBe("hidden");
  expect(tz.value).toBe(Intl.DateTimeFormat().resolvedOptions().timeZone);
  expect((screen.getByRole("button", { name: "New page" }) as HTMLButtonElement).type).toBe("submit");
});

it("pill: a failed create shows an inline alert instead of crashing", async () => {
  m.action.mockResolvedValue({ error: "Something went wrong, please try again" });
  render(<NewPageForm variant="pill" />);
  expect(screen.queryByRole("alert")).toBeNull();
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "New page" }));
  });
  expect(m.action).toHaveBeenCalledTimes(1);
  expect(m.action.mock.calls[0][1]).toBeInstanceOf(FormData);
  expect(screen.getByRole("alert").textContent).toBe("Couldn't create the page. Try again.");
});

it("rail: a failed create shows a dismissible alert; a new failure shows it again", async () => {
  m.action.mockResolvedValue({ error: "x" });
  render(<NewPageForm variant="rail" />);
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "New page" }));
  });
  expect(screen.getByRole("alert").textContent).toContain("Couldn't create the page. Try again.");
  fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
  expect(screen.queryByRole("alert")).toBeNull();
  m.action.mockResolvedValue({ error: "x" });
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "New page" }));
  });
  expect(screen.getByRole("alert")).toBeTruthy();
});
