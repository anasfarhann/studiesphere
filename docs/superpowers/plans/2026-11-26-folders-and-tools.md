# Folders, Home Actions and Canvas Tools Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Make organising pages simple and finish this round's canvas requests:
- Folders replace subject → notebook.
- Home page cards gain actions: duplicate, rename, delete, move, share as PDF.
- Cards show real page previews.
- A "New page" button sits next to "Continue where you left off".
- Colour: "Save preset" (replace) and an eyedropper.
- The lasso resizes selected drawings.
- Image buttons: Remove background (on device), Crop and Preview.

**Spec:** the owner's annotated PDF of 2026-11-26 plus these approved decisions:
- **Folders:** each folder (a `subjects` row) owns exactly one hidden notebook named "Pages", which holds its pages. It is created lazily and idempotently, converging on oldest by `(created_at, id)` and never deleting, like `ensureQuickNotebook`.
- **No schema change:** pages still have `notebook_id`. "Move to folder" moves the page to the target folder's hidden notebook.
- **Older data:** existing folders with several notebooks show the pages of all their notebooks together.
- **Background removal:** runs on the device via `@imgly/background-removal`, lazily loaded. Its model assets must be served from our origin, or from the library's CDN if self-hosting is impractical (say which in the report).
- **Data wipe:** the controller wipes the account data separately after Part 1 is live. This is not a task.

**Tech:** Next.js 16 App Router (read AGENTS.md), React 19, TS strict, Tailwind v4, Supabase (RLS, Storage bucket `attachments` with paths `{owner}/{page}/…`), custom canvas in `src/canvas`, Vitest, Playwright (`PLAYWRIGHT_CHANNEL=chrome`).

## Global Constraints
- **No DB migrations.** All queries are owner-scoped. Server actions call auth before any `try`, with `redirect` outside the `try`.
- **UI rules:** strings live in `src/i18n/en.ts`. Use the existing tokens and components (PillButton, IconButton, Dialog, Card styles). Targets ≥44 px. Light only. No overflow at 320, 390, 834 or 1280 px.
- **Canvas:** every edit is one undo step and saved via autosave. Old notes render identically. The Apple Pencil hot path gains no per-move work. Palm rejection goes through the router.
- **Destructive actions:**
  - Deleting a page asks for confirmation in a Dialog that names the page and says it can't be undone.
  - Deleting a folder that has pages is refused with a message. There is no cascade delete from the UI.
- **Previews:**
  - Path: `{owner}/{page}/preview.jpg`, upserted.
  - Size: max 480 px wide, JPEG quality 0.7.
  - When: generated in the browser from the scene, throttled to at most one per 20 s while editing, plus once on leaving the page when dirty.
  - Cards load them through signed URLs with cache-busting by `pages.updated_at`, falling back to the existing placeholder.
- **Share as PDF:**
  - Built in the browser with jsPDF, lazy-loaded.
  - Content: the page's elements at their positions on a white background, fitted to A4 portrait (or landscape when wider), scaled to fit, with images embedded.
  - Delivery: share via `navigator.share({files})` when supported, otherwise download `<title>.pdf`.

## Review Focus
1. A folder created before this change (with notebooks) still shows all its pages, and nothing is lost.
2. Move to folder followed by undo/refresh never duplicates or loses a page. Duplicate copies elements with new ids. Assets are shared by path, not re-uploaded.
3. Preview generation never blocks drawing or typing, and failures are silent.
4. Remove background on a large iPad photo shows progress, can be cancelled or fails gracefully, and doesn't freeze the UI (worker).
5. The lasso resizing mixed selections (strokes, text, images) keeps proportions, scales stroke width sensibly, and is one undo step.

---

### Task 1: Folders replace subjects and notebooks
**Files:**
- `src/features/library/*` (repo, supabase-repo, memory-repo, actions, views, forms, quick-notes → generalise into `ensureFolderNotebook(db, ownerId, folderId)`).
- Routes under `src/app/(app)/(shell)/app/s/[subjectId]` (the folder view) and `/app/n/[notebookId]` (redirect to its folder).
- Dashboard "Your subjects" → "Your folders".
- en.ts and the e2e specs.

**Behaviour:**
- "New subject" becomes "New folder". The colour choice stays.
- A folder card shows its page count.
- Opening a folder lists all pages in it (across its notebooks, newest first) with a "New page" button. That button creates a page in the folder's hidden notebook and opens it.
- Rename and delete folder are available on the folder view. Delete is refused when the folder has pages.
- No "notebook" wording remains anywhere in the UI. The page title pill shows `Page · Folder name` and its back link goes to the folder.
- Quick notes is just a folder.

**Tests:**
- `ensureFolderNotebook` creates, reuses, converges and never deletes.
- The folder view lists pages from several notebooks.
- The notebook route redirects.
- Strings contain no "notebook".
- e2e: the dashboard shows "Your folders" with no overflow.

Commit `feat(library): folders replace subjects and notebooks`.

### Task 2: Home page actions and the New page button
**Files:** Dashboard, recent-page card component, `src/features/library/actions.ts`, a new `PageActionsMenu`, en.ts and tests.

