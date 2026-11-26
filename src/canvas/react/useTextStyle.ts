"use client";

import { useEffect, useState } from "react";
import type { TextFont } from "../settings/tool-settings";
import type { Editor } from "../editor";

export type TextStyleView = { size: number; color: string; font: TextFont; bold: boolean; italic: boolean; underline: boolean };

function read(editor: Editor): TextStyleView {
  const target = editor.textStyle();
  if (target) {
    return {
      size: target.fontSize, color: target.color, font: target.font ?? "sans",
      bold: !!target.bold, italic: !!target.italic, underline: !!target.underline,
    };
  }
  const { size, color, font, bold, italic, underline } = editor.settings.text;
  return { size, color, font, bold, italic, underline };
}

/**
 * The text style the options show: that of the text box being typed in, edited or selected, otherwise
 * the settings used for the next new box.
 */
export function useTextStyle(editor: Editor): TextStyleView {
  const [view, setView] = useState(() => read(editor));
  useEffect(() => {
    const sync = () =>
      setView((cur) => {
        const next = read(editor);
        return JSON.stringify(cur) === JSON.stringify(next) ? cur : next;
      });
    sync();
    const offs = [editor.onSettingsChange(sync), editor.onSelectionChange(sync), editor.text.onChange(sync)];
    return () => offs.forEach((off) => off());
  }, [editor]);
  return view;
}
