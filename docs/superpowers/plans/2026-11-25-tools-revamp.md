# Tools Revamp and Quick Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One-tap new page, a PDF first-page thumbnail, per-tool pixel sizes and a colour wheel with presets, snap to shape, eraser modes, a lasso that selects everything (plus tap-to-select, a context menu and copy/paste), text styles, and image resize/crop.

**Architecture:** Extend the custom canvas engine. The changes are:
- A per-tool settings store (localStorage) feeds `Editor`.
- A pure shape recogniser plus hold detection lives in the stroke tools.
- New optional fields on the element JSON.
- The Toolbar gains an options popover per tool.
- The quick page is a server action.

There is no DB migration.

**Tech Stack:** Next.js 16 App Router (read AGENTS.md — APIs differ from training data), React 19, TS strict, Tailwind v4, Vitest + Testing Library, Playwright (`PLAYWRIGHT_CHANNEL=chrome`), Supabase, pdfjs-dist (new, lazy), @fontsource (Lora, Caveat, JetBrains Mono).

**Spec:** docs/superpowers/specs/2026-11-25-tools-revamp-design.md

## Global Constraints
- **Release:** Part A is Tasks 1–6 and Part B is Tasks 7–9. Each part is merged and deployed on its own.
- **Database:** no migrations and no schema changes. New element fields are optional. An element without them renders and behaves exactly as before.
- **Sizes:** sizes are screen px at 100% zoom.
  - Pen: 1–40, default 3.
  - Highlighter: 4–60, default 18.
  - Eraser: 4–80, default 20. Eraser radius = size / 2 / zoom in world units.
  - Text: 12–96, default 20.
- **Colour presets:**
  - Pen defaults: #1B1A1F, #2563EB, #DC2626.
  - Highlighter defaults: #F4D35E, #8BE0A4, #F6A5C0.
  - Up to 12 presets per tool. The three defaults are not removable.
  - Text colour uses the pen presets.
- **Fonts:** text fonts are `sans` (DM Sans), `serif` (Lora), `hand` (Caveat) and `mono` (JetBrains Mono), all self-hosted via @fontsource.
- **Snap to shape:**
  - The hold trigger is 500 ms with the pointer within 4 screen px.
  - Shapes: line, rectangle, square, circle, triangle.
  - The result is an ordinary `StrokeEl`.
- **Tap to select:** a tap is movement under 6 screen px.
- **Lasso hit test:** non-stroke elements are selected if their bounds overlap the polygon at all. Strokes keep the existing ≥60%-of-points rule.
- **Images:**
  - Crop is stored as `crop?: {x,y,w,h}` in source fractions 0–1.
  - Minimum crop is 5% per axis.
- **Device storage:** localStorage keys are `ss.tools.v1` (tool settings and presets) and `ss.clipboard.v1` (clipboard). Every read and write is wrapped in try/catch, falling back to defaults.
- **Undo and saving:** every user edit is one undo step through `History`, and saves through the existing autosave path.
- **UI standards:**
  - Strings live in `src/i18n/en.ts`.
  - Touch targets are ≥44 px.
  - Use the existing tokens and components (PillButton, IconButton, Dialog).
  - Light only.
  - Must work at 390×844 and 834×1194 with no overflow.
  - Canvas chrome passes pointer events through outside its controls.
- **Loading:** pdfjs-dist is dynamically imported only when a PDF is attached. Its worker is served from the app's own origin.

## Review Focus
1. Old notes with no new fields render pixel-identically (default font, no crop). Test this with a fixture of pre-existing element JSON.
2. Slow handwriting with brief natural pauses under 500 ms, or with movement over 4 px, never triggers snap. Lifting before the ghost appears keeps the raw stroke.
3. Pixel and whole-stroke erasing across a 2,000-point stroke stays responsive: one drag is one undo step, and erase work happens only on strokes near the pointer.
4. Tap-to-select and paste ignore palm touches while the Pencil is active, the same as the existing InputRouter palm rejection.
5. Double-tapping "New page", or two tabs, never creates two "Quick notes" subjects.

---

