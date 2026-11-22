export const en = {
  appName: "Studiesphere",
  tagline: "Notes, recordings and study tools in one place.",
  signIn: "Sign in",
  signUp: "Sign up",
  signOut: "Sign out",
  email: "Email",
  password: "Password",
  signInTitle: "Sign in to Studiesphere",
  signUpTitle: "Create your account",
  noAccountYet: "No account yet? Sign up",
  haveAccount: "Already have an account? Sign in",
  invalidCredentials: "Email or password is incorrect",
  weakPassword: "Choose a stronger password (at least 8 characters)",
  rateLimited: "Too many attempts. Please wait a few minutes and try again.",
  userAlreadyExists: "An account with this email already exists",
  invalidEmail: "Enter a valid email address",
  networkError: "Can't reach the server. Check your connection and try again.",
  authGenericError: "Something went wrong. Please try again.",
  checkYourEmail: "Check your email to confirm your account",
  appHomeTitle: "Your notebooks",
} as const;

export function t(key: keyof typeof en): string {
  return en[key];
}
