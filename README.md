# @agiledata/shared

Shared server and browser utilities for AgileData SvelteKit applications.

## Installation

Pin to a git tag:

```json
"@agiledata/shared": "github:agiledata-cloud/agiledata-shared#v1.0.0"
```

Run `npm install` after updating the tag to pull in a new version.

## Modules

### `@agiledata/shared/server/handle`

SvelteKit `handle` hook. Reads the IAP JWT on each request to populate `event.locals` with the user email and Firestore startup cache data. Also removes the `Link` response header.

```js
// src/hooks.server.js
export { handle } from '@agiledata/shared/server/handle';
```

### `@agiledata/shared/server/firestoreClient`

Lazy singleton Firestore client.

```js
import { getDb, CACHE_COLLECTION } from '@agiledata/shared/server/firestoreClient';
```

### `@agiledata/shared/server/iapAuth`

Extracts the user email from a GCP IAP JWT assertion header.

```js
import { emailFromIapJwt } from '@agiledata/shared/server/iapAuth';
```

### `@agiledata/shared/routes/cache-profile`

POST handler for `/internal/cache-profile`. Persists user profile and tenancy data to Firestore.

```js
// src/routes/internal/cache-profile/+server.js
export { POST } from '@agiledata/shared/routes/cache-profile';
```

### `@agiledata/shared/routes/session-check`

GET handler for `/internal/session-check`. Returns `{ valid: true }` when the session is active.

```js
// src/routes/internal/session-check/+server.js
export { GET } from '@agiledata/shared/routes/session-check';
```

### `@agiledata/shared/browser/sessionCheck`

Call once inside `if (browser)` in your store initialisation. Sets up fetch-level session expiry detection and a background session health check with activity-aware polling.

```js
import { initSessionCheck } from '@agiledata/shared/browser/sessionCheck';

if (browser) {
  initSessionCheck(sessionExpired); // pass the sessionExpired Svelte writable store
}
```

An expired IAP session is renewed in a `/?gcp-iap-mode=DO_SESSION_REFRESH` popup. Browsers block popups opened without a user gesture, so `handleAuthFailure()`, the fetch wrapper and the background checks only open the popup while `navigator.userActivation.isActive` is `true`; `refreshSessionFromGesture()` also opens it when the browser does not support `navigator.userActivation`. Otherwise the module sets `sessionExpired` to `true` and the UI should offer a button that calls `refreshSessionFromGesture()` synchronously in its click handler:

```js
import {
  refreshSessionFromGesture,
  handleAuthFailure,
} from '@agiledata/shared/browser/sessionCheck';

// "Continue session" button; resolves true once renewed, false if the popup
// was blocked or renewal timed out (fall back to a reload).
const renewed = await refreshSessionFromGesture();

// API layer, on a 401 or opaqueredirect response: renews at once after a
// click, otherwise flags sessionExpired for the prompt.
handleAuthFailure();
```

Renewal succeeds when the tenant landing page posts `{ type: 'iap-session-refreshed' }` on `BroadcastChannel('agiledata-iap-session')`, or when `/internal/session-check` passes while the popup is pending (probed every second, and once more at the 30 s timeout). `window.opener` is not relied on: `Cross-Origin-Opener-Policy: same-origin` severs it on the cross-site hop to the sign-in page. On success `sessionExpired` is set back to `false` and the renewal is broadcast so every open tab clears.

Run the unit tests with `npm test` (Node 22+).

## Releasing a fix

1. Commit and tag: `git tag v1.x.x && git push origin v1.x.x`
2. In each consuming repo, update `package.json` to the new tag and run `npm install`.

## Peer dependencies
<!-- no-op: test commit for PR approval review audit -->

| Package | Required version |
|---|---|
| `@google-cloud/firestore` | `>=8` |
| `@sveltejs/kit` | `>=2` |