### Task 1: Per-tool settings store and options panel (sizes)
**Files:**
- Create `src/canvas/settings/tool-settings.ts` and its test.
- Create `src/canvas/react/ToolOptions.tsx` and its test.
- Modify `src/canvas/editor.ts`, `src/canvas/react/Toolbar.tsx`, `src/canvas/react/CanvasView.tsx`, `src/canvas/tools/eraser.ts` (radius source) and `src/i18n/en.ts`.

**Interfaces (produces):**
```ts
export type StrokeToolId = "pen" | "highlighter";
export type EraserMode = "stroke" | "pixel";
export type TextFont = "sans" | "serif" | "hand" | "mono";
export type ToolSettings = {
  pen: { size: number; color: string; presets: string[]; snap: boolean };
  highlighter: { size: number; color: string; presets: string[]; snap: boolean };
  eraser: { size: number; mode: EraserMode };
  text: { size: number; color: string; font: TextFont; bold: boolean; italic: boolean; underline: boolean };
};
export const DEFAULT_SETTINGS: ToolSettings;
export const SIZE_RANGE: Record<"pen"|"highlighter"|"eraser"|"text", [min: number, max: number]>;
export function loadSettings(storage?: Pick<Storage,"getItem">): ToolSettings;
export function saveSettings(s: ToolSettings, storage?: Pick<Storage,"setItem">): void;
export function clampSize(tool: keyof typeof SIZE_RANGE, n: number): number;
```
- **Editor:** `editor.settings` (current ToolSettings), `editor.updateSettings(patch: (s) => ToolSettings)` (persists and notifies), and `editor.onSettingsChange(fn)`.
- **Pen and highlighter:** they read size and colour from the settings for their own tool.
- **Eraser:** radius = settings.eraser.size / 2 / zoom.
- **Removed:** the old single `setColor`/`setSize` and the toolbar's colour/size controls. Colours come back in Task 2.
- **Toolbar:** tapping the already-active pen, highlighter, eraser or text tool toggles `ToolOptions`, a popover under the bar with Escape, outside-click and focus return. Below lg the existing colour/size popover button is replaced by this same tool-options behaviour.
- **ToolOptions:** shows a labelled size slider (`input type=range`, min/max from SIZE_RANGE) and a number readout in px. Pen and highlighter also get a live preview dot whose diameter = size and colour = current colour.

**Tests:**
- Unit:
  - `loadSettings` returns defaults on empty or corrupt storage and on storage that throws.
  - It merges partial stored data over the defaults.
  - `clampSize` respects ranges.
  - Slider changes update `editor.settings` and persist.
  - The pen draws with the pen size and the highlighter with its own size (switching tools keeps separate sizes).
  - Eraser radius follows size and zoom.
- e2e on /dev/canvas at 834 and 390:
  - Tap Pen twice → the options open.
  - Set the slider to 12 → draw → the stroke's size is 12.
  - Escape closes the options.
  - All controls are inside the viewport and ≥44 px.

Commit `feat(canvas): per-tool settings and size slider`.

### Task 2: Colour presets and colour wheel
**Files:**
- Create `src/canvas/react/ColorWheel.tsx` (+test) and `src/canvas/color/hsv.ts` (+test).
- Modify `ToolOptions.tsx` and en.ts.

**Interfaces:**
- `hsvToHex(h,s,v): string`, `hexToHsv(hex): {h,s,v} | null` and `normalizeHex(input): string | null` (accepts `#abc`, `abc` and `#AABBCC`, and returns lowercase `#rrggbb`).
- `<ColorWheel value onChange />` has a hue ring and a saturation/value square, drawn on canvas or SVG. It works with pointer and touch (Pencil included) and the keyboard (arrow keys on focused handles), and has a hex text input.

**Behaviour:**
- ToolOptions for pen, highlighter and text shows the preset swatches (≥44 px). Text uses the pen presets.
- Tapping a swatch selects it. Tapping the already-selected swatch opens the ColorWheel inline in the popover.
- "Add to presets" appends the colour, up to 12 per tool, ignoring duplicates. A long press of 500 ms on a non-default swatch removes it, with a confirm via an aria-live message.
- The selected colour persists via the settings.

