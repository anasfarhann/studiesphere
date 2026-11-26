import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CanvasTitlePill } from "./CanvasTitlePill";

afterEach(cleanup);
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));

describe("CanvasTitlePill", () => {
  it("shows Page · Folder with a back link to the folder", () => {
    render(<CanvasTitlePill backHref="/app/s/f1" title="Cell structure" folder="Biology" />);
    expect(screen.getByRole("link", { name: "Back to Biology" }).getAttribute("href")).toBe("/app/s/f1");
    expect(screen.getByRole("heading", { level: 1, name: "Cell structure" })).toBeTruthy();
    expect(screen.getByText("Biology")).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/notebook/i);
  });

  it("truncates long names instead of growing", () => {
    const long = "x".repeat(60);
    render(<CanvasTitlePill backHref="/" title={long} folder={`${long}!`} />);
    expect(screen.getByRole("heading", { level: 1 }).className).toMatch(/truncate/);
    expect(screen.getByText(`${long}!`).className).toMatch(/truncate/);
  });
});
