import { json } from '@sveltejs/kit';

// Lightweight session validity probe.
// IAP validates the session at the load balancer before this handler runs —
// if the session is expired, IAP returns an opaqueredirect and this code is
// never reached. Reaching here means the session is valid.
export async function GET() {
  return json({ valid: true });
}