**Tests:**
- Unit:
  - hsv/hex round trips.
  - `normalizeHex` on valid and invalid input.
  - Add, dedupe, the 12 cap, and remove (defaults protected).
  - Picking from the wheel updates the current colour.
- e2e at 390: open the pen options → tap the selected swatch → type `#00aa55` in hex → Add → a new swatch exists → draw → the stroke colour is `#00aa55`.

Commit `feat(canvas): colour presets and colour wheel`.

### Task 3: Eraser modes
**Files:** modify `src/canvas/tools/eraser.ts` (+test), `ToolOptions.tsx` and en.ts.

**Behaviour:**
- **Pixel** is the existing split behaviour.
- **Stroke** deletes every stroke the eraser circle touches during the drag. It never touches text, images or cards. Both modes make one undo step per drag.
- Hit tests only query `scene.getVisible` around each segment's bounds.

**Tests:**
- Stroke mode removes the whole touched stroke in one undo step, and undo restores it.
- Pixel mode is unchanged (existing tests still pass).
- A drag over a 2,000-point stroke completes under a reasonable time budget: assert at most N `eraseFromStroke` calls or a timing < 50 ms in jsdom, whichever is stable.
- ToolOptions toggles the mode (a radio group).

Commit `feat(canvas): erase whole strokes or pixels`.

### Task 4: Snap to shape
**Files:**
- Create `src/canvas/geometry/recognize-shape.ts` (+ extensive test).
- Modify `src/canvas/tools/pen.ts` and `highlighter.ts` (or their shared base), `src/canvas/view/renderer.ts` (ghost layer), `ToolOptions.tsx` (the snap switch) and en.ts.

**Interfaces:**
```ts
export type ShapeKind = "line" | "rectangle" | "square" | "circle" | "triangle";
export type RecognizedShape = { kind: ShapeKind; points: [number, number][] };
export function recognizeShape(points: [number, number][]): RecognizedShape | null;
```
- The output points are a densified clean outline in world coordinates, closed for closed shapes, with points spaced at most about 4 world units apart so perfect-freehand renders crisp edges.
- **Fitting rules:**
  - A line is near-collinear by RMS distance relative to length.
  - Closed shapes need the end near the start (within 20% of the bbox diagonal).
  - Circle when the radial deviation is low. A near-equal-axis ellipse becomes a circle; otherwise it is not recognised.
  - Corner detection splits rectangle/square (4 corners) from triangle (3).
  - Square when the aspect ratio is within 10%.
  - Rectangles are axis-aligned to the stroke's dominant orientation (rotation allowed).
  - Return null when there is no confident fit.
- **Hold detection** in the stroke tool:
  - With `settings[tool].snap` on, after each move, if the pointer has stayed within 4 screen px for 500 ms (timer reset on movement beyond the threshold), compute `recognizeShape`. If non-null, set a ghost (renderer draws the shape outline in the stroke colour at 40% alpha, plus a dashed hint).
  - Further movement beyond 4 px clears the ghost and resumes drawing.
  - `up()` with a ghost commits a StrokeEl whose points are the shape points (pressure 0.5, `simulatePressure: false`) instead of the raw points.
  - Timers use an injectable clock for tests.

**Tests:**
- Recogniser fixtures with jittered synthetic inputs: line, rectangle, rotated rectangle, square, circle, triangle, a squiggle → null, handwriting "a" → null, an open U → null.
- Tool tests with a fake clock:
  - A hold shows the ghost.
  - Moving clears it.
  - Lifting commits the shape.
  - Lifting before 500 ms commits the raw stroke.
  - Snap off never ghosts.
  - Slow handwriting with 300 ms pauses never ghosts.
- One undo step.

Commit `feat(canvas): snap to shape`.

### Task 5: New page in one tap
**Files:**
- Modify `src/features/library/actions.ts` (+test), `src/features/dashboard/Dashboard.tsx` (+test), `src/ui/AppRail.tsx` (+test) and en.ts.
- Create `src/features/library/quick-notes.ts` (+test).
- Update e2e/dashboard.spec.ts and e2e/shell.spec.ts.

