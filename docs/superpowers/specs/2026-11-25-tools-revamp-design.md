# Tools revamp and quick page — design

Approved in chat on 2026-11-25.

## Intent
Starting a note currently takes three steps: create a subject, then a notebook, then a page. The drawing tools only have preset sizes and preset colours, and the lasso misses images and text. The owner wants Studiesphere to feel as quick and flexible as GoodNotes on iPad: open a page in one tap, set exact sizes, pick any colour, snap rough shapes into neat ones, and select and edit anything on the page.

## Goals
1. **New page in one tap.** "New page" sits on the home screen and in the app rail. It opens a blank canvas immediately. The page lives in an automatic "Quick notes" subject, which holds a "Pages" notebook. Both are created on first use, and creation is idempotent (repeated or parallel taps never make two subjects). The new page appears in "Continue where you left off".
2. **PDF thumbnail.** Attaching a PDF renders its first page in the browser into a small PNG. The thumbnail is uploaded next to the file and shown on the file card. Existing cards, and PDFs that fail to render, keep the current icon.
3. **Tool options panel.** Tapping the active tool opens its options:
   - **Pen:** size 1–40 px, with a live preview dot and a "Snap to shape" switch.
   - **Highlighter:** size 4–60 px, with a "Snap to shape" switch.
   - **Eraser:** a choice of Whole stroke or Pixel, and size 4–80 px.
   - **Text:** a choice of font (DM Sans, Lora serif, Caveat handwriting, JetBrains Mono), size 12–96, and bold, italic and underline. The style applies to the whole text box.
   - **Units:** sizes are in screen pixels at 100% zoom.
   - **Persistence:** settings are remembered per tool, per device.
4. **Colours.**
   - **Defaults:** each colour tool has three default presets. Pen: #1B1A1F, #2563EB, #DC2626. Highlighter: #F4D35E, #8BE0A4, #F6A5C0.
   - **Colour wheel:** tapping the selected swatch opens a colour wheel (a hue ring with a saturation/brightness square, plus a hex input).
   - **Adding presets:** "Add to presets" appends the colour as a swatch, up to 12 per tool.
   - **Removing presets:** a long press on a custom swatch removes it. The three defaults cannot be removed.
   - **Storage:** presets are kept per device (localStorage).
   - **Text:** text colour uses the pen presets.
5. **Snap to shape** (pen and highlighter, when the switch is on).
   - **Trigger:** holding the pointer still for 500 ms at the end of a stroke shows a ghost of the best-fitting shape. "Still" means within 4 screen px.
   - **Shapes:** line, rectangle, square, circle or triangle.
   - **Keeping it:** lifting keeps the clean shape.
   - **Cancelling:** moving again cancels the ghost and drawing continues. If nothing fits well, no ghost appears.
   - **Result:** the clean shape is stored as an ordinary stroke with the same colour, size and tool, so the eraser, lasso, undo and sync all work unchanged.
6. **Lasso and tap to select.**
   - **What it can select:** the lasso selects strokes (the existing rule: 60% of points inside), plus any image, text, file or audio card whose bounds overlap the lasso polygon at all.
   - **Tap to select:** with the lasso tool active, a tap (moving less than 6 screen px) on an element selects the topmost element under the pointer.
   - **Selection menu by content:**
     - Strokes only: Delete, Colour (opens the pen colour picker and recolours all selected strokes), Copy.
     - Exactly one image: Resize (handles), Crop, Delete, Copy.
     - Exactly one text: Edit, Delete, Copy.
     - Mixed: Delete, Copy.
   - **Clipboard:** it is in-app and persists to localStorage. It survives page changes on the same device.
   - **Paste:** a lasso or tap on empty space while the clipboard is non-empty shows Paste, which places the copied elements at that spot with new ids.
7. **Images.**
   - **After insert:** a newly inserted image is selected immediately, with corner resize handles.
   - **Crop:** Crop shows draggable crop edges. It stores a non-destructive `crop` rectangle (fractions 0–1 of the source) on the element, and the renderer draws only that region. Reset restores the full image.

## Non-goals
- Writing on PDFs (parked).
- Moving pages between notebooks (next round).
- Per-word text styling.
- Syncing presets across devices.
- Shapes beyond the five listed.

## Anti-goals
- Breaking or restyling existing notes. Elements without the new fields render exactly as before.
- Any database migration.
- Snap firing during normal slow handwriting.
- Making the Apple Pencil feel laggier.

## Constraints
- The Global Constraints of the new-look plan still apply: tokens, ≥44 px targets, strings in en.ts, works at 390 and 834 px, light only.
- All new element fields are optional in the element JSON.
- Every edit is one undo step and saves through the existing autosave/LWW path.
- Fonts are self-hosted via @fontsource.
- pdf.js is loaded lazily, only when a PDF is attached.

## Approaches
There is one sensible way to build this: extend the existing custom engine (Scene, tools, renderer, Toolbar). The alternative, adopting a canvas library, was ruled out earlier because the owner wants the custom canvas.

## Left to the builder
- The shape recogniser algorithm and thresholds, within the stated behaviour.
- The colour-wheel implementation (custom canvas or SVG; no heavy dependency).
- The exact options-panel layout, within the established pill and popover style.
