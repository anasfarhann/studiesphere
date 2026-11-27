import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { FlashNotice } from "./FlashNotice";

afterEach(cleanup);

describe("FlashNotice", () => {
  it("announces the message, drops the query from the URL and can be dismissed", async () => {
    window.history.replaceState(null, "", "/app?notice=password-updated");
    render(<FlashNotice message="Your password has been updated." />);
    expect(screen.getByRole("status")).toHaveTextContent("Your password has been updated.");
    expect(window.location.search).toBe("");
    await userEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(screen.queryByRole("status")).toBeNull();
  });
});
