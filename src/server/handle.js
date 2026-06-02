import { emailFromIapJwt } from './iapAuth.js';
import { getDb, CACHE_COLLECTION } from './firestoreClient.js';

async function readStartupCache(email, cacheTtlMs) {
  try {
    const doc = await getDb().collection(CACHE_COLLECTION).doc(email).get();
    if (!doc.exists) return null;
    const data = doc.data();
    if (!data.cached_at || Date.now() - data.cached_at > cacheTtlMs)
      return null;
    return {
      profile: data.profile ?? null,
      tenancy: data.tenancy ?? null,
      tenancies: data.tenancies ?? null,
    };
  } catch {
    return null;
  }
}

// App Engine Standard's nginx proxy has an ~8KB header buffer limit.
// SvelteKit's HTTP `Link` preload header lists every JS chunk (~100+ entries ≈ 7KB+),
// which tips the response over the limit and causes a 502.
// Removing it here is safe: the <link rel="modulepreload"> tags in the HTML <head>
// still provide equivalent preloading behaviour in the browser.
export function createHandle({ cacheTtlMs = 4 * 60 * 60 * 1000 } = {}) {
  return async function handle({ event, resolve }) {
    const iapJwt = event.request.headers.get('x-goog-iap-jwt-assertion');
    if (iapJwt) {
      const email = emailFromIapJwt(iapJwt);
      if (email) {
        event.locals.cachedStartup = await readStartupCache(email, cacheTtlMs);
        event.locals.userEmail = email;
      }
    }

    const response = await resolve(event);
    response.headers.delete('link');
    return response;
  };
}
