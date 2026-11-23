"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { t } from "@/i18n/en";
import type { Editor } from "../editor";
import { TEXT_LINE_HEIGHT } from "../model/bounds";
import type { TextSession } from "../tools/text";

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
    ta.style.height = "auto";
    ta.style.height = `${ta.scrollHeight}px`;
  }, []);

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
      setBox({ left, top, width: s.w * z, fontSize: s.fontSize * z, session: s });
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

  const active = box !== null;
  useLayoutEffect(() => {
    const ta = ref.current;
    if (!ta) return;
    if (active) grow();
    else {
      ta.value = "";
      ta.blur();
    }
  }, [active, box?.width, box?.fontSize, grow]);

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
      onBlur={commit}
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
        fontFamily: "sans-serif",
        color: box?.session.color ?? "#000",
        whiteSpace: "pre-wrap",
        overflowWrap: "break-word",
        outline: active ? "1px dashed #2563eb" : "none",
      }}
    />
  );
}
