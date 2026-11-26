import { beforeEach, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ redirect: vi.fn(), getNotebook: vi.fn(), getUser: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    m.redirect(url);
    throw new Error("NEXT_REDIRECT");
  },
}));
vi.mock("@/lib/auth", () => ({ getUser: m.getUser }));
vi.mock("@/features/library/lookups", () => ({ getNotebook: m.getNotebook }));

import NotebookRedirect from "./page";

beforeEach(() => {
  vi.clearAllMocks();
  m.getUser.mockResolvedValue({ id: "u1" });
  m.getNotebook.mockResolvedValue({ id: "n1", subject_id: "f1", title: "Cells" });
});

it("an old notebook link redirects to its folder", async () => {
  await expect(NotebookRedirect({ params: Promise.resolve({ notebookId: "n1" }) })).rejects.toThrow("NEXT_REDIRECT");
  expect(m.getUser).toHaveBeenCalled();
  expect(m.getNotebook).toHaveBeenCalledWith("n1");
  expect(m.redirect).toHaveBeenCalledWith("/app/s/f1");
});
