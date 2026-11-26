import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ share: vi.fn(), deliver: vi.fn(), load: vi.fn() }));
vi.mock("@/lib/supabase/client", () => ({ createBrowserClient: () => ({}) }));
vi.mock("./page-pdf", async () => {
  const actual = await vi.importActual<typeof import("./page-pdf")>("./page-pdf");
  return { ...actual, sharePagePdf: (...a: unknown[]) => m.share(...a), deliverPdf: (...a: unknown[]) => m.deliver(...a), loadPageTarget: (...a: unknown[]) => m.load(...a) };
});

import { useSharePdf } from "./useSharePdf";

const blob = new Blob(["%PDF"]);
beforeEach(() => vi.clearAllMocks());

describe("useSharePdf", () => {
  it("goes ready on needs-tap, then shares from the tap with fromTap", async () => {
    m.share.mockResolvedValue({ result: "needs-tap", blob });
    m.deliver.mockResolvedValue("shared");
    const { result } = renderHook(() => useSharePdf({ id: "p", title: "Cells" }));
    await act(async () => {
      expect(await result.current.share()).toBe(false);
    });
    expect(result.current.ready).toBe(true);
    expect(result.current.error).toBeNull();
    await act(async () => {
      await result.current.shareReady();
    });
    expect(m.deliver).toHaveBeenCalledWith(blob, "Cells", { fromTap: true });
    expect(result.current.ready).toBe(false);
  });

  it("uses the live target when given, never loading from the server", async () => {
    m.share.mockImplementation(async (o: { target: () => Promise<unknown> }) => {
      expect(await o.target()).toBe(live);
      return { result: "downloaded", blob };
    });
    const live = { elements: () => [], drawSnapshot: () => true };
    const { result } = renderHook(() => useSharePdf({ id: "p", title: "Cells" }, live));
    await act(async () => {
      expect(await result.current.share()).toBe(true);
    });
    expect(m.load).not.toHaveBeenCalled();
  });

  it("shows a friendly error when building fails", async () => {
    m.share.mockRejectedValue(new Error("boom"));
    const { result } = renderHook(() => useSharePdf({ id: "p", title: "Cells" }));
    await act(async () => {
      expect(await result.current.share()).toBe(false);
    });
    expect(result.current.error).toBe("Couldn't make the PDF. Please try again.");
  });

  describe("ready invalidation", () => {
    const ready = async (live?: { elements: () => never[]; drawSnapshot: () => boolean; onChange?: (fn: () => void) => () => void }) => {
      m.share.mockResolvedValue({ result: "needs-tap", blob });
      const hook = renderHook(() => useSharePdf({ id: "p", title: "Cells" }, live));
      await act(async () => {
        await hook.result.current.share();
      });
      expect(hook.result.current.ready).toBe(true);
      return hook;
    };
    it("dismissReady drops the built PDF", async () => {
      const { result } = await ready();
      act(() => result.current.dismissReady());
      expect(result.current.ready).toBe(false);
      await act(async () => {
        expect(await result.current.shareReady()).toBe(false);
      });
      expect(m.deliver).not.toHaveBeenCalled();
    });
    it("is invalidated by an edit to the live scene, and unsubscribes", async () => {
      let fire: () => void = () => {};
      const off = vi.fn();
      const live = { elements: () => [] as never[], drawSnapshot: () => true, onChange: (fn: () => void) => ((fire = fn), off) };
      const { result, unmount } = await ready(live);
      act(() => fire());
      expect(result.current.ready).toBe(false);
      expect(off).toHaveBeenCalled();
      unmount();
    });
    it("expires after 60 s", async () => {
      vi.useFakeTimers();
      try {
        const { result } = await ready();
        act(() => void vi.advanceTimersByTime(59_000));
        expect(result.current.ready).toBe(true);
        act(() => void vi.advanceTimersByTime(1_500));
        expect(result.current.ready).toBe(false);
      } finally {
        vi.useRealTimers();
      }
    });
  });
});
