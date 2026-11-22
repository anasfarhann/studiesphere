export const en = {
  appName: "Studiesphere",
  tagline: "Notes, recordings and study tools in one place.",
  signIn: "Sign in",
} as const;

export function t(key: keyof typeof en): string {
  return en[key];
}