**Behaviour:**
- A "New page" PillButton (dark, plus icon) at the right end of the "Continue where you left off" header row. It reuses NewPageForm and creates the page in Quick notes.
- Each recent page card's round arrow button opens a menu (popover, Escape/outside close, focus return, ≥44 px items) with:
  - **Open.**
  - **Duplicate:** a new page "<title> (copy)" in the same folder, elements copied with new ids and assets by path.
  - **Rename:** a Dialog.
  - **Move to folder:** a Dialog listing folders.
  - **Share as PDF:** Task 4 wires it; until then, hide it.
  - **Delete:** a confirm Dialog.
- All are server actions returning FormState and revalidating /app.
- The same menu is available on page rows in the folder view.

**Tests:**
- Each action, with a fake client: owner scoping, duplicate copying elements with new ids, move changing `notebook_id` to the target folder's notebook.
- The delete confirm.
- The menu's keyboard and focus behaviour.
- e2e (dev dashboard route): the menu opens and items are ≥44 px at 390.

Commit `feat(dashboard): page actions menu and new page button`.

### Task 3: Real page previews
**Files:** create `src/canvas/preview/page-preview.ts` (render scene → JPEG blob using the existing renderer offscreen; images through the existing image cache). Modify PersistentCanvas or CanvasView (throttle and on-leave), the attachments upload (upsert `preview.jpg`), the dashboard and folder card components, and the queries (signed preview URL with `?v=<updated_at>`).

**Behaviour:** per the Global Constraints. The preview frames the bounding box of all elements with a small margin. An empty page gets no preview (placeholder).

**Tests:**
- Bounds framing and size cap.
- Throttle (fake timers).
- Upload upserts the fixed path.
- The card shows an img when a preview exists and the placeholder otherwise.
- Failures are swallowed.

Commit `feat(canvas): real page previews on cards`.

### Task 4: Share as PDF
**Files:** create `src/features/share/page-pdf.ts` (lazy jsPDF; loads the page's elements via the browser Supabase client with RLS, renders strokes, text, images, and file/audio cards as labelled boxes). Wire it into PageActionsMenu, and into the canvas page's title pill menu if one exists; otherwise add a share icon to the page header.

**Tests:**
- Page fitting and orientation.
- Elements are drawn (mock jsPDF).
- navigator.share used when available, otherwise download.
- Errors show a toast.

Commit `feat(share): share page as pdf`.

### Task 5: Save preset and eyedropper
**Files:** ToolOptions/ColorSwatches, ColorWheel, tool-settings, the editor (eyedropper mode) and en.ts.

**Behaviour:**
- **Save preset:** next to "Add to presets", it replaces the currently selected preset (including a default) with the wheel colour, and the colour stays selected. A default replaced this way counts as that slot's colour. Reset to defaults is available via a small "Reset colours" text button.
- **Eyedropper:** a teardrop IconButton in the colour panel arms a one-shot pick. The next tap on the canvas takes the colour of the topmost element under the point:
  - stroke: its colour; text: its colour; image: the pixel colour sampled from the image at that point.
  - The colour is set as the current tool's colour (and the selection's when recolouring a selection).
  - Escape or a second tap on the button cancels it.
  - The cursor or hint shows "Tap a colour on the page".

**Tests:**
- Replace preset.
- Eyedropper picks stroke, text and image pixel colours (mock canvas).
- Cancel works.
- Palm touches are ignored.

Commit `feat(canvas): save preset and eyedropper`.

### Task 6: The lasso resizes selected drawings
**Files:** `src/canvas/tools/lasso.ts`, selection, renderer (selection handles), a new `src/canvas/tools/selection-scale.ts`, and tests.

**Behaviour:**
- Any multi-element or stroke selection shows 4 corner handles on its bounds (≥44 px hit, palm-rejected). Single image and single text keep their own handles.
- Dragging scales uniformly about the opposite corner.
  - Strokes get points and size scaled.
  - Text gets x/y scaled, fontSize scaled, and w scaled for fixed boxes; auto boxes recompute.
  - Images and cards get x/y/w/h scaled.
- Minimum size: 8 px on screen. One undo step.

**Tests:**
- Scale math per element type.
- The opposite corner stays fixed.
- One undo step.
- Old elements behave the same.

Commit `feat(canvas): resize lasso selections`.

### Task 7: Image buttons — Remove background, Crop and Preview
**Files:** SelectionMenu (single image: Remove background, Crop, Preview, Delete, Copy), a new `src/canvas/tools/remove-background.ts` (lazy `@imgly/background-removal` in a worker where supported, with progress callback and cancel), a new `ImagePreview` lightbox (Dialog, full-screen image, pinch/zoom optional, Escape closes, no new tab), the attachments upload and en.ts.

**Behaviour:**
- **Remove background:**
  - Shows a progress chip ("Removing background… 40%") with Cancel.
  - On success it uploads a PNG as a new asset and replaces the element's assetPath (keeping x/y/w/h and crop). One undo step restores the original path.
  - On failure or cancel nothing changes and a friendly message shows.
- **Preview:** opens the full image (signed URL) in the lightbox.
- **Crop:** the existing crop.

**Tests:**
- Replace and undo (mock remover).
- Cancel leaves the element unchanged.
- The progress UI.
- The lightbox opens and closes with focus return.
- The library is not in the initial chunk.

Commit `feat(canvas): remove background, crop and preview buttons`.

**Release:** Part 1 = Tasks 1–4, merged and deployed, then the data wipe. Part 2 = Tasks 5–7.