**Interfaces:**
- `ensureQuickNotebook(supabase, ownerId): Promise<string>` returns the notebook id.
  - It finds the subject named exactly "Quick notes" owned by the user, oldest first, else inserts it with colour lavender.
  - It then finds or creates its notebook "Pages".
  - It is race-safe: after insert, it re-selects oldest-first and uses that, deleting its own duplicate if one was created.
- `createQuickPageAction(): Promise<void>` ensures the notebook, inserts a page titled with a localised date ("Page · 25 Nov"), then `redirect('/app/p/<id>')`.

**UI:**
- A "New page" PillButton (dark, plus icon) in the dashboard header next to the search.
- A rail item "New page" (plus icon) above the nav items on laptop and first in the phone bottom bar.
- The rail must still fit 320 px: if needed, merge Home and Subjects into one Home item, since they point to the same place, and say so in the report.
- Both use a `<form action={createQuickPageAction}>` with a pending state that disables the button (prevents double submit).

**Tests:**
- Unit for `ensureQuickNotebook` with a fake supabase: creates when missing, reuses when present, dedupes on a simulated race.
- Dashboard renders the button.
- The rail at 320 px still fits (shell e2e).
- e2e (dev routes) asserts the button and rail item exist and are ≥44 px. Live creation is covered by the integration test that skips without Supabase env.

Commit `feat(library): new page in one tap`.

### Task 6: PDF first-page thumbnail
**Files:**
- Create `src/canvas/attachments/pdf-thumbnail.ts` (+test with mocked pdfjs).
- Modify `src/canvas/tools/insert-file.ts` (+test), `src/canvas/model/types.ts` (`FileEl.thumbPath?: string`), `src/canvas/react/FileCards.tsx` and `next.config` if needed to serve the pdf.js worker.
- Add the pdfjs-dist dependency.

**Interfaces:** `renderPdfThumbnail(file: Blob, maxWidth = 480): Promise<Blob | null>`.
- It dynamically imports pdfjs-dist, renders page 1 to a canvas at `maxWidth` CSS width (scaled for the aspect ratio) and returns a PNG/JPEG blob.
- It returns null on any error or after an 8 s timeout.

**Behaviour:**
- For `application/pdf`, insert-file uploads the thumbnail to `{owner}/{page}/{uuid}.thumb.jpg` after the main file and sets `thumbPath` on the element as one update.
- A thumbnail failure leaves the card as today.
- FileCards shows the thumbnail (object-cover, top-aligned, rounded) above the file name when `thumbPath` exists. It is loaded via the existing signed-URL helper, with the icon as fallback on error.

**Tests:**
- A thumbnail is generated and the path set (mocked pdfjs and storage).
- A failure keeps the card without a thumbnail.
- Non-PDFs never call pdfjs.
- FileCards renders an img when `thumbPath` is set and the icon when not.
- e2e: the dev canvas with a demo file element that has a thumbnail renders the image.

Commit `feat(canvas): pdf first-page thumbnail`.

### Task 7: Lasso — select everything, tap to select, context menu, copy and paste
**Files:**
- Modify `src/canvas/tools/lasso.ts` (+test), `src/canvas/selection.ts` (+test), `src/canvas/editor.ts` and `src/canvas/react/SelectionMenu.tsx` (+test).
- Create `src/canvas/clipboard.ts` (+test).
- Modify en.ts.

**Behaviour:**
- **Hit test:** non-stroke elements are selected when their bounds intersect the polygon. That is any polygon vertex inside the bounds, any bounds corner inside the polygon, or any polygon edge crossing a bounds edge.
- **Tap to select:** a lasso down/up with movement under 6 screen px selects the topmost element whose hit area contains the point. Strokes are hit within max(size/2, 8 screen px) of their path; others within their bounds. A tap on empty space clears the selection, or, if the clipboard is non-empty, opens a menu with Paste at that point.
- **Paste after an empty lasso:** a lasso that selects nothing shows Paste (when the clipboard is non-empty), anchored at the lasso's bounds centre.
- **SelectionMenu:**
  - Strokes only: Delete, Colour, Copy.
  - One image: Resize (shows handles — existing image-resize), Crop (Task 9 wires it; hide until then), Delete, Copy.
  - One text: Edit (opens TextEditorOverlay), Delete, Copy.
  - Mixed: Delete, Copy.
