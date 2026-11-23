/** The six subject pastels from the design, each with a stronger dot colour for chips and legends. */
export const PASTELS = [
  { id: "pink", hex: "#F6CFCF", dot: "#E8A3A3" },
  { id: "peach", hex: "#F9DFC0", dot: "#E9B77F" },
  { id: "lavender", hex: "#DCD6FA", dot: "#A99CEB" },
  { id: "mint", hex: "#C9EEDB", dot: "#7FCBA4" },
  { id: "sky", hex: "#CFE3F7", dot: "#8DB9E6" },
  { id: "butter", hex: "#F4EBB5", dot: "#D9C85E" },
] as const;

// Subject colours stored before the new look (see features/library/colors.ts).
const LEGACY: Record<string, string> = {
  "#2563eb": "#CFE3F7", // blue -> sky
  "#16a34a": "#C9EEDB", // green -> mint
  "#d97706": "#F9DFC0", // amber -> peach
  "#dc2626": "#F6CFCF", // red -> pink
  "#7c3aed": "#DCD6FA", // purple -> lavender
  "#0d9488": "#C9EEDB", // teal -> mint
};

/** Map a stored subject colour (legacy or pastel) to the pastel to display. */
export function toPastel(stored: string): string {
  const key = stored.toLowerCase();
  const pastel = PASTELS.find((p) => p.hex.toLowerCase() === key);
  return pastel?.hex ?? LEGACY[key] ?? PASTELS[0].hex;
}
