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
  it("has a back link, the page title and Subject · Notebook", () => {
    render(<CanvasTitlePill backHref="/app/n/1" title="Cell structure" subject="Biology" notebook="Cells" />);
    expect(screen.getByRole("link", { name: "Back to notebook" }).getAttribute("href")).toBe("/app/n/1");
    expect(screen.getByRole("heading", { level: 1, name: "Cell structure" })).toBeTruthy();
    expect(screen.getByText("Biology · Cells")).toBeTruthy();
  });

  it("truncates long names instead of growing", () => {
    const long = "x".repeat(60);
    render(<CanvasTitlePill backHref="/" title={long} subject={long} notebook={long} />);
    expect(screen.getByRole("heading", { level: 1 }).className).toMatch(/truncate/);
    expect(screen.getByText(`${long} · ${long}`).className).toMatch(/truncate/);
  });
});
