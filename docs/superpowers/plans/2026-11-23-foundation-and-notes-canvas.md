# Study App — Foundation and Notes Canvas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship an installable web app where a student signs in, organises subjects → notebooks → pages, and takes handwritten, typed, photo, voice and file notes on a custom infinite canvas that autosaves.

**Architecture:** Next.js (App Router) web app installable to the iPad home screen, backed by Supabase (auth, Postgres with row-level security, storage). The canvas is a framework-free TypeScript engine (`src/canvas/`) — scene model, camera, renderer, input router, tools, persistence — mounted by one React component. Canvas data is stored one row per element so two devices editing the same page never overwrite each other's strokes.

**Tech Stack:** Next.js (latest stable, App Router), TypeScript strict, pnpm, Supabase (`@supabase/supabase-js`, `@supabase/ssr`), `perfect-freehand` (ink), `rbush` (spatial index), `idb-keyval` (offline save queue), Vitest + Testing Library, Playwright, Tailwind CSS, Vercel, GitHub Actions.

**Spec:** All-in-One Study App — Design, https://claude.ai/artifact/7DMrtbMkCzkoz5kCVHCCtk (2026-11-23)

## Roadmap (this plan = phases 1 and 2)

| Phase | Plan | Status |
|---|---|---|
| 1 Foundation | this plan, Tasks 1–6 | detailed below |
| 2 Notes canvas | this plan, Tasks 7–19, in three releases (2a, 2b, 2c) | detailed below |
| 3 Timetable | own plan, written after phase 2 ships | later |
| 4 Flashcards | own plan | later |
| 5 Quiz rooms | own plan | later |
| 6 Launch (plans, payments, privacy, load test) | own plan | later |
| After launch: PDF annotation, App Store wrapper, offline mode, AI | own plans | later |

## Global Constraints

