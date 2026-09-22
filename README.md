# CRM Plus — Edit Member Level

Internal web tool for looking up a customer by phone number and changing their
member level, with an audit trail of every change.

It replaces the Google Apps Script version and is **gated behind a
username/password login** — nobody can search or change a level without
signing in first.

## Stack

- [Next.js](https://nextjs.org) 16 (App Router)
- React 19
- TypeScript
- Tailwind CSS 4
- [`jose`](https://github.com/panva/jose) for signed session cookies

## Getting started

Requires Node.js 20 or newer.

```bash
npm install
cp .env.example .env.local
```

Fill in `.env.local` (see [Authentication](#authentication)), then:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). You will land on the login
page.

## Authentication

Operators sign in with their **own Buzzebees credentials**. There is no local
user list and no admin account: whoever the Buzzebees API vouches for can sign
in, and anyone it rejects cannot.

### `SESSION_SECRET`

Signs the session cookie. At least 32 characters; the app refuses to start a
session without it.

```bash
openssl rand -base64 48
```

### Operator login

The login form asks for a username and a password, posted to Buzzebees as
`multipart/form-data`. A reply carrying a token means the operator is who they
say they are.

It used to ask for a Terminal, Branch and Brand ID as well, and remember them
in a `crmplus_pos` cookie. Single sign-on takes none of them, so the fields are
gone; the next login clears the cookie from browsers that still hold one.

Signing in is one call. `POST /auth/bzbs_login` returns two tokens: `token`,
which the CRM Plus endpoints accept, and `ewallet_token`, which customer
lookups travel with. Both are held in the session.

Which host serves that endpoint differs per deployment, so it is configured
rather than fixed:

```
BUZZEBEES_SSO_BASE_URL=https://…              # required, never defaulted
BUZZEBEES_SSO_LOGIN_PATH=/auth/bzbs_login     # the default
```

The path accepts three forms, because all three are natural things to put
there: a path, joined onto the base URL; a whole URL, used as given; or a bare
host, which gets the default path appended rather than posting to the root.

Beyond those, login needs only `BUZZEBEES_APP_ID`. **Nobody can sign in until
it is set** — `/api/health` reports this as `login.ready`.

There is no service account, and no Buzzebees credentials are configured
anywhere — only the app id and the agency.

### How it works

| Concern | Where |
| --- | --- |
| Credential check | `POST` to the configured Buzzebees login endpoint — `src/lib/buzzebees/auth.ts` |
| Session | HS256 JWT in an `HttpOnly`, `SameSite=Lax` cookie, 8-hour expiry, `Secure` in production; carries the operator, their tokens and their agency — `src/lib/auth/session.ts` |
| Route gating | `src/proxy.ts` verifies the cookie signature and redirects to `/login` |
| Authoritative check | `requireSession()` re-checks in every page and Server Action — `src/lib/auth/dal.ts` |
| Brute-force throttle | 5 failed attempts per username per 10 minutes — `src/lib/auth/rate-limit.ts` |

The proxy is a redirect convenience, not the security boundary: every Server
Action calls `requireSession()` itself, per the Next.js guidance that Proxy
should not be the only line of defence.

Only an explicit `401` or `403` from Buzzebees is treated as a wrong password.
Any other failure (unreachable service, `404` from a misconfigured
`BUZZEBEES_SSO_LOGIN_PATH`, a non-JSON reply) surfaces as a connection error, is
logged server-side with the status and body, and does **not** count against
the throttle — so a misconfigured deploy cannot masquerade as a typo.

### Debugging against the live API

Set `BUZZEBEES_LOG_CURL` to `1`, `true`, `yes` or `on` and every outgoing
Buzzebees request is echoed to the console as a `curl` command — the login
POST and the authenticated API calls alike:

```
[buzzebees:curl] POST https://sso.example.com/auth/bzbs_login (credentials masked)
curl -X POST 'https://sso.example.com/auth/bzbs_login' \
  -H 'app-id: app-test' \
  -F 'username=somchai' \
  -F 'password=***' \
  -F 'app_id=app-test' \
  -F 'os=web' \
  -F 'platform=web' \
  -F 'info={"service":"crmplus"}'
```

Passwords, `Authorization` headers and other credential fields are masked;
fill them in by hand before replaying. The masking is deliberate — the shape
of a request is what needs confirming, and a password written to a log outlives
the debugging session in whatever collects stdout. Anything other than those
four values, including unset, keeps the logging off.

Three things to know before deploying:

- The exact request and response shape of the login endpoint has **not been
  confirmed against the live service**. Token and display-name fields are read
  under the usual key spellings; confirm against the real API before relying on
  it in production.
- The login throttle is **in-memory**, so it resets on restart and is per
  instance. Move it to Redis (or similar) before running more than one
  instance.
- Sessions are stateless. Rotating `SESSION_SECRET` signs everyone out, but
  there is no way to revoke a single session before it expires.

## Activity log

Every sign-in, sign-out, search and level change is recorded by this app, as
one JSON object per line in `activity.jsonl`. The history tab reads its level
changes from it; the rest is there for whoever needs to explain what happened.

**Point `ACTIVITY_LOG_DIR` at a mounted volume.** A container's filesystem is
replaced on every deploy, so anywhere else the log is lost each time the app
ships. Writing is best-effort by design: a log that cannot be written is
reported to the console and held in memory, because an operator's level change
should not fail over it.

Entries record the operator, the customer and the levels involved. A failed
login records the username that was typed; passwords are never written.

## Deploying

The app builds to a Docker image via the root `Dockerfile` — a multi-stage
build that emits Next.js' `standalone` output, so the runtime image carries
only the traced dependencies and runs as a non-root user.

```bash
docker build -t crmplus-edit-member-level .
docker run --rm -p 3000:3000 --env-file .env.local crmplus-edit-member-level
```

The server reads `PORT` and `HOSTNAME` at startup; the image defaults to
`0.0.0.0:3000` and a platform that injects `PORT` overrides it.

### Railway

`railway.json` pins the Dockerfile builder and points the healthcheck at
`/api/health`. Connect the repository and set the service variables from
[`.env.example`](.env.example):

| Variable | |
| --- | --- |
| `SESSION_SECRET` | Random, 32+ characters |
| `ACTIVITY_LOG_DIR` | Where the activity log is written — point at a mounted volume |
| `BUZZEBEES_APP_ID` | Buzzebees app id — the only one login needs beyond the sign-on host |
| `BUZZEBEES_SSO_BASE_URL` | Single sign-on host — required, never defaulted, since sign-ins post credentials to it |
| `BUZZEBEES_SSO_LOGIN_PATH` | Optional — single sign-on endpoint, defaults to `/auth/bzbs_login` |
| `BUZZEBEES_LOG_CURL` | Optional — log outgoing requests as curl commands |
| `BUZZEBEES_AGENCY_ID` | Agency (tenant) whose members and levels this deployment manages — the production agency, which differs from the one in UAT captures |
| `BUZZEBEES_CRMPLUS_BASE_URL` | Optional — CRM Plus back office (`/crmplusoffice/user`), defaults to the production host |
| `BUZZEBEES_CRMPLUS_MODULE_BASE_URL` | Optional — CRM Plus module (level list, change log), a *different* host |

None are needed at build time: every route that reads them is rendered on
demand, so the image itself holds no secrets.

`/api/health` is unauthenticated and returns 503 listing any missing app
variable, so a misconfigured deploy fails its healthcheck instead of coming up
broken. Missing Buzzebees variables are reported under `buzzebees.missing` but
do not fail the probe, since the UI still reads the placeholder member store.

## Buzzebees integration

Server-side only — `src/lib/buzzebees/` is marked `server-only`, so no
credential or token reaches the browser.

| Module | Purpose |
| --- | --- |
| `config.ts` | Reads the app id, agency and base URLs from the environment |
| `auth.ts` | `POST /auth/bzbs_login` (multipart) — the CRM Plus and wallet tokens |
| `client.ts` | Authorized fetch with the operator's own token |
| `profile.ts` | `GET /pos/profile?contactNumber=…` |
| `levels.ts` | `GET /crmpluslevel/list?agencyId=…&mode=point` |
| `user.ts` | `POST /crmplusoffice/user` — the whole record, level changed |

The token is sent as `Authorization: token <access_token>` — the scheme is the
literal word `token`, not `Bearer`. Nothing is cached and there is nothing to
refresh on a 401: minting a token needs the operator's password, so a rejected
one sends them back to the login page.

Hosts and ids come from the environment (see [Railway](#railway) for the
list). Each is read lazily at the point of use, so `next build` and any route
that does not call Buzzebees work without them; a missing one raises an error
naming the variable.

> **Rotate the credentials that were committed earlier.** An earlier revision
> of this file carried them in plain text, and git history keeps them
> reachable even though the current code does not.

### Verifying the connection

The endpoints are unreachable from some networks, so there is a diagnostic
route. Sign in first — it requires an app session and never returns the token.

```bash
# login only
curl -b cookies.txt http://localhost:3000/api/buzzebees/health

# login + customer lookup
curl -b cookies.txt 'http://localhost:3000/api/buzzebees/health?contactNumber=0901614282'
```

## Member data

`src/lib/members/store.ts` is still a **placeholder in-memory data source**
with three fictional sample members, and it is what the UI reads today.
Wiring the UI to `/pos/profile` needs the live response field names, which
the diagnostic route above reports. `src/lib/members/service.ts` is the
interface to map them onto.

Sample numbers for the placeholder store: `0900000001`, `0900000002`,
`0900000003`.

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start the development server |
| `npm run build` | Create a production build |
| `npm run start` | Serve the production build |
| `npm run lint` | Lint the project |

## Project layout

```
src/
  app/
    actions/        # Server Actions (auth, member lookup and level change)
    login/          # Login page and form
    layout.tsx      # Root layout, fonts and metadata
    page.tsx        # The console, behind requireSession()
  components/       # UI: tabs, member card, history, modals
  lib/
    auth/           # Sessions, rate limiting, access checks
    buzzebees/      # Buzzebees API: config, operator login, profile, levels
    members/        # Domain types, levels, data source
  proxy.ts          # Route gate (Next.js 16's renamed middleware)
```
