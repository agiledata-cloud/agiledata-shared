// The X-Goog-Iap-Jwt-Assertion header is set by IAP at the load balancer and
// cannot be forged by clients — decoding without re-verifying the signature is
// safe for cache lookups (not used for access control).
export function emailFromIapJwt(jwt) {
  try {
    const payload = JSON.parse(
      Buffer.from(jwt.split('.')[1], 'base64').toString('utf8'),
    );
    // GCIP-integrated IAP: real email is in gcip.email.
    if (payload.gcip?.email) return payload.gcip.email;
    // Fallback: strip "accounts.google.com:" / "securetoken.google.com/<project>:" prefix.
    const raw = payload.email;
    if (!raw) return null;
    return raw.includes(':') ? raw.split(':', 2)[1] : raw;
  } catch {
    return null;
  }
}
