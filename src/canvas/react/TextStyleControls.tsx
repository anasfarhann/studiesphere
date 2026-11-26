"use client";

import { t } from "@/i18n/en";
import type { Editor } from "../editor";
import { FONT_FAMILY, TEXT_FONTS } from "../model/text-style";
import type { TextFont } from "../settings/tool-settings";
import { useTextStyle } from "./useTextStyle";

const FONT_LABEL = { sans: "fontSans", serif: "fontSerif", hand: "fontHand", mono: "fontMono" } as const;

type Toggle = "bold" | "italic" | "underline";
const TOGGLES: { key: Toggle; label: "textBold" | "textItalic" | "textUnderline"; glyph: string; className: string }[] = [
  { key: "bold", label: "textBold", glyph: "B", className: "font-bold" },
  { key: "italic", label: "textItalic", glyph: "I", className: "italic" },
  { key: "underline", label: "textUnderline", glyph: "U", className: "underline" },
];

/** Font picker (each name set in its own font) and Bold / Italic / Underline toggles for text. */
export function TextStyleControls({ editor }: { editor: Editor }) {
  const style = useTextStyle(editor);

  // The box first (so the options reflect it), then the settings used for the next new box.
  const setFont = (font: TextFont) => {
    editor.restyleText({ font });
    editor.updateSettings((cur) => ({ ...cur, text: { ...cur.text, font } }));
  };
  const toggle = (key: Toggle) => {
    const value = !style[key];
    editor.restyleText({ [key]: value });
    editor.updateSettings((cur) => ({ ...cur, text: { ...cur.text, [key]: value } }));
  };

  return (
    <div className="flex flex-col gap-1">
      <div role="radiogroup" aria-label={t("textFont")} className="grid grid-cols-4 gap-1">
        {TEXT_FONTS.map((f) => (
          <button
            key={f}
            type="button"
            role="radio"
            aria-checked={style.font === f}
            onClick={() => setFont(f)}
            style={{ fontFamily: FONT_FAMILY[f] }}
            className="inline-flex h-11 min-w-0 touch-manipulation cursor-pointer items-center justify-center rounded-full border border-hairline px-1 text-base text-ink aria-checked:border-ink aria-checked:bg-ink aria-checked:text-card"
          >
            {t(FONT_LABEL[f])}
          </button>
        ))}
      </div>
      <div role="group" aria-label={t("textStyle")} className="flex gap-1">
        {TOGGLES.map((b) => (
          <button
            key={b.key}
            type="button"
            aria-label={t(b.label)}
            aria-pressed={style[b.key]}
            onClick={() => toggle(b.key)}
            className={`inline-flex h-11 min-w-11 flex-1 touch-manipulation cursor-pointer items-center justify-center rounded-full border border-hairline text-base text-ink aria-pressed:border-ink aria-pressed:bg-ink aria-pressed:text-card ${b.className}`}
          >
            {b.glyph}
          </button>
        ))}
      </div>
    </div>
  );
}
