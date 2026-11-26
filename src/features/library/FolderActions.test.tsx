import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./forms", () => ({ DeleteFolderForm: () => null, RenameFolderForm: () => null }));

import { FolderActions } from "./FolderActions";

afterEach(cleanup);

describe("FolderActions", () => {
  it("offers Rename and Delete for an ordinary folder", () => {
    render(<FolderActions folder={{ id: "f1", name: "Biology" }} pageCount={0} />);
    expect(screen.getByRole("button", { name: "Rename" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Delete/ })).toBeTruthy();
  });
  it("offers neither for the Quick notes folder (it is found by its name)", () => {
    render(<FolderActions folder={{ id: "q", name: "Quick notes" }} pageCount={2} />);
    expect(screen.queryByRole("button")).toBeNull();
  });
});
