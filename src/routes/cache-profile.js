import { json, error } from '@sveltejs/kit';
import { emailFromIapJwt } from '../server/iapAuth.js';
import { getDb, CACHE_COLLECTION } from '../server/firestoreClient.js';

export async function POST({ request, locals }) {
  // IAP JWT signature is not re-verified here. The header is set by IAP at the
  // load balancer and cannot be forged by clients — trusting it is safe.
  const email =
    locals.userEmail ??
    emailFromIapJwt(request.headers.get('x-goog-iap-jwt-assertion'));

  // No IAP header in local dev — skip the write, it's non-critical.
  if (!email) return json({ ok: true });

  let body;
  try {
    body = await request.json();
  } catch {
    throw error(400, 'Invalid JSON');
  }

  const { profile = null, tenancy = null, tenancies } = body || {};
  // Only write tenancies if the client sent it — avoids adding a null field
  // to Firestore docs for apps that don't use multi-tenancy.
  const doc = { profile, tenancy, cached_at: Date.now() };
  if (tenancies !== undefined) doc.tenancies = tenancies;

  try {
    await getDb()
      .collection(CACHE_COLLECTION)
      .doc(email)
      .set(doc, { merge: true });
  } catch (e) {
    console.error('[user cache] Firestore write failed:', e.message);
  }

  return json({ ok: true });
}
