import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { NewPageForm } from "./NewPageForm";

vi.mock("./actions", () => ({ createQuickPageAction: async () => {} }));
afterEach(cleanup);

it("submits the browser's time zone in a hidden tz field", () => {
  const { container } = render(<NewPageForm variant="pill" />);
  const tz = container.querySelector("input[name=tz]") as HTMLInputElement;
  expect(tz.type).toBe("hidden");
  expect(tz.value).toBe(Intl.DateTimeFormat().resolvedOptions().timeZone);
  expect((screen.getByRole("button", { name: "New page" }) as HTMLButtonElement).type).toBe("submit");
});
