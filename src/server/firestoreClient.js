import { Firestore } from '@google-cloud/firestore';

let db;
export function getDb() {
  if (!db) {
    // PROJECT_ID must be set explicitly. Without it the Firestore client falls
    // back to the ADC default project, which is wrong when a developer's gcloud
    // default points at a different tenancy than the app itself — the cache then
    // reads and writes against the wrong project. `ignoreUndefinedProperties`
    // stops a write throwing when a personalisation field is absent.
    const projectId = process.env.PROJECT_ID;
    if (!projectId) console.warn('[firestoreClient] PROJECT_ID not set — Firestore may connect to the wrong project');
    db = new Firestore({ ...(projectId && { projectId }), databaseId: 'user-cache', ignoreUndefinedProperties: true });
  }
  return db;
}

export const CACHE_COLLECTION = 'user_cache';
