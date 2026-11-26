import { t } from "@/i18n/en";

export const MAX_ATTACHMENT_BYTES = 50 * 1024 * 1024;
/** Signed URLs are issued for 60 minutes; ours are reused for 50 so they never expire mid-use. */
export const SIGNED_URL_TTL_S = 60 * 60;
export const SIGNED_URL_CACHE_MS = 50 * 60 * 1000;

export type AttachmentErrorCode = "too_large" | "upload_failed";

export class AttachmentError extends Error {
  constructor(
    readonly code: AttachmentErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "AttachmentError";
  }
}

/** The slice of a Supabase storage bucket we use; tests and the dev route inject fakes. */
export interface AttachmentStorage {
  /** `upsert` replaces an existing object (page previews only; attachments are never overwritten). */
  upload(path: string, body: Blob, opts: { contentType?: string; upsert?: boolean }): Promise<{ error: { message: string } | null }>;
  createSignedUrl(path: string, expiresInS: number): Promise<{ url: string | null; error: { message: string } | null }>;
  remove?(paths: string[]): Promise<{ error: { message: string } | null }>;
}

/** A page's card preview: one fixed, upserted object per page beside its attachments. */
export function previewPath(ownerId: string, pageId: string): string {
  return `${ownerId}/${pageId}/preview.jpg`;
}

export interface UploadOptions {
  ownerId: string;
  pageId: string;
  ext: string;
}

function cleanExt(ext: string): string {
  if (ext === "thumb.jpg") return ext; // PDF first-page preview, stored beside its file
  const e = ext.toLowerCase().replace(/[^a-z0-9]/g, "");
  return e.length > 0 && e.length <= 10 ? e : "bin";
}

/** Uploads to `{owner}/{page}/{uuid}.{ext}` (storage policies key on the first segment) and signs URLs. */
export class AttachmentService {
  private urls = new Map<string, { url: string; expires: number }>();

  constructor(
    private storage: AttachmentStorage,
    private now: () => number = () => Date.now(),
    private newId: () => string = () => crypto.randomUUID(),
  ) {}

  async uploadAttachment(file: Blob, opts: UploadOptions): Promise<{ assetPath: string }> {
    if (file.size > MAX_ATTACHMENT_BYTES) throw new AttachmentError("too_large", t("attachmentTooLarge"));
    const assetPath = `${opts.ownerId}/${opts.pageId}/${this.newId()}.${cleanExt(opts.ext)}`;
    let failure: string | null = null;
    try {
      const { error } = await this.storage.upload(assetPath, file, file.type ? { contentType: file.type } : {});
      if (error) failure = error.message;
    } catch (e) {
      failure = e instanceof Error ? e.message : "upload failed";
    }
    if (failure !== null) throw new AttachmentError("upload_failed", failure);
    return { assetPath };
  }

  /** Upserts the page's card preview at `{owner}/{page}/preview.jpg`. Rejects on failure. */
  async uploadPreview(jpeg: Blob, opts: { ownerId: string; pageId: string }): Promise<void> {
    const { error } = await this.storage.upload(previewPath(opts.ownerId, opts.pageId), jpeg, { contentType: "image/jpeg", upsert: true });
    if (error) throw new AttachmentError("upload_failed", error.message);
  }

  /** Whether the page has a preview (a missing object cannot be signed). Never cached, never rejects. */
  async previewExists(opts: { ownerId: string; pageId: string }): Promise<boolean> {
    try {
      const { url, error } = await this.storage.createSignedUrl(previewPath(opts.ownerId, opts.pageId), 60);
      return !error && !!url;
    } catch {
      return false;
    }
  }

  /** Drops the page's preview (the page was emptied). Rejects on failure. */
  async removePreview(opts: { ownerId: string; pageId: string }): Promise<void> {
    if (!this.storage.remove) return;
    const { error } = await this.storage.remove([previewPath(opts.ownerId, opts.pageId)]);
    if (error) throw new Error(error.message);
  }

  /** Drops the cached URL so the next signedUrl() asks the server again. */
  forgetSignedUrl(assetPath: string): void {
    this.urls.delete(assetPath);
  }

  /** Cached for 50 minutes per path. */
  async signedUrl(assetPath: string): Promise<string> {
    const hit = this.urls.get(assetPath);
    if (hit && hit.expires > this.now()) return hit.url;
    const { url, error } = await this.storage.createSignedUrl(assetPath, SIGNED_URL_TTL_S);
    if (error || !url) throw new Error(error?.message ?? "no signed url");
    this.urls.set(assetPath, { url, expires: this.now() + SIGNED_URL_CACHE_MS });
    return url;
  }
}

/** Adapts a Supabase client's `attachments` bucket. */
export function supabaseAttachmentStorage(client: {
  storage: {
    from(bucket: string): {
      upload(path: string, body: Blob, opts: { contentType?: string; upsert?: boolean }): Promise<{ error: { message: string } | null }>;
      createSignedUrl(path: string, expiresIn: number): Promise<{ data: { signedUrl: string } | null; error: { message: string } | null }>;
      remove(paths: string[]): Promise<{ error: { message: string } | null }>;
    };
  };
}): AttachmentStorage {
  const bucket = () => client.storage.from("attachments");
  return {
    upload: (path, body, opts) => bucket().upload(path, body, { ...opts, upsert: opts.upsert === true }),
    remove: async (paths) => {
      const { error } = await bucket().remove(paths);
      return { error };
    },
    createSignedUrl: async (path, expiresIn) => {
      const { data, error } = await bucket().createSignedUrl(path, expiresIn);
      return { url: data?.signedUrl ?? null, error };
    },
  };
}
