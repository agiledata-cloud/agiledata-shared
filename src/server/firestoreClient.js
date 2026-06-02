import { Firestore } from '@google-cloud/firestore';

let db;
export function getDb() {
  if (!db) db = new Firestore({ databaseId: 'user-cache' });
  return db;
}

export const CACHE_COLLECTION = 'user_cache';
