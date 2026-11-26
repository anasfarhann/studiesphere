import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CanvasTitlePill } from "./CanvasTitlePill";

vi.mock("./SharePageButton", () => ({ SharePageButton: ({ pageId }: { pageId: string }) => <button aria-label="Share page as PDF" data-page={pageId} /> }));
afterEach(cleanup);
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));

describe("CanvasTitlePill", () => {
  it("shows Page · Folder with a back link to the folder", () => {
    render(<CanvasTitlePill backHref="/app/s/f1" title="Cell structure" folder="Biology" pageId="p1" />);
    expect(screen.getByRole("link", { name: "Back to Biology" }).getAttribute("href")).toBe("/app/s/f1");
    expect(screen.getByRole("heading", { level: 1, name: "Cell structure" })).toBeTruthy();
    expect(screen.getByText("Biology")).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/notebook/i);
  });

  it("has a share button for the page", () => {
    render(<CanvasTitlePill backHref="/" title="T" folder="F" pageId="p9" />);
    expect(screen.getByRole("button", { name: "Share page as PDF" }).getAttribute("data-page")).toBe("p9");
  });

  it("truncates long names instead of growing", () => {
    const long = "x".repeat(60);
    render(<CanvasTitlePill backHref="/" title={long} folder={`${long}!`} pageId="p1" />);
    expect(screen.getByRole("heading", { level: 1 }).className).toMatch(/truncate/);
    expect(screen.getByText(`${long}!`).className).toMatch(/truncate/);
  });
});
