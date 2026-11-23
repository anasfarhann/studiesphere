import { audioExt } from "../attachments/recorder";
import type { RecordingOutbox } from "../attachments/recording-outbox";
import type { UploadOptions } from "../attachments/upload";
import type { Scene } from "../model/scene";
import type { AudioEl } from "../model/types";
import type { ElementStore } from "../persistence/store";

export interface RecoverContext {
  outbox: RecordingOutbox;
  store: ElementStore;
  scene: Scene;
  ownerId: string;
  pageId: string;
  upload: (file: Blob, opts: UploadOptions) => Promise<{ assetPath: string }>;
  /** False once the editor is gone: cards are then saved to the store only. */
  isMounted?: () => boolean;
  now?: () => number;
}

/**
 * Finishes recordings left in the page's outbox (page closed or upload failed earlier): uploads
 * what is not uploaded yet, adds the card (scene and store) and removes the entry once saved.
 * Returns how many cards were brought back. Entries whose card is already in the scene (it was
 * saved or sits in the offline queue) are just cleaned up and not counted.
 */
export async function recoverRecordings(ctx: RecoverContext): Promise<number> {
  const entries = await ctx.outbox.list();
  let recovered = 0;
  for (const entry of entries) {
    if (ctx.scene.get(entry.id)) {
      await ctx.outbox.remove(entry.id).catch(() => {});
      continue;
    }
    let assetPath = entry.assetPath;
    if (!assetPath) {
      try {
        ({ assetPath } = await ctx.upload(entry.blob, { ownerId: ctx.ownerId, pageId: ctx.pageId, ext: audioExt(entry.mime) }));
        await ctx.outbox.put({ ...entry, assetPath }).catch(() => {});
      } catch {
        continue; // still offline: stays in the outbox for the next visit
      }
    }
    const el: AudioEl = {
      id: entry.id,
      z: ctx.scene.nextZ(),
      updatedAt: (ctx.now ?? Date.now)(),
      type: "audio",
      x: entry.x,
      y: entry.y,
      assetPath,
      durationMs: entry.durationMs,
    };
    if (ctx.isMounted?.() ?? true) ctx.scene.add(el);
    recovered++;
    try {
      await ctx.store.save(ctx.pageId, [el], []);
      await ctx.outbox.remove(entry.id).catch(() => {});
    } catch {
      // Not saved yet: autosave (if mounted) queues it; the entry stays so the next visit retries.
    }
  }
  return recovered;
}
