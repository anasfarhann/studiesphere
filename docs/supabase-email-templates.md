# Supabase email templates

The templates live in the Supabase dashboard (Authentication → Emails → Templates). They have to match the app's routes.

## Reset Password

**The default template works on any device. You don't need to change anything.** This matters on Supabase's free built-in email sender, which doesn't let you edit templates.

How it works:

1. The forgot-password form asks for the email with a throwaway **implicit-flow** client, using `redirectTo = <origin>/auth/recovery`. The default `{{ .ConfirmationURL }}` link goes to Supabase's verify endpoint. That endpoint redirects to `/auth/recovery#access_token=…&refresh_token=…&type=recovery`, or to `#error=…&error_code=otp_expired…` when the link is used or expired. Implicit flow doesn't need anything stored in the browser that asked for the link. PKCE does, which is why the old links failed on other devices.
2. `/auth/recovery` reads the URL fragment and removes it from the address bar and history straight away. It then POSTs the tokens as JSON to `/auth/recovery/session`. Browsers never send the fragment to a server, so the tokens don't show up in request logs.
3. `/auth/recovery/session` accepts only same-origin JSON POSTs. It calls `setSession`, which checks the tokens with Supabase and writes the session cookies. It then checks the verified JWT claims for a `recovery` amr from the last 15 minutes. If the check passes, it sets the short-lived `ss_recovery` cookie (15 minutes, httpOnly, HMAC-signed). If it fails, it signs the session out again and returns 403.
4. Every outcome ends on `/reset-password`. That page shows the form when the recovery cookie is valid, and "This link has expired" otherwise. The form also shows the email of the account being reset ("Choosing a new password for …"). This is there because of login CSRF: someone could send you a link with *their* recovery tokens, which would sign you into *their* account.

### Optional: custom template (token-hash link)

If you move to a custom SMTP sender and can edit templates, a token-hash link also works on any device. It skips the fragment step:

```html
<a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/reset-password">Reset your password</a>
```

`/auth/confirm` checks the token with `verifyOtp` and sets the `ss_recovery` cookie. It then redirects to `/reset-password`. The PKCE route `/auth/callback?next=/reset-password` still works as a fallback for links requested in PKCE flow.

## Also check

- **Site URL:** set it to the production origin.
- **Redirect URLs:** allow `<origin>/auth/recovery` for every deployment origin. A wildcard like `<origin>/**` covers it, along with `/auth/callback` and `/auth/confirm`. Without it, Supabase quietly falls back to the Site URL.
  - **Symptom:** clicking the reset link opens the home page (with `#access_token=…` in the address bar) and nothing happens. There is no reset form and no error. Add the redirect URL and request a new link: the old link has already been used.
- **Server env:** set `RECOVERY_COOKIE_SECRET` (a long random string) on the server. Without it, the app derives a secret from `SUPABASE_SERVICE_ROLE_KEY`. If neither is set, no recovery cookie is issued and the reset form stays locked (fail closed).
- **Secure password change:** consider turning on "Secure password change" (Authentication → Providers → Email). The app enforces the `/reset-password` gate, but anyone with a session can still call `updateUser` directly. That setting makes Supabase require a recent sign-in or a recovery before it changes the password.
