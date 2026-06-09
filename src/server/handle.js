import { emailFromIapJwt } from './iapAuth.js';
import { getDb, CACHE_COLLECTION } from './firestoreClient.js';

const CACHE_TTL_MS = 12 * 60 * 60 * 1000;

async function readStartupCache(email) {
  try {
    const doc = await getDb().collection(CACHE_COLLECTION).doc(email).get();
    if (!doc.exists) return null;
    const data = doc.data();
    if (!data.cached_at || Date.now() - data.cached_at > CACHE_TTL_MS)
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

export async function handle({ event, resolve }) {
  const iapJwt = event.request.headers.get('x-goog-iap-jwt-assertion');
  if (iapJwt) {
    const email = emailFromIapJwt(iapJwt);
    if (email) {
      event.locals.cachedStartup = await readStartupCache(email);
      event.locals.userEmail = email;
    }
  }

  const response = await resolve(event);
  response.headers.delete('link');
  response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('Cross-Origin-Opener-Policy', 'same-origin');
  response.headers.set('Cross-Origin-Resource-Policy', 'same-origin');
  return response;
}
