const TIMEOUT_MS = 8000;

type Destroyable = { destroy(): unknown };

/** Best-effort destroy: pdfjs may return a promise, throw, or already be torn down. */
function destroy(x: Destroyable | null | undefined): void {
  try {
    const r = x?.destroy();
    if (r && typeof (r as Promise<unknown>).catch === "function") (r as Promise<unknown>).catch(() => {});
  } catch {
    // best effort
  }
}

/**
 * Renders page 1 of a PDF to a JPEG of `maxWidth` CSS px. pdfjs-dist is imported on demand so it
 * never lands in the canvas bundle; its worker is bundled as an asset on our own origin.
 * Resolves null on any failure or after 8 s: a thumbnail is a nicety, never a blocker. After a timeout the
 * work still in flight stops at its next step and tears down the loading task (with its document and worker).
 */
export async function renderPdfThumbnail(file: Blob, maxWidth = 480): Promise<Blob | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let timedOut = false;
  // Destroying the loading task also destroys its document and worker (pdfjs 6 documents have no destroy()).
  // Safe to repeat: a document that resolves after a timeout is torn down again at the next check().
  let task: Destroyable | null = null;
  const teardown = () => destroy(task);
  /** Throws once the timeout has fired, tearing down whatever exists so far. */
  const check = () => {
    if (!timedOut) return;
    teardown();
    throw new Error("pdf thumbnail timed out");
  };
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => {
      timedOut = true;
      teardown();
      resolve(null);
    }, TIMEOUT_MS);
  });
  const work = (async (): Promise<Blob | null> => {
    const pdfjs = await import("pdfjs-dist");
    check();
    pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
    const data = new Uint8Array(await file.arrayBuffer());
    check();
    // No eval on untrusted input. pdfjs 6 dropped the eval font path and this option with it; it is kept
    // (typed by hand) so a downgrade or a future reintroduction stays off.
    const params: Parameters<typeof pdfjs.getDocument>[0] & { isEvalSupported?: boolean } = { data, isEvalSupported: false };
    const loading = pdfjs.getDocument(params);
    task = loading;
    const pdf = await loading.promise;
    check();
    const page = await pdf.getPage(1);
    check();
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: maxWidth / base.width });
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvas, canvasContext: ctx, viewport }).promise;
    check();
    return await new Promise<Blob | null>((resolve) => canvas.toBlob((b) => resolve(b), "image/jpeg", 0.8));
  })();
  try {
    return await Promise.race([work.catch(() => null), timeout]);
  } finally {
    clearTimeout(timer);
    teardown();
  }
}
