# spqfrontend

SkyQuotes' React 18 + Vite frontend, deployed via Catalyst Slate. Plain JS/JSX — no
TypeScript, no PropTypes.

```sh
npm install
npm run dev     # http://localhost:5173
npm run lint
npm run build
npm run test:e2e
```

Backend: Catalyst project **Skyquote** (`56318000000435234`), function `skyquote_function` —
see `src/config.js`.

## Running against a local backend

`vite.config.js` proxies `/api/*` to `http://localhost:3000/server/skyquote_function`, so
with `catalyst serve` running in `../spqbackend`:

```sh
VITE_BACKEND_BASE_URL=/api/ npm run dev
```

Without the proxy the dev-server browser is blocked by CORS — Catalyst's Authorized Domains
gateway, which adds the CORS headers in production, doesn't run under local serve.

## Test setup

Playwright specs run against the **real backend** (`catalyst serve` in `../spqbackend`) and a
real Data Store — nothing is mocked.

There's no self-serve signup; accounts are admin-created only (`POST /admin/users`, see
`src/pages/AdminUsers.jsx`). `tests/global-setup.js` logs in once and saves the session to
`tests/.auth/`, and creates the shared test user itself if it's missing. But it needs one
admin account to already exist — that one can't be created by the test run (it would be
circular: you need an admin to create anyone).

`tests/global-teardown.ts` runs after the suite and deletes the templates and documents the run
created, scoped to **the shared test account's user id** — never to a name, since `Untitled
template` is also what a real person gets from "+ New template". Without it every run left ~30 rows
behind, and the list route slowed down until the suite failed on its own accumulated history. So
**point the suite at a Data Store whose test account is yours to empty**, and expect a run to add
30–60s of cleanup at the end.

**Credentials are not committed** — this repo is public and these are real, working logins
against the Skyquote Data Store. Copy `tests/.env.local.example` to `tests/.env.local`
(gitignored) and fill in `TEST_ADMIN_PASSWORD` / `TEST_SHARED_USER_PASSWORD`; the suite
fails with a clear message if they're missing.

One-time, per Data Store:

1. Generate a password hash locally:
   ```sh
   cd ../spqbackend/functions/skyquote_function
   node -e "const bcrypt=require('bcryptjs'); console.log(bcrypt.hashSync('<pick-a-strong-password>', 12))"
   ```
2. In the Catalyst console's Data Store row editor, add one row to `Users`:
   - `email`: `playwright-admin@example.com` (must match `TEST_ADMIN` in
     `tests/auth-storage-state.js` — change both together if you use a different email)
   - `password`: the hash from step 1
   - `first_name` / `last_name`: anything
   - `role`: `admin`
   - `is_active`: `true`
   - `failed_login_count`: `0`

This same account is also how you first log into the real app to create real users via the
Users page.

Tests that assert 401-on-unauthenticated, or that need a distinct identity, opt out of the
shared session with `test.use({ storageState: { cookies: [], origins: [] } })` rather than
fighting it.
