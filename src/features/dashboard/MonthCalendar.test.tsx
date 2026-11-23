import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { MonthCalendar } from "./MonthCalendar";

afterEach(cleanup);

describe("MonthCalendar", () => {
  it("starts 1 Nov 2026 (a Sunday) after six blanks, Monday first, and highlights today", () => {
    const { container } = render(<MonthCalendar today={new Date(2026, 10, 23)} />);
    expect(screen.getByRole("heading", { name: "November 2026" })).toBeTruthy();
    expect(container.querySelectorAll("[data-blank]").length).toBe(6);
    expect(container.querySelectorAll("[data-day]").length).toBe(30);
    const todayCell = screen.getByText("23");
    expect(todayCell.getAttribute("aria-current")).toBe("date");
    expect(todayCell.className).toMatch(/bg-today/);
    expect(screen.getByText("22").getAttribute("aria-current")).toBeNull();
    expect(screen.getAllByText(/^(Mo|Tu|We|Th|Fr|Sa|Su)$/).map((e) => e.textContent)).toEqual([
      "Mo", "Tu", "We", "Th", "Fr", "Sa", "Su",
    ]);
  });
});
