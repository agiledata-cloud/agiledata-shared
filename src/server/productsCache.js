import { getDb } from './firestoreClient.js';

const PRODUCTS_COLLECTION = 'products_cache';
const PRODUCTS_DOC = 'products';

/**
 * Write the validated products array to Firestore.
 * Called by the CI sync script after each deploy.
 *
 * @param {object[]} products - Validated products array from products.data.js
 * @param {string} contractVersion - PRODUCT_CONTRACT_PINNED value from products.data.js
 */
export async function writeProductsCache(products, contractVersion) {
	await getDb().collection(PRODUCTS_COLLECTION).doc(PRODUCTS_DOC).set({
		data: products,
		synced_at: Date.now(),
		contract_version: contractVersion
	});
}

/**
 * Read the products cache from Firestore.
 * Called by the GUI to build the cross-tenancy product catalogue.
 *
 * @returns {{ data: object[], synced_at: number, contract_version: string } | null}
 */
export async function readProductsCache() {
	const doc = await getDb().collection(PRODUCTS_COLLECTION).doc(PRODUCTS_DOC).get();
	return doc.exists ? doc.data() : null;
}
