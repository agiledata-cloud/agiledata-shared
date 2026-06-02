import { json, error } from '@sveltejs/kit';
import { emailFromIapJwt } from '../server/iapAuth.js';
import { getDb, CACHE_COLLECTION } from '../server/firestoreClient.js';

export async function POST({ request, locals }) {
  const email =
    locals.userEmail ??
    emailFromIapJwt(request.headers.get('x-goog-iap-jwt-assertion'));

  if (!email) return json({ ok: true });

  let body;
  try {
    body = await request.json();
  } catch {
    throw error(400, 'Invalid JSON');
  }

  const { profile = null, tenancy = null, tenancies } = body || {};
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
