/** A stand-in page preview (480 x 360, like a real one) for the dev fixtures' layout tests. */
const svg =
  '<svg xmlns="http://www.w3.org/2000/svg" width="480" height="360" viewBox="0 0 480 360">' +
  '<rect width="480" height="360" fill="#FBF9F7"/>' +
  '<path d="M30 60c40-20 70 10 110-5s60-10 100 5" stroke="#1e3a8a" stroke-width="5" fill="none" stroke-linecap="round"/>' +
  '<path d="M30 110c50-12 90 8 140-3" stroke="#111" stroke-width="4" fill="none" stroke-linecap="round"/>' +
  '<rect x="260" y="140" width="180" height="120" rx="8" fill="#cbd5e1"/>' +
  "</svg>";
export const DEV_PREVIEW_URL = `data:image/svg+xml,${encodeURIComponent(svg)}`;