- **Colour:** recolours all selected strokes (pen presets and wheel from Task 2) as one undo step.
- **Clipboard:** `copy(elements)` stores deep copies, normalised relative to the bounds' top-left, in memory and in `ss.clipboard.v1`. `paste(at)` inserts copies with new ids and z at the top, offset so the bounds centre lands at `at`, as one undo step, and selects them.
- **Palm rejection:** palm touches are ignored per InputRouter.

**Tests:**
- A lasso partly over an image or text selects it.
- A tap selects the topmost element.
- A tap on empty space with the clipboard shows Paste.
- Copy → paste creates new ids at the right spot.
- Recolour is one undo step.
- The menu shows the correct actions per selection type.
- The clipboard survives a reload (storage) and handles corrupt storage.
- e2e at 834: insert a demo image → lasso partly over it → the menu shows Resize/Delete/Copy → Copy → tap empty space → Paste → two images.

Commit `feat(canvas): lasso selects everything, tap to select, copy and paste`.

### Task 8: Text styles
**Files:**
- Modify `src/canvas/model/types.ts` (TextEl gains optional `font?: TextFont; bold?: boolean; italic?: boolean; underline?: boolean`), `src/canvas/tools/text.ts` (+test), `src/canvas/model/wrap-text.ts`, `src/canvas/view/renderer.ts`, `src/canvas/react/TextEditorOverlay.tsx`, `ToolOptions.tsx`, `src/app/layout.tsx` (font imports) and en.ts.
- Add @fontsource dependencies.

**Behaviour:**
- New text boxes take font, size, colour, bold, italic and underline from `settings.text`.
- With a text box selected or being edited, changing an option in ToolOptions (or in the selection menu's Edit state) updates that box as one undo step.
- The renderer and wrap-text build the canvas font string from the fields: missing fields mean sans, normal weight, no underline (exactly today's output). Underline is drawn as a line under each wrapped line.
- The overlay textarea uses the same CSS font so typing matches the render.
- Fonts are awaited (`document.fonts.load`) before measuring, with a re-layout after load.

**Tests:**
- The font-string builder gives the defaults for a legacy TextEl, unchanged.
- Bold/italic/serif strings are correct.
- New text uses the settings.
- Changing the style of a selected box is one undo step.
- Underline draws (mock ctx).
- e2e: choose serif + bold → type → the element has `font:'serif'` and `bold:true`.

Commit `feat(canvas): text fonts, sizes and styles`.

### Task 9: Image auto-select and crop
**Files:**
- Modify `src/canvas/model/types.ts` (ImageEl gains `crop?: {x:number;y:number;w:number;h:number}`), `src/canvas/tools/insert-image.ts` (+test), `src/canvas/editor.ts` and `src/canvas/view/renderer.ts`.
- Create `src/canvas/tools/image-crop.ts` (+test).
- Modify `SelectionMenu.tsx` and en.ts.

**Behaviour:**
- **After insert:** the editor switches to the lasso tool with the new image selected, so its resize handles show.
- **Crop mode** (from the menu): an overlay shows the image's crop rectangle with 4 edge and 4 corner handles (≥44 px hit areas), plus Done, Cancel and Reset.
  - Dragging adjusts the crop within the source, minimum 5% per axis.
  - Done commits `crop` and adjusts x/y/w/h so the visible region stays in place, as one undo step.
  - Reset removes `crop` and restores the full image size proportionally.
- **Renderer:** `drawImage` uses the 9-argument source-rect form when `crop` is set.
- **Hit testing and bounds:** these use the element's x/y/w/h, the visible area.

**Tests:**
- Insert selects the image.
- Crop math (handle drags clamp, minimum size, Done keeps the visible region placed).
- The renderer draws the source sub-rect for a crop (mock ctx) and the full image when there is none.
- Undo/redo of crop.
- e2e: insert a demo image → Crop → drag the right edge left → Done → the element has a crop with w < 1.

Commit `feat(canvas): image auto-select and crop`.
