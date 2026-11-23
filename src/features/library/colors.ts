import type { en } from "@/i18n/en";
import { PASTELS } from "@/ui/pastel";

const LABELS = {
  pink: "colorPink",
  peach: "colorPeach",
  lavender: "colorLavender",
  mint: "colorMint",
  sky: "colorSky",
  butter: "colorButter",
} as const satisfies Record<string, keyof typeof en>;

/** Swatches offered for new subjects: the six design pastels (the stored value is the pastel hex). */
export const SUBJECT_COLORS: { hex: string; label: keyof typeof en }[] = PASTELS.map((p) => ({
  hex: p.hex,
  label: LABELS[p.id],
}));
