# @agiledata/shared

Shared server and browser utilities for AgileData SvelteKit apps. Consumed by `agiledata-gui`, `custom-app-template`, and all derived customer app repos.

## Installation

During local development, install via a file path:

```bash
npm install file:../agiledata-shared
```

For deployed environments, pin to a git tag after pushing to GitHub:

```json
"@agiledata/shared": "github:agiledata-cloud/agiledata-shared#v1.0.0"
```

To update a consuming repo to a new version, bump the tag in its `package.json` and run `npm install`.

## What's in here

### `@agiledata/shared/server/handle`

SvelteKit `handle` hook. Reads the IAP JWT on every request, extracts the user email, and populates `event.locals` from the Firestore startup cache. Also strips the `Link` preload header that would overflow the App Engine nginx proxy buffer (causing 502s).

```js
// src/hooks.server.js
export { handle } from '@agiledata/shared/server/handle';
```

### `@agiledata/shared/server/firestoreClient`

Lazy singleton Firestore client pointing at the `user-cache` database.

```js
import { getDb, CACHE_COLLECTION } from '@agiledata/shared/server/firestoreClient';
```

### `@agiledata/shared/server/iapAuth`

Extracts the user email from an IAP JWT without re-verifying the signature (safe because the header is set by the load balancer and cannot be forged by clients).

```js
import { emailFromIapJwt } from '@agiledata/shared/server/iapAuth';
```

### `@agiledata/shared/routes/cache-profile`

POST handler for `/internal/cache-profile`. Writes `profile`, `tenancy`, and optionally `tenancies` to Firestore. Used as a thin re-export in each app's route file.

```js
// src/routes/internal/cache-profile/+server.js
export { POST } from '@agiledata/shared/routes/cache-profile';
```

### `@agiledata/shared/routes/session-check`

GET handler for `/internal/session-check`. Returns `{ valid: true }` when reached — IAP intercepts expired sessions at the load balancer before this code runs, so a successful response means the session is live.

```js
// src/routes/internal/session-check/+server.js
export { GET } from '@agiledata/shared/routes/session-check';
```

### `@agiledata/shared/browser/sessionCheck`

Call once inside `if (browser)` in `stores.js`. Sets up two things:

1. **`window.fetch` patch** — injects `X-Requested-With: XMLHttpRequest` on `/api/*` calls in production so IAP returns `401` directly instead of a cross-origin redirect. Triggers `attemptSilentRefresh` on expiry detection.
2. **Session health check** — proactive IAP expiry detection via activity tracking, a 20-minute background poll, an immediate page-load probe, and a visibility-change probe. On expiry, attempts a silent `DO_SESSION_REFRESH` popup before showing the expired overlay.

```js
import { initSessionCheck } from '@agiledata/shared/browser/sessionCheck';

if (browser) {
  initSessionCheck(sessionExpired); // pass the sessionExpired Svelte store
  // ... rest of startup
}
```

## Releasing a fix

1. Make the change in this repo and commit.
2. Tag the release: `git tag v1.x.x && git push origin v1.x.x`
3. In each consuming repo, update `package.json`:
   ```json
   "@agiledata/shared": "github:agiledata-cloud/agiledata-shared#v1.x.x"
   ```
4. Run `npm install` and open a PR.

## Peer dependencies

| Package | Version |
|---|---|
| `@google-cloud/firestore` | `>=8` |
| `@sveltejs/kit` | `>=2` |

These must be installed in the consuming app — they are not bundled here.
