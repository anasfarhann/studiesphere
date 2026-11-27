# Supabase email templates

Set these in the Supabase dashboard (Authentication → Emails → Templates). They need to match the app's routes.

## Reset Password

Use a token-hash link. It works on whichever device opens the email, unlike the default PKCE link, which only works in the browser that asked for the reset. In the template body, replace the link with:

```html
<a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/reset-password">Reset your password</a>
```

What happens next: `/auth/confirm` checks the token with `verifyOtp`. If the token is valid, it signs the user in, sets the short-lived `ss_recovery` cookie (15 minutes, httpOnly, HMAC-signed) and redirects to `/reset-password`. If the token is used or expired, `/reset-password` shows "This link has expired".

## Also check

- **Site URL:** set it to the production origin.
- **Redirect URLs:** these must include `<origin>/auth/callback**` for every deployment origin. The PKCE flow (`/auth/callback?next=/reset-password`) is still the `redirectTo` fallback.
- **Server env:** set `RECOVERY_COOKIE_SECRET` (a long random string) on the server. Without it, the app derives a secret from `SUPABASE_SERVICE_ROLE_KEY`. If neither is set, no recovery cookie is issued and the reset form stays locked (fail closed).
- **Secure password change:** consider turning on "Secure password change" (Authentication → Providers → Email). The `/reset-password` gate is enforced in the app, but `updateUser` can still be called directly with any session. That setting makes Supabase require a recent sign-in or a recovery for the change.
