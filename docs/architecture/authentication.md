# Unified authentication operations

Agent Fabric directly uses Better Auth `1.6.29` for Google and email OTP. Nodemailer `9.0.5` is the SMTP transport and rate-limiter-flexible `11.2.0` stores abuse limits in MySQL. The retired hand-written Google OIDC routes and schema are not created on a fresh database; there is no dual read or account migration path.

## Required configuration

At least one login method must be configured. Every enabled configuration requires `AGENT_FABRIC_AUTH_SECRET` with at least 32 characters.

Google:

- `AGENT_FABRIC_GOOGLE_CLIENT_ID`
- `AGENT_FABRIC_GOOGLE_CLIENT_SECRET`
- optional `AGENT_FABRIC_GOOGLE_SELF_SERVICE_ALLOWED_DOMAINS`
- optional `AGENT_FABRIC_GOOGLE_SELF_SERVICE_LOGIN_LIMIT`, default `20` per hour and IP

Email OTP:

- `AGENT_FABRIC_SMTP_HOST`
- `AGENT_FABRIC_SMTP_PORT`
- `AGENT_FABRIC_SMTP_SECURE=true|false`
- `AGENT_FABRIC_SMTP_FROM`
- optional paired `AGENT_FABRIC_SMTP_USERNAME` and `AGENT_FABRIC_SMTP_PASSWORD`
- optional `AGENT_FABRIC_EMAIL_OTP_REQUEST_LIMIT_PER_HOUR`, default `6`
- optional `AGENT_FABRIC_EMAIL_OTP_VERIFY_LIMIT_PER_TEN_MINUTES`, default `10`

Production SMTP uses TLS with certificate validation, bounded connection/read timeouts and no file or URL access. Startup runs Better Auth's official MySQL migration runner. SMTP verification failure keeps the service running for Google but removes `email-otp-login` from `/v1/version`; there is no console-code or development-transport fallback.

## Security behavior

- Codes are six digits, expire after five minutes, allow three attempts and are stored hashed. Resend rotates the previous code and is limited to once per sixty seconds.
- Request and verify limits apply to both source IP and a keyed normalized-email digest in MySQL.
- Google and email identities link only through the same verified email. A changed or fan-out identity fails closed.
- Better Auth sessions and provider tokens end at the authentication broker. Desktop receives only a short-lived, PKCE-bound, one-time exchange proof, then stores the resulting device credential in Keychain.
- API errors are bounded and do not disclose whether an email already exists. Logs and Renderer snapshots must exclude email codes, provider tokens, session cookies, SMTP credentials and exchange proofs.

## Health and acceptance

Check `/ready` for database readiness and `/v1/version` for `google-account-login` and `email-otp-login`. Release acceptance requires a real inbox and two distinct Humans to prove first login, same-email Google/email convergence, invitation lookup, resend replacement, expiry, replay rejection, logout and recovery. Build or mock-only success is not production acceptance.