- Works in Safari on iPadOS (latest two major versions) with Apple Pencil, and in current Chrome, Edge and Safari on laptops.
- Canvas is custom-built. No tldraw or Excalidraw. Allowed canvas libraries: `perfect-freehand`, `rbush`.
- TypeScript `strict: true`; no `any` in `src/canvas/`.
- Every user-data table has `owner_id uuid not null references auth.users` and RLS policies `owner_id = auth.uid()` for select/insert/update/delete.
- Autosave: a change reaches the server within 2 s of the last edit while online; nothing is lost if the tab closes or the connection drops ("short drop-outs tolerated").
- Organising unit: subject → notebooks → pages; one infinite canvas per page.
- Free-plan limits (recorded now, enforced in phase 6): 3 notebooks, 500 MB storage. Single attachment limit: 50 MB (Claude's call).
- English UI; every user-facing string lives in `src/i18n/en.ts` so other languages can be added.
- The owner creates every account that needs a sign-in (GitHub, Supabase, Vercel). Claude never enters passwords, keys from the owner's accounts go only into `.env.local` and Vercel settings, never into git.

## Review Focus

1. **Palm resting on the iPad while writing with the Pencil** → no stray marks; fingers pan/zoom. Test: Task 10 `input-router.test.ts` "touch never draws once a pen has been seen".
2. **Tab closed or connection lost seconds after a stroke** → the stroke is still there next time. Test: Task 12 `autosave.test.ts` "flushes on hide" and "queues while offline and replays".
3. **Same page open on iPad and laptop** → strokes from both survive; one device never wipes the other. Test: Task 12 `autosave.test.ts` "saves only changed elements, never the whole page".
4. **Very large page (10,000 strokes)** → zoom and pan stay smooth because only visible elements are drawn. Test: Task 7 `scene.test.ts` "getVisible over 10k elements under 5 ms".
5. **Oversized attachment or long recording** (e.g. 200 MB video, 30-minute recording) → refused or compressed with a clear message, never a silent failure. Test: Task 16/18 `attachments.test.ts` "rejects files over 50 MB"; Task 17 "picks a mime type Safari supports".

---

## Phase 1 — Foundation

### Task 1: Project scaffold, tooling and CI

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `vitest.config.ts`, `playwright.config.ts`, `tailwind` config, `.github/workflows/ci.yml`, `.env.example`, `src/app/layout.tsx`, `src/app/page.tsx`, `src/i18n/en.ts`
- Test: `e2e/home.spec.ts`, `src/i18n/en.test.ts`

**Interfaces:**
- Produces: `t(key: keyof typeof en): string` in `src/i18n/en.ts`; scripts `pnpm dev`, `pnpm test` (Vitest), `pnpm e2e` (Playwright), `pnpm lint`, `pnpm typecheck`.

- [ ] **Step 1:** `pnpm create next-app` with TypeScript, App Router, Tailwind, ESLint, `src/` dir; add Vitest, Testing Library, Playwright.
- [ ] **Step 2: Write failing tests**

```ts
// e2e/home.spec.ts
test('landing page shows app name and sign-in link', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'StudyNest' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login');
});
// src/i18n/en.test.ts
it('returns the string for a key', () => expect(t('appName')).toBe('StudyNest'));
```
Working name "StudyNest" is a placeholder (Claude's call); the owner can rename by editing `en.ts`.
- [ ] **Step 3:** Run `pnpm test && pnpm e2e` → FAIL.
- [ ] **Step 4:** Implement `en.ts` (`appName`, `signIn`, …) and the landing page.
- [ ] **Step 5:** Run `pnpm test && pnpm e2e && pnpm typecheck && pnpm lint` → all PASS.
- [ ] **Step 6:** CI workflow runs lint, typecheck, test, e2e on push. Commit `chore: scaffold Next.js app with tests and CI`.

### Task 2: Database schema and row-level security

**Owner action first:** create a free Supabase project (Claude gives click-by-click steps), paste the project URL, anon key and service-role key into `.env.local`.

**Files:**
- Create: `supabase/migrations/0001_init.sql`, `src/lib/supabase/client.ts`, `src/lib/supabase/server.ts`, `src/lib/supabase/types.ts` (generated)
- Test: `tests/integration/rls.test.ts`

**Interfaces:**
- Produces tables:
  - `profiles(id uuid pk references auth.users, display_name text, plan text not null default 'free', created_at timestamptz default now())`, auto-created by trigger on sign-up
  - `subjects(id uuid pk, owner_id, name text not null, color text not null, sort_order int not null default 0, created_at)`
  - `notebooks(id uuid pk, owner_id, subject_id uuid references subjects on delete cascade, title text not null, created_at, updated_at)`
  - `pages(id uuid pk, owner_id, notebook_id uuid references notebooks on delete cascade, title text not null default 'Untitled', sort_order int not null default 0, created_at, updated_at)`
  - `canvas_elements(id uuid pk, owner_id, page_id uuid references pages on delete cascade, type text not null, data jsonb not null, z double precision not null, deleted boolean not null default false, updated_at timestamptz not null)`; index on `(page_id, deleted)`
  - storage bucket `attachments`, private, object path `{owner_id}/{page_id}/{uuid}.{ext}`, policy: first path segment = `auth.uid()`
- Produces: `createBrowserClient()` and `createServerClient()` helpers.

- [ ] **Step 1: Write failing test** (skipped automatically when `SUPABASE_SERVICE_ROLE_KEY` is unset)

```ts
it('a user cannot read or write another user\'s rows', async () => {
  const a = await signedInClient('a'); const b = await signedInClient('b');
  const { data: s } = await a.from('subjects').insert({ name: 'Bio', color: '#4f8' }).select().single();
  expect((await b.from('subjects').select().eq('id', s!.id)).data).toEqual([]);
  expect((await b.from('subjects').update({ name: 'x' }).eq('id', s!.id).select()).data).toEqual([]);
});
it('a user cannot upload into another user\'s storage folder', …);
```
- [ ] **Step 2:** Run `pnpm test tests/integration` → FAIL (tables missing).
- [ ] **Step 3:** Write migration with tables, RLS enabled on every table, policies per Global Constraints, profile trigger, bucket + policy. Apply with `supabase db push`.
- [ ] **Step 4:** Generate types; run tests → PASS.
- [ ] **Step 5:** Commit `feat: database schema with row-level security`.

### Task 3: Sign up, sign in, sign out

**Files:**
- Create: `src/app/(auth)/login/page.tsx`, `src/app/(auth)/signup/page.tsx`, `src/app/auth/callback/route.ts`, `src/middleware.ts`, `src/app/(app)/layout.tsx`
- Test: `e2e/auth.spec.ts`

**Interfaces:**
- Consumes: Supabase helpers (Task 2).
- Produces: every route under `/app` requires a session; `getUser(): Promise<User>` server helper in `src/lib/auth.ts`.

- [ ] **Step 1: Write failing e2e tests:** "signing up with email and password lands on /app", "visiting /app signed out redirects to /login", "wrong password shows 'Email or password is incorrect'", "sign out returns to /".
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement email + password auth with Supabase; email confirmation off in dev, on in production (owner toggles in Supabase).
- [ ] **Step 4:** Run → PASS. Commit `feat: email sign-up and sign-in`.

### Task 4: Subjects, notebooks and pages

**Files:**
- Create: `src/features/library/repo.ts`, `src/features/library/memory-repo.ts`, `src/features/library/supabase-repo.ts`, `src/app/(app)/app/page.tsx` (subject list), `src/app/(app)/app/s/[subjectId]/page.tsx` (notebooks), `src/app/(app)/app/n/[notebookId]/page.tsx` (pages)
- Test: `src/features/library/repo.test.ts`, `e2e/library.spec.ts`

**Interfaces:**
- Produces:
```ts
interface LibraryRepo {
  listSubjects(): Promise<Subject[]>;
  createSubject(input: { name: string; color: string }): Promise<Subject>;
  renameSubject(id: string, name: string): Promise<void>;
  deleteSubject(id: string): Promise<void>;
  listNotebooks(subjectId: string): Promise<Notebook[]>;
  createNotebook(subjectId: string, title: string): Promise<Notebook>;
  listPages(notebookId: string): Promise<Page[]>;
  createPage(notebookId: string): Promise<Page>; // title 'Untitled', sort_order = last + 1
}
```
`Subject`, `Notebook`, `Page` types in `src/features/library/types.ts` mirror the Task 2 tables.

- [ ] **Step 1: Write failing repo tests** (run against `MemoryLibraryRepo`): creating a subject returns it in `listSubjects`; `createPage` twice gives sort_order 0 then 1; deleting a subject removes its notebooks; empty subject name throws `'Name is required'`.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement memory and Supabase repos (same interface). **Step 4:** Run → PASS.
- [ ] **Step 5: Write failing e2e:** create subject "Biology" (pick a colour) → open it → create notebook "Cells" → create page → lands on `/app/p/<pageId>`.
- [ ] **Step 6:** Build the three list screens (large touch targets, ≥ 44 px). Run → PASS. Commit `feat: subjects, notebooks and pages`.

### Task 5: Installable on iPad

**Files:**
- Create: `src/app/manifest.ts`, `public/icons/*` (192, 512, maskable, apple-touch-icon 180)
- Modify: `src/app/layout.tsx` (apple-mobile-web-app meta, theme colour, viewport)
- Test: `e2e/pwa.spec.ts`

- [ ] **Step 1: Write failing test:** `/manifest.webmanifest` has `name: 'StudyNest'`, `display: 'standalone'`, `start_url: '/app'`, icons 192 and 512; page has `<link rel="apple-touch-icon">`.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** Run → PASS. Commit `feat: installable web app manifest`.

### Task 6: Deploy

**Owner action:** create GitHub repo and Vercel account, import repo into Vercel, add the three Supabase env vars in Vercel settings (Claude gives exact steps).

- [ ] **Step 1:** Push `main`; confirm Vercel build succeeds.
- [ ] **Step 2: Verify on device:** owner opens the URL in Safari on iPad → Share → Add to Home Screen → app opens full-screen, sign-up works, a subject created on iPad appears on the laptop after refresh.
- [ ] **Step 3:** Record the production URL in `README.md`. Commit `docs: add deploy notes`.

---

## Phase 2 — Notes canvas

All canvas engine code lives in `src/canvas/` and has no React imports except `src/canvas/react/CanvasView.tsx`.

### Task 7: Element model and scene

**Files:**
- Create: `src/canvas/model/types.ts`, `src/canvas/model/scene.ts`, `src/canvas/model/bounds.ts`
- Test: `src/canvas/model/scene.test.ts`

**Interfaces:**
- Produces:
```ts
type Point = [x: number, y: number, pressure: number];
type Base = { id: string; z: number; updatedAt: number };
type StrokeEl = Base & { type: 'stroke'; tool: 'pen' | 'highlighter'; color: string; size: number; points: Point[]; simulatePressure: boolean };
type TextEl = Base & { type: 'text'; x: number; y: number; w: number; text: string; fontSize: number; color: string };
type ImageEl = Base & { type: 'image'; x: number; y: number; w: number; h: number; assetPath: string };
type AudioEl = Base & { type: 'audio'; x: number; y: number; assetPath: string; durationMs: number };
type FileEl = Base & { type: 'file'; x: number; y: number; assetPath: string; fileName: string; mime: string; bytes: number };
type CanvasElement = StrokeEl | TextEl | ImageEl | AudioEl | FileEl;
type Rect = { minX: number; minY: number; maxX: number; maxY: number };

function boundsOf(el: CanvasElement): Rect;               // strokes padded by size/2
class Scene {
  constructor(elements?: CanvasElement[]);
  add(el: CanvasElement): void;  update(id: string, patch: Partial<CanvasElement>): void;  remove(id: string): void;
  get(id: string): CanvasElement | undefined;  all(): CanvasElement[];        // sorted by z
  getVisible(view: Rect): CanvasElement[];                                     // rbush query, sorted by z
  nextZ(): number;
  takeDirty(): { upserts: CanvasElement[]; deletes: string[] };               // clears dirty set
  onChange(fn: () => void): () => void;
}
```
- [ ] **Step 1: Write failing tests:** add then `getVisible` returns it only when its bounds intersect the view; `update` moves it in the index; `remove` makes `takeDirty` return its id in `deletes`; `takeDirty` returns each changed element once and is empty when called again; `all()` is z-ordered; **"getVisible over 10k elements under 5 ms"** (10,000 random strokes, view covering ~2%, median of 20 runs).
- [ ] **Step 2:** Run `pnpm test src/canvas/model` → FAIL. **Step 3:** Implement with `rbush`. **Step 4:** PASS. Commit `feat(canvas): element model and scene index`.

### Task 8: Camera

**Files:** Create `src/canvas/view/camera.ts`; Test `src/canvas/view/camera.test.ts`

**Interfaces:**
```ts
class Camera {
  x: number; y: number; zoom: number;                      // world point at screen (0,0); zoom 1 = 1 world unit per CSS px
  static MIN_ZOOM = 0.1; static MAX_ZOOM = 8;
  screenToWorld(sx: number, sy: number): [number, number];
  worldToScreen(wx: number, wy: number): [number, number];
  panBy(dxScreen: number, dyScreen: number): void;
  zoomAt(sx: number, sy: number, factor: number): void;    // keeps the world point under (sx,sy) fixed; clamps zoom
  viewRect(widthPx: number, heightPx: number): Rect;
}
```
- [ ] **Step 1: Failing tests:** round-trip screen→world→screen equals input; `zoomAt(100,100,2)` keeps `screenToWorld(100,100)` unchanged; zoom clamps to 0.1 and 8; `viewRect` at zoom 2 is half the size.
- [ ] **Steps 2–4:** run FAIL → implement → PASS. Commit `feat(canvas): camera`.

### Task 9: Renderer

**Files:** Create `src/canvas/view/renderer.ts`, `src/canvas/view/stroke-path.ts`; Test `src/canvas/view/stroke-path.test.ts`, `src/canvas/view/renderer.test.ts`

**Interfaces:**
```ts
function strokeOutline(el: StrokeEl): number[][];   // perfect-freehand getStroke(points, { size, thinning: 0.6, smoothing: 0.5, streamline: 0.5, simulatePressure })
function outlineToPath(outline: number[][]): Path2D;
class Renderer {
  constructor(canvas: HTMLCanvasElement, scene: Scene, camera: Camera);
  resize(cssW: number, cssH: number, dpr: number): void;
  requestFrame(): void;                    // coalesces to one requestAnimationFrame
  setLive(stroke: StrokeEl | null): void;  // in-progress stroke drawn on top
  setSelection(ids: string[]): void;
}
```
Highlighter: `globalAlpha 0.35`, `size * 3`, drawn under pen strokes of higher z only by z order (no special blend). Path2D cached per element id, invalidated when `updatedAt` changes. Images/cards drawn as placeholders until Task 16–18.
- [ ] **Step 1: Failing tests:** `strokeOutline` of a 2-point stroke returns a closed polygon with ≥ 4 points; cache returns the same Path2D for unchanged `updatedAt` and a new one after change; renderer draws only `scene.getVisible` elements (spy on a fake 2D context via `vitest-canvas-mock`).
- [ ] **Steps 2–4:** FAIL → implement → PASS. Commit `feat(canvas): renderer with cached ink paths`.

### Task 10: Input router, pen tool and canvas screen

**Files:**
- Create: `src/canvas/input/router.ts`, `src/canvas/tools/tool.ts`, `src/canvas/tools/pen.ts`, `src/canvas/editor.ts`, `src/canvas/react/CanvasView.tsx`, `src/canvas/react/Toolbar.tsx`, `src/app/(app)/app/p/[pageId]/page.tsx`
- Test: `src/canvas/input/router.test.ts`, `src/canvas/tools/pen.test.ts`, `e2e/canvas-draw.spec.ts`

**Interfaces:**
```ts
type InputKind = 'pen' | 'touch' | 'mouse';
type Gesture = { kind: 'draw' } | { kind: 'pan' } | { kind: 'pinch' } | { kind: 'ignore' };
class InputRouter {                      // owns pen-only state
  penSeen: boolean;                      // becomes true on the first pointerType 'pen'
  penOnly: boolean | 'auto';             // default 'auto' = true once penSeen
  classify(e: { pointerType: InputKind; activeTouches: number }): Gesture;
}
type WorldPoint = Point;                 // world coordinates + pressure
type PointerInfo = { kind: InputKind; pressure: number; timeStamp: number; shiftKey: boolean };
interface Tool { id: ToolId; down(p: WorldPoint, e: PointerInfo): void; move(pts: WorldPoint[], e: PointerInfo): void; up(): void; cancel(): void; }
type ToolId = 'pen' | 'highlighter' | 'eraser' | 'lasso' | 'text' | 'hand';
class Editor {                           // wires scene, camera, renderer, router, tools, history
  constructor(canvas: HTMLCanvasElement, opts: { elements: CanvasElement[] });
  setTool(id: ToolId): void; setColor(c: string): void; setSize(s: number): void;
  destroy(): void;
  readonly scene: Scene; readonly camera: Camera;
}
```
Rules: canvas element has `touch-action: none`; use `getCoalescedEvents()` when available; pressure from Pencil, `simulatePressure: true` for mouse/touch; mouse and touch draw only when `penOnly` is false.
- [ ] **Step 1: Failing router tests:** mouse → draw; pen → draw; one touch before any pen → draw; **"touch never draws once a pen has been seen"** (one touch → pan, two touches → pinch); `penOnly=false` set manually → one touch draws again.
- [ ] **Step 2: Failing pen tests:** down/move/up adds one `StrokeEl` with all points in world coordinates and `z = scene.nextZ()`; `cancel()` adds nothing; a down/up with no movement adds a dot stroke (1 point).
- [ ] **Step 3: Failing e2e:** open a page, drag the mouse across the canvas, expect `window.__editor.scene.all().length === 1` (test hook exposed only when `NODE_ENV !== 'production'`).
- [ ] **Step 4:** Run → FAIL. **Step 5:** Implement; toolbar shows pen, 6 colours, 3 sizes. **Step 6:** Run → PASS. Commit `feat(canvas): pen drawing on page screen`.

### Task 11: Pan and zoom gestures

**Files:** Modify `src/canvas/input/router.ts`, `src/canvas/editor.ts`; Create `src/canvas/input/pinch.ts`; Test `src/canvas/input/pinch.test.ts`

**Interfaces:** `type P = [x: number, y: number]` (screen px); `pinchUpdate(prev: [P, P], next: [P, P]): { panDx: number; panDy: number; zoomFactor: number; centerX: number; centerY: number }`
Bindings: two-finger pinch/drag (touch); wheel = pan; `ctrlKey` wheel (trackpad pinch) = zoom at cursor; space+drag or hand tool = pan.
- [ ] **Step 1: Failing tests:** fingers moving apart 2× → zoomFactor 2 about their midpoint; parallel move → pure pan; zoom never exceeds Camera limits.
- [ ] **Steps 2–4:** FAIL → implement → PASS. Commit `feat(canvas): pinch, wheel and trackpad zoom`.

### Task 12: Saving — element store and autosave

**Files:** Create `src/canvas/persistence/store.ts`, `src/canvas/persistence/supabase-store.ts`, `src/canvas/persistence/memory-store.ts`, `src/canvas/persistence/autosave.ts`, `src/canvas/react/SaveStatus.tsx`; Test `src/canvas/persistence/autosave.test.ts`, `tests/integration/element-store.test.ts`

**Interfaces:**
```ts
interface ElementStore {
  load(pageId: string): Promise<CanvasElement[]>;                       // deleted = false only
  save(pageId: string, upserts: CanvasElement[], deletes: string[]): Promise<void>;  // row-level upsert; deletes set deleted = true
}
type SaveState = 'saved' | 'saving' | 'offline' | 'error';
class Autosave {
  constructor(scene: Scene, store: ElementStore, pageId: string, opts?: { debounceMs?: number /* 1500 */; queue?: OfflineQueue });
  flush(): Promise<void>;
  onState(fn: (s: SaveState) => void): () => void;
  dispose(): Promise<void>;                                              // final flush
}
type SaveBatch = { pageId: string; upserts: CanvasElement[]; deletes: string[]; queuedAt: number };
interface OfflineQueue { push(batch: SaveBatch): Promise<void>; drain(): Promise<SaveBatch[]>; }   // idb-keyval backed in browser
```
Behaviour: debounce 1500 ms after last change (meets 2 s rule); `visibilitychange` → hidden and `pagehide` trigger `flush()`; failed save → batch goes to the offline queue, state `offline`, retry with backoff 2 s, 4 s, 8 s … max 60 s and on `online` event; queued batches replay in order before new ones; conflicts resolve per element by latest `updatedAt` (server keeps the newer row: `upsert … where excluded.updated_at >= canvas_elements.updated_at`, done via an SQL function `save_elements(page uuid, rows jsonb, deleted_ids uuid[])` added in `supabase/migrations/0002_save_elements.sql`).
- [ ] **Step 1: Failing tests (fake timers, memory store):** one stroke saved once 1500 ms after last change; ten quick strokes → one save call; **"flushes on hide"**; **"queues while offline and replays"** (store throws → state `offline` → store recovers → queued batch saved before newer edits, state `saved`); **"saves only changed elements, never the whole page"** (page with 500 elements, edit 1 → save receives exactly 1 upsert); older `updatedAt` never overwrites newer (integration test against Supabase).
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement; page screen loads elements via `store.load` and shows SaveStatus ("Saved", "Saving…", "Offline — will retry"). **Step 4:** PASS. Commit `feat(canvas): autosave with offline queue`.

**Release 2a checkpoint:** deploy; owner tests on iPad: pen feel, palm on screen, pinch zoom, reload keeps notes, airplane mode for 30 s then back online keeps notes. Collect feedback; tune `thinning/smoothing/streamline` values before continuing.

### Task 13: Undo/redo, highlighter, eraser

**Files:** Create `src/canvas/model/history.ts`, `src/canvas/tools/highlighter.ts`, `src/canvas/tools/eraser.ts`, `src/canvas/geometry/split-stroke.ts`; Modify `Toolbar.tsx`; Test `history.test.ts`, `split-stroke.test.ts`, `eraser.test.ts`

**Interfaces:**
```ts
type Change = { before: CanvasElement[]; after: CanvasElement[] };   // removed = in before only; added = in after only
class History { push(c: Change): void; undo(scene: Scene): void; redo(scene: Scene): void; canUndo(): boolean; canRedo(): boolean; } // limit 200 steps per page session
function eraseFromStroke(el: StrokeEl, center: [number, number], radius: number, newId: () => string): StrokeEl[]; // [] = fully erased, [el] = untouched, else pieces
```
Eraser erases part of a stroke (splits it); one eraser drag = one undo step. Undo/redo: toolbar buttons, Cmd/Ctrl+Z, Shift+Cmd/Ctrl+Z, two-finger tap = undo.
- [ ] **Step 1: Failing tests:** undo after pen stroke removes it, redo restores it; new action after undo clears redo; erasing the middle of a straight stroke returns 2 pieces whose points all lie outside the radius; erasing nothing returns the same element; erasing everything returns `[]`; one eraser drag across 3 strokes undoes in one step.
- [ ] **Steps 2–4:** FAIL → implement → PASS. Commit `feat(canvas): undo, highlighter and partial eraser`.

### Task 14: Lasso select, move, delete

**Files:** Create `src/canvas/tools/lasso.ts`, `src/canvas/geometry/point-in-polygon.ts`, `src/canvas/selection.ts`; Test `lasso.test.ts`, `selection.test.ts`

**Interfaces:**
```ts
function elementsInLasso(scene: Scene, polygon: [number, number][]): string[]; // stroke selected when ≥ 60% of its points are inside; boxes when their centre is inside
class Selection { ids: string[]; bounds(): Rect | null; moveBy(dx: number, dy: number): Change; deleteAll(): Change; }
```
Selected items show a dashed box; drag inside it to move; floating menu: Delete, (later Task: "Make flashcard" in phase 4).
- [ ] **Step 1: Failing tests:** lasso around 2 of 3 strokes selects those 2; stroke half inside (50%) not selected; move by (10,5) shifts every point and is one undo step; delete removes and undo restores.
- [ ] **Steps 2–4:** FAIL → implement → PASS. Commit `feat(canvas): lasso selection, move and delete`.

**Release 2b checkpoint:** deploy; owner tests eraser, undo, lasso on iPad.

### Task 15: Text boxes

**Files:** Create `src/canvas/tools/text.ts`, `src/canvas/react/TextEditorOverlay.tsx`; Test `text.test.ts`, `e2e/canvas-text.spec.ts`
- Text tool tap → `<textarea>` overlay positioned via `camera.worldToScreen`, scaled by zoom; blur or Escape commits a `TextEl` (fontSize 18 world units, width 320); empty text commits nothing; double-tap an existing text box edits it; renderer wraps text to `w`.
- [ ] **Step 1: Failing tests:** commit creates one TextEl with typed text; empty commit creates none; editing updates the same id (one undo step); e2e: type "Mitochondria", reload, text present.
- [ ] **Steps 2–4:** FAIL → implement → PASS. Commit `feat(canvas): text boxes`.

### Task 16: Photo cards

**Files:** Create `src/canvas/attachments/upload.ts`, `src/canvas/attachments/compress-image.ts`, `src/canvas/tools/insert-image.ts`; Test `attachments.test.ts`, `compress-image.test.ts`

**Interfaces:**
```ts
const MAX_ATTACHMENT_BYTES = 50 * 1024 * 1024;
function uploadAttachment(file: Blob, opts: { ownerId: string; pageId: string; ext: string }): Promise<{ assetPath: string }>; // throws AttachmentError('too_large' | 'upload_failed')
function compressImage(file: File, maxDim = 2048, quality = 0.8): Promise<Blob>;   // JPEG; keeps PNG with transparency as PNG
function signedUrl(assetPath: string): Promise<string>;                            // cached 50 min (URLs valid 60 min)
```
Insert via toolbar "Photo" → file picker with `accept="image/*"` (iPad offers camera or library); image placed at viewport centre, max 480 world units wide, resizable from its corner handle; renderer draws the image once loaded, grey placeholder before.
- [ ] **Step 1: Failing tests:** **"rejects files over 50 MB"** with message "This file is larger than 50 MB"; 4000×3000 image compresses to 2048×1536; failed upload leaves no element on the canvas and shows "Couldn't upload — tap to retry".
- [ ] **Steps 2–4:** FAIL → implement → PASS. Commit `feat(canvas): photo cards`.

### Task 17: Voice recording cards

**Files:** Create `src/canvas/attachments/recorder.ts`, `src/canvas/react/AudioCard.tsx`; Test `recorder.test.ts`

**Interfaces:**
```ts
function pickAudioMime(isSupported: (m: string) => boolean): string; // order: 'audio/mp4' (Safari), 'audio/webm;codecs=opus', 'audio/webm'
class Recorder { start(): Promise<void>; stop(): Promise<{ blob: Blob; durationMs: number; mime: string }>; cancel(): void; }
```
Toolbar "Record" → recording bar with timer and Stop; max length 60 minutes (auto-stop with notice); on stop → upload → `AudioEl` card at viewport centre showing play/pause, duration; microphone permission denied → message "Allow microphone access in Settings to record".
- [ ] **Step 1: Failing tests:** **"picks a mime type Safari supports"** (only `audio/mp4` supported → returns it); no supported type → throws `'recording_unsupported'`; auto-stop fires at 60 min (fake timers); cancel uploads nothing.
- [ ] **Steps 2–4:** FAIL → implement → PASS. Commit `feat(canvas): voice recording cards`.

### Task 18: File cards

**Files:** Create `src/canvas/tools/insert-file.ts`, `src/canvas/react/FileCard.tsx`; Test extend `attachments.test.ts`
- Toolbar "File" → any file; card shows icon by mime, file name, size; tap opens `signedUrl` in a new tab; uses `uploadAttachment` and the 50 MB limit from Task 16.
- [ ] **Step 1: Failing tests:** 51 MB PDF rejected with the Task 16 message; 2 MB PDF creates one `FileEl` with name, mime, bytes.
- [ ] **Steps 2–4:** FAIL → implement → PASS. Commit `feat(canvas): file cards`.

### Task 19: Page version history

**Files:** Create `supabase/migrations/0003_page_snapshots.sql`, `src/canvas/persistence/snapshots.ts`, `src/canvas/react/HistoryPanel.tsx`; Test `snapshots.test.ts`

**Interfaces:**
- Table `page_snapshots(id uuid pk, owner_id, page_id references pages on delete cascade, elements jsonb not null, created_at)`; keep latest 30 per page (older deleted by the save function).
```ts
function maybeSnapshot(pageId: string, scene: Scene, lastSnapshotAt: number | null, now: number): Promise<number | null>; // snapshots when ≥ 60 min since last and page changed
function restoreSnapshot(snapshotId: string, scene: Scene): Change;  // replaces page content; undoable
```
- [ ] **Step 1: Failing tests:** no snapshot within 60 min of the last; snapshot after 60 min with changes; none when unchanged; restore replaces elements and undo brings back the current version; 31st snapshot removes the oldest.
- [ ] **Steps 2–4:** FAIL → implement → PASS. Commit `feat(canvas): page version history`.

**Release 2c checkpoint (phase 2 gate):** deploy; owner uses the app instead of GoodNotes for two weeks; Claude fixes reported issues before phase 3's plan is written.

---

## Owner actions, in order

1. Before Task 2: create a Supabase project, copy three keys into `.env.local`.
2. Before Task 6: create GitHub and Vercel accounts, connect them, add the keys in Vercel.
3. At each release checkpoint (after Tasks 6, 12, 14, 19): test on iPad and laptop, report what feels wrong.
