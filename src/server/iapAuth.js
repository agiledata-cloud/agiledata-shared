export function emailFromIapJwt(jwt) {
  try {
    const payload = JSON.parse(
      Buffer.from(jwt.split('.')[1], 'base64').toString('utf8'),
    );
    if (payload.gcip?.email) return payload.gcip.email;
    const raw = payload.email;
    if (!raw) return null;
    return raw.includes(':') ? raw.split(':', 2)[1] : raw;
  } catch {
    return null;
  }
}
