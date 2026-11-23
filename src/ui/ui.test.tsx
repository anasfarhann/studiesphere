import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { IconButton, PillButton } from "./Button";
import { AppRail } from "./AppRail";

afterEach(cleanup);

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));

describe("IconButton", () => {
  it("renders aria-label and hides the icon", () => {
    render(<IconButton icon="pen" label="Pen" active />);
    const b = screen.getByRole("button", { name: "Pen" });
    expect(b.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
  });
});

describe("PillButton", () => {
  it("renders children as a pill", () => {
    render(<PillButton icon="plus">New subject</PillButton>);
    expect(screen.getByRole("button", { name: "New subject" }).className).toMatch(/rounded-full/);
  });
});

describe("AppRail", () => {
  it("marks the active item with aria-current=page", () => {
    render(<AppRail active="subjects" />);
    expect(screen.getByRole("link", { name: "Subjects" }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("link", { name: "Home" }).getAttribute("aria-current")).toBeNull();
  });
  it("renders coming-soon items as disabled buttons", () => {
    render(<AppRail active="home" />);
    for (const n of ["Timetable (coming soon)", "Flashcards (coming soon)", "Quiz rooms (coming soon)"]) {
      expect((screen.getByRole("button", { name: n }) as HTMLButtonElement).disabled).toBe(true);
    }
  });
  it("offers sign out when an account is given", () => {
    render(<AppRail active="home" account={{ email: "a@b.co", signOut: async () => {} }} />);
    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    expect(screen.getByRole("button", { name: "Sign out" })).toBeTruthy();
    expect(screen.getByText("a@b.co")).toBeTruthy();
  });
});
