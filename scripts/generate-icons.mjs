// Regenerates the app icons from the Orbit S mark: `node scripts/generate-icons.mjs`.
// Geometry and colours mirror src/ui/Logo.tsx (keep them in step). Outputs are committed.
import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";

const CREAM = "#F6F2EE";
const STOPS = [["0", "#D9D2FF"], ["0.5", "#A597F4"], ["1", "#6E5CD8"]];
const strokeFor = (px) => (px <= 16 ? 15 : px <= 32 ? 13 : px <= 48 ? 12 : 11);

/** The mark in its own 0..100 coordinate space, scaled to `markPx` and centred on a `canvas` square. */
function markGroup(canvas, markPx) {
  const s = markPx / 100;
  const o = (canvas - markPx) / 2;
  const w = strokeFor(markPx);
  return `<g transform="translate(${o} ${o}) scale(${s})">
    <defs><linearGradient id="g" x1="82" y1="12" x2="18" y2="88" gradientUnits="userSpaceOnUse">${STOPS.map(
      ([off, c]) => `<stop offset="${off}" stop-color="${c}"/>`,
    ).join("")}</linearGradient></defs>
    <circle cx="50" cy="50" r="40" fill="none" stroke="url(#g)" stroke-width="${w}"/>
    <path d="M50 10 A20 20 0 0 0 50 50 A20 20 0 0 1 50 90" fill="none" stroke="url(#g)" stroke-width="${w}" stroke-linecap="butt"/>
  </g>`;
}

/** Cream square (optionally rounded) with the mark at ~62 % (inside the maskable 80 % safe zone). */
function iconSvg(size, { radius = 0, scale = 0.62 } = {}) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${radius}" fill="${CREAM}"/>
  ${markGroup(size, Math.round(size * scale))}
</svg>
`;
}

/** Favicon frames: transparent, mark filling the frame (the ring's outer edge sits ~4 % in). */
function faviconSvg(size) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${markGroup(size, size)}</svg>`;
}

const png = (svg, size) => new Resvg(svg, { fitTo: { mode: "width", value: size } }).render().asPng();

/** ICO container holding PNG frames (supported by every current browser). */
function ico(frames) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(frames.length, 4);
  const dir = Buffer.alloc(16 * frames.length);
  let offset = 6 + dir.length;
  frames.forEach(({ size, data }, i) => {
    const e = i * 16;
    dir.writeUInt8(size >= 256 ? 0 : size, e);
    dir.writeUInt8(size >= 256 ? 0 : size, e + 1);
    dir.writeUInt8(0, e + 2);
    dir.writeUInt8(0, e + 3);
    dir.writeUInt16LE(1, e + 4);
    dir.writeUInt16LE(32, e + 6);
    dir.writeUInt32LE(data.length, e + 8);
    dir.writeUInt32LE(offset, e + 12);
    offset += data.length;
  });
  return Buffer.concat([header, dir, ...frames.map((f) => f.data)]);
}

const out = (p, data) => {
  writeFileSync(p, data);
  console.log(`wrote ${p}`);
};

const anySvg = iconSvg(512, { radius: 112 });
const maskableSvg = iconSvg(512);
out("public/icons/icon.svg", anySvg);
out("public/icons/icon-maskable.svg", maskableSvg);
// Install icons use a full-bleed square: Android/iOS apply their own mask and corner radius.
out("public/icons/icon-192.png", png(iconSvg(192), 192));
out("public/icons/icon-512.png", png(iconSvg(512), 512));
out("public/icons/icon-maskable-512.png", png(maskableSvg, 512));
out("public/icons/apple-touch-icon.png", png(iconSvg(180), 180));
out("src/app/favicon.ico", ico([16, 32, 48].map((size) => ({ size, data: png(faviconSvg(size), size) }))));
