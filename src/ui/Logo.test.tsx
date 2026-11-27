import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { LogoMark, Wordmark, logoStrokeWidth } from "./Logo";

afterEach(cleanup);

describe("LogoMark", () => {
  it("draws the Orbit S geometry with a gradient stroke", () => {
    const { container } = render(<LogoMark size={64} />);
    const svg = container.querySelector("svg")!;
    expect(svg.getAttribute("viewBox")).toBe("0 0 100 100");
    expect(svg).toHaveAttribute("aria-hidden", "true");
    const circle = svg.querySelector("circle")!;
    expect(circle).toHaveAttribute("r", "40");
    expect(circle).toHaveAttribute("stroke-width", "11");
    const path = svg.querySelector("path")!;
    expect(path).toHaveAttribute("d", "M50 10 A20 20 0 0 0 50 50 A20 20 0 0 1 50 90");
    expect(path).toHaveAttribute("stroke-linecap", "butt");
    const stops = [...svg.querySelectorAll("stop")].map((s) => [s.getAttribute("offset"), s.getAttribute("stop-color")]);
    expect(stops).toEqual([["0", "#D9D2FF"], ["0.5", "#A597F4"], ["1", "#6E5CD8"]]);
    const grad = svg.querySelector("linearGradient")!;
    expect(circle.getAttribute("stroke")).toBe(`url(#${grad.id})`);
    expect(path.getAttribute("stroke")).toBe(`url(#${grad.id})`);
  });

  it("gives every rendered instance its own gradient id", () => {
    const { container } = render(<><LogoMark size={24} /><LogoMark size={24} /><Wordmark /></>);
    const ids = [...container.querySelectorAll("linearGradient")].map((g) => g.id);
    expect(ids).toHaveLength(3);
    expect(new Set(ids).size).toBe(3);
    for (const id of ids) expect(container.querySelector(`[stroke="url(#${id})"]`)).not.toBeNull();
  });

  it("is a labelled image when given a title", () => {
    const { getByRole } = render(<LogoMark size={40} title="Studiesphere" />);
    const img = getByRole("img", { name: "Studiesphere" });
    expect(img).not.toHaveAttribute("aria-hidden");
  });

  it("thickens the stroke at small sizes", () => {
    expect(logoStrokeWidth(64)).toBe(11);
    expect(logoStrokeWidth(48)).toBe(12);
    expect(logoStrokeWidth(32)).toBe(13);
    expect(logoStrokeWidth(16)).toBe(15);
  });
});

describe("Wordmark", () => {
  it("shows the lowercase name next to the mark", () => {
    const { container } = render(<Wordmark />);
    expect(container.textContent).toBe("studiesphere");
    expect(container.querySelector("svg")).not.toBeNull();
  });
});
