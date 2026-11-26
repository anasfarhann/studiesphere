"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { t } from "@/i18n/en";
import type { Editor } from "../editor";
import { TEXT_LINE_HEIGHT } from "../model/bounds";
import { autoTextWidth } from "../model/text-layout";
import { cssFont, fontFamily, whenFontReady } from "../model/text-style";
import type { TextSession } from "../tools/text";

/** Screen width of the box being edited: a fixed box keeps its w; an auto box fits `text` as the canvas will draw it. */
function screenWidth(editor: Editor, s: TextSession, text: string): number {
  const w = s.autoW ? autoTextWidth(editor.measureText(s), text, s.fontSize) : s.w;
  return w * editor.camera.zoom;
}

type Box = { left: number; top: number; width: number; fontSize: number; session: TextSession };

/**
 * The textarea that edits a text box in place. It is always mounted (invisible when idle) so the
 * editor can focus it synchronously from the pointer-up handler: iPad Safari only shows the
 * keyboard for focus() calls made inside a user gesture, and a React re-render would be too late.
 */
export function TextEditorOverlay({ editor }: { editor: Editor }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [box, setBox] = useState<Box | null>(null);

  const grow = useCallback(() => {
    const ta = ref.current;
    if (!ta) return;
    // An auto box widens with the text (up to the maximum, then wraps), measured with the canvas's own font.
    const s = editor.text.session;
    if (s?.autoW) ta.style.width = `${screenWidth(editor, s, ta.value)}px`;
    ta.style.height = "auto";
    ta.style.height = `${ta.scrollHeight}px`;
  }, [editor]);

  useEffect(() => {
    const ta = ref.current;
    if (!ta) return;
    editor.text.bind({
      focus: () => {
        const s = editor.text.session;
        if (s) ta.value = s.text; // set before focus so the caret lands at the end
        ta.focus({ preventScroll: true });
        ta.setSelectionRange(ta.value.length, ta.value.length);
      },
      value: () => ta.value,
    });
    return () => editor.text.bind(null);
  }, [editor]);

  useEffect(() => {
    const sync = () => {
      const s = editor.text.session;
      if (!s) {
        setBox(null);
        return;
      }
      const [left, top] = editor.camera.worldToScreen(s.x, s.y);
      const z = editor.camera.zoom;
      const typed = ref.current && document.activeElement === ref.current ? ref.current.value : s.text;
      setBox({ left, top, width: screenWidth(editor, s, typed), fontSize: s.fontSize * z, session: s });
    };
    sync();
    const offText = editor.text.onChange(sync);
    // Pan/zoom arrive through the editor's per-frame coalesced change events.
    const offView = editor.onSelectionChange(sync);
    return () => {
      offText();
      offView();
    };
  }, [editor]);

  // The face may still be loading: re-measure the textarea when it arrives.
  const faceCss = box ? cssFont(box.session, box.session.fontSize) : null;
  useEffect(() => {
    if (faceCss) whenFontReady(faceCss, grow);
  }, [faceCss, grow]);

  const active = box !== null;
  useLayoutEffect(() => {
    const ta = ref.current;
    if (!ta) return;
    if (active) grow();
    else {
      ta.value = "";
      ta.blur();
    }
  }, [active, box?.width, box?.fontSize, faceCss, grow]);

  const commit = () => editor.text.commit();

  return (
    <textarea
      ref={ref}
      data-testid="text-editor"
      aria-label={t("textBoxLabel")}
      aria-hidden={!active}
      tabIndex={active ? 0 : -1}
      rows={1}
      spellCheck
      onInput={(e) => {
        editor.text.draft(e.currentTarget.value);
        grow();
      }}
      onBlur={(e) => {
        // Moving into the text options (a size slider) must not end the edit.
        const to = e.relatedTarget;
        if (to instanceof Element && to.closest("[data-keeps-text-open]")) return;
        commit();
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape" || ((e.metaKey || e.ctrlKey) && e.key === "Enter")) {
          e.preventDefault();
          commit();
        }
      }}
      onPointerDown={(e) => e.stopPropagation()}
      className="absolute z-10 m-0 resize-none overflow-hidden border-0 bg-transparent p-0 outline-none"
      style={{
        left: box?.left ?? 0,
        top: box?.top ?? 0,
        width: box?.width ?? 1,
        height: active ? undefined : 1,
        opacity: active ? 1 : 0,
        pointerEvents: active ? "auto" : "none",
        fontSize: box?.fontSize ?? 16, // >= 16px avoids iOS focus-zoom when idle
        lineHeight: TEXT_LINE_HEIGHT,
        fontFamily: box ? fontFamily(box.session) : "sans-serif",
        fontWeight: box?.session.bold ? "bold" : "normal",
        fontStyle: box?.session.italic ? "italic" : "normal",
        textDecoration: box?.session.underline ? "underline" : "none",
        color: box?.session.color ?? "#000",
        whiteSpace: "pre-wrap",
        overflowWrap: "break-word",
        outline: active ? "1px dashed #2563eb" : "none",
      }}
    />
  );
}
