# ADR 0010: Password sign-in with stateless session cookies

- Status: accepted
- Date: 2026-11-10

## Context

The dashboard and the query API (`/api/*`) had no authentication: anyone who reached the port could
read telemetry and manage API keys, and the README told operators to put an authenticating proxy in
front. A self-hosted collector usually has one operator or a small team, so a single shared password
covers most setups without a user model. Setups that are already private must keep working unchanged.

The ingest routes are authenticated by API key (ADR 0009 for the collector's own agent) and are a
contract with a third-party agent, so they stay as they are.

## Decision

**Opt-in.** `AUTH_PASSWORD` in the env turns sign-in on. Unset or empty, nothing changes.

**Stateless signed cookie.** `POST /api/auth/login` checks the password (SHA-256 of both sides compared
with `timingSafeEqual`) and sets `observe_session=<issued at ms>.<HMAC-SHA256>`: `HttpOnly`,
`SameSite=Lax`, `Path=/`, `Max-Age` = the session length, and `Secure` over HTTPS (`req.secure` or
`X-Forwarded-Proto: https`). Nothing is stored per session.

**Signing key.** `HMAC(secret, password)`, where `secret` is a random value in `auth_settings`
(single row, migration 0016). Changing the password ends every session; rotating the secret
(`POST /api/auth/sessions/revoke`, "Sign out everywhere" in Collector settings) does too, then
signs the caller in again. With a stolen cookie, nobody can brute-force the password offline
without also having the database secret.

**Session length.** `auth_settings.session_days`, default 30, 1 to 365, changed in Collector
settings (`GET`/`PATCH /api/auth/settings`). A token is valid while
`now - issuedAt < session_days` under the **current** setting, so shortening the length ends older
sessions right away. The cookie's `Max-Age` is fixed at sign-in, so a longer length only counts from
the next sign-in. Sessions don't slide: they end after the length, however active.

**Guard.** `SessionAuthGuard` is a global `APP_GUARD`: with sign-in on, every route needs a valid
cookie (401 otherwise), except those marked `@Public()`: `GET /api/health`, `GET /api/auth/session`,
`POST /api/auth/login`, `POST /api/auth/logout` and the ingest controller, which keeps its
`IngestAuthGuard`. The settings row is cached for 60 s in `Auth`, so checking a request costs no
database round trip. Changes apply at once on the instance that makes them, and other instances
pick them up within the TTL. The static dashboard and Swagger UI are not Nest routes, so they stay
reachable, but they hold no data.

**Brute force.** `LoginThrottle` counts failed sign-ins in memory per client address (`req.ip`):
after 10 in 15 minutes, sign-in answers 429 until the window ends. A success clears the count.

**CORS.** `credentials: true` with the origin reflected, so a dashboard on another port of the same
site (Vite on `localhost:5173` against `localhost:3000`) sends the cookie. `SameSite=Lax` stops
pages of other sites from sending it with their requests. The dashboard and the API must be on the
same site (e.g. `localhost` and `localhost`, not `localhost` and `127.0.0.1`).

**Dashboard.** The root route's middleware reads `GET /api/auth/session` and redirects to
`/login?next=<path>` when the user isn't signed in. Any 401 from a query or mutation does the same
(the `QueryCache`/`MutationCache` `onError` in `router.tsx`). `next` only accepts paths of the app.
Signing in or out clears the TanStack Query cache. The rail has a sign-out button, and Collector
settings has the Sign-in panel. The demo answers that sign-in is off.

## Alternatives considered

- **JWT.** It would be the same signed token in a heavier standard format. Its strengths (a
  verifier separate from the issuer, claims to carry) don't apply here. Keeping it in
  `localStorage` would expose it to XSS and would need a header on every call.
- **Sessions in the database.** Revoking one session or listing devices needs one row per session.
  A single shared password has no users to tell apart, and rotating the secret already covers
  "sign out everywhere". It would cost a lookup per request and a cleanup job.
- **HTTP Basic.** No sign-out and no page of our own. The password travels with every request,
  and Basic auth works badly with cross-origin development.

## Consequences

- One password for everyone. There are no per-user sessions or audit trail.
- A single session can't be revoked on its own. "Sign out everywhere" ends all of them.
- Behind a reverse proxy, `req.ip` is the proxy's address, so the throttle counts every client as
  one: a guessing attacker can block sign-in for everyone for 15 minutes.
- Throttle counts live in memory, per instance, and reset on restart.
