import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ImageEl } from "../model/types";
import { BackgroundStatus } from "./BackgroundStatus";
import { ImagePreview } from "./ImagePreview";

afterEach(cleanup);

const photo: ImageEl = { id: "img", type: "image", x: 0, y: 0, w: 200, h: 100, assetPath: "o/p/a.png", crop: { x: 0.5, y: 0, w: 0.5, h: 1 }, z: 0, updatedAt: 1 };

function Harness({ resolveUrl }: { resolveUrl: (p: string) => Promise<string> }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Preview
      </button>
      {open ? <ImagePreview image={photo} resolveUrl={resolveUrl} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

describe("ImagePreview", () => {
  it("opens in-app with the photo's signed URL, showing its cropped part; Escape closes and returns focus", async () => {
    const resolveUrl = vi.fn(async () => "blob:signed");
    render(<Harness resolveUrl={resolveUrl} />);
    const opener = screen.getByRole("button", { name: "Preview" });
    opener.focus();
    fireEvent.click(opener);
    const dialog = screen.getByRole("dialog", { name: "Photo preview" });
    const img = (await screen.findByRole("img", { name: "Photo preview" })) as HTMLImageElement;
    expect(resolveUrl).toHaveBeenCalledWith("o/p/a.png");
    expect(img.getAttribute("src")).toBe("blob:signed");
    // The right half (crop x 0.5, w 0.5): twice as wide as the frame, shifted left by one frame width.
    expect(img.style.width).toBe("200%");
    expect(img.style.left).toBe("-100%");
    expect(screen.getByTestId("image-preview-frame").style.aspectRatio).toBe("2 / 1");
    expect(dialog.contains(document.activeElement)).toBe(true);
    act(() => {
      fireEvent.keyDown(document, { key: "Escape" });
    });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it("a cropped photo can be shown whole and back; an uncropped one has no toggle", async () => {
    const { rerender } = render(<ImagePreview image={photo} resolveUrl={async () => "blob:signed"} onClose={() => {}} />);
    const img = (await screen.findByRole("img", { name: "Photo preview" })) as HTMLImageElement;
    const frame = screen.getByTestId("image-preview-frame");
    const toggle = screen.getByRole("button", { name: "Show whole photo" });
    expect(toggle.className).toMatch(/\bh-11\b/);
    fireEvent.click(toggle);
    expect(img.style.width).toBe("100%");
    expect(img.style.left).toBe("0%");
    expect(frame.style.aspectRatio).toBe("4 / 1"); // whole: the 2:1 card is the right half of a 4:1 original
    fireEvent.click(screen.getByRole("button", { name: "Show cropped" }));
    expect(img.style.width).toBe("200%");
    rerender(<ImagePreview image={{ ...photo, crop: undefined }} resolveUrl={async () => "blob:signed"} onClose={() => {}} />);
    expect(screen.queryByRole("button", { name: /Show/ })).toBeNull();
  });

  it("the close button closes it; a URL that cannot be signed shows a message", async () => {
    render(<Harness resolveUrl={() => Promise.reject(new Error("no"))} />);
    const opener = screen.getByRole("button", { name: "Preview" });
    opener.focus();
    fireEvent.click(opener);
    expect(await screen.findByText("Couldn't load this photo")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(opener);
  });
});

describe("BackgroundStatus", () => {
  it("shows the percentage with Cancel, and failures with Dismiss", () => {
    const onCancel = vi.fn();
    const onDismiss = vi.fn();
    const { rerender } = render(<BackgroundStatus status={{ kind: "working", id: "img", percent: 40 }} onCancel={onCancel} onDismiss={onDismiss} />);
    const chip = screen.getByRole("status", { name: "Background removal status" });
    expect(chip.textContent).toContain("Removing background… 40%");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Cancel" }).className).toMatch(/\bh-11\b/);

    rerender(<BackgroundStatus status={{ kind: "working", id: "img", percent: 75 }} onCancel={onCancel} onDismiss={onDismiss} />);
    expect(chip.textContent).toContain("Removing background… 75%");

    rerender(<BackgroundStatus status={{ kind: "error", message: "Couldn't remove the background. The photo is unchanged." }} onCancel={onCancel} onDismiss={onDismiss} />);
    expect(screen.getByRole("status").textContent).toContain("The photo is unchanged");
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(onDismiss).toHaveBeenCalled();

    rerender(<BackgroundStatus status={{ kind: "idle" }} onCancel={onCancel} onDismiss={onDismiss} />);
    expect(screen.queryByRole("status")).toBeNull();
  });
});
