const ACTIVITY_WINDOW_MS = 5 * 60 * 1000;
const IDLE_RETURN_MS = 30 * 60 * 1000;
const POLL_INTERVAL_MS = 20 * 60 * 1000;

let silentRefreshPending = false;

// When IAP session expiry is detected, open a DO_SESSION_REFRESH popup rather
// than showing the expired overlay immediately. The popup lands on the identity
// service which silently re-auths using the stored __iap_sid cookie, completes
// the IAP handshake, then postMessages 'iap-session-refreshed' and closes.
// Falls back to the overlay if popups are blocked or the refresh times out.
function attemptSilentRefresh(sessionExpired) {
  if (silentRefreshPending) return;
  silentRefreshPending = true;

  const popup = window.open(
    '/?gcp-iap-mode=DO_SESSION_REFRESH',
    '_blank',
    'width=500,height=600',
  );
  if (!popup) {
    silentRefreshPending = false;
    sessionExpired.set(true);
    return;
  }

  const timer = setTimeout(() => {
    window.removeEventListener('message', onMessage);
    if (!popup.closed) popup.close();
    silentRefreshPending = false;
    sessionExpired.set(true);
  }, 30000);

  function onMessage(event) {
    if (event.origin !== window.location.origin) return;
    if (event.data?.type !== 'iap-session-refreshed') return;
    clearTimeout(timer);
    window.removeEventListener('message', onMessage);
    if (!popup.closed) popup.close();
    silentRefreshPending = false;
  }
  window.addEventListener('message', onMessage);
}

async function checkSession(sessionExpired) {
  try {
    const res = await fetch('/internal/session-check', {
      credentials: 'include',
      redirect: 'manual',
    });
    if (res.type === 'opaqueredirect' || res.status === 401) {
      attemptSilentRefresh(sessionExpired);
    }
  } catch {
    // Network error — transient, don't flag as expired
  }
}

// Call once inside `if (browser)` in stores.js, passing the sessionExpired store.
// Sets up:
//   1. window.fetch patch — injects X-Requested-With on /api/* calls (prod only)
//      so IAP returns 401 instead of a cross-origin redirect, and triggers
//      attemptSilentRefresh on expiry detection.
//   2. Session health check — periodic probe + activity/visibility triggers.
export function initSessionCheck(sessionExpired) {
  const _fetch = window.fetch;
  window.fetch = async function (input, init = {}) {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.href
          : input.url ?? '';
    const isApi = url.includes('/api/');
    // Only inject in production — in local dev the API is cross-origin and the
    // header triggers a CORS preflight that the server won't accept from localhost.
    if (isApi && !import.meta.env.DEV) {
      const headers = new Headers(init.headers);
      if (!headers.has('X-Requested-With')) {
        headers.set('X-Requested-With', 'XMLHttpRequest');
      }
      init = { ...init, headers };
    }
    try {
      const res = await _fetch.call(this, input, init);
      if (isApi && (res.type === 'opaqueredirect' || res.status === 401)) {
        attemptSilentRefresh(sessionExpired);
      }
      return res;
    } catch (e) {
      // In production a TypeError on /api/* means IAP redirected cross-origin
      // (CORS failure = session expiry). In dev, TypeErrors are ordinary CORS
      // failures from testing against a deployed backend — don't show the overlay.
      if (isApi && !import.meta.env.DEV) attemptSilentRefresh(sessionExpired);
      throw e;
    }
  };

  let lastActivityAt = Date.now();

  function onActivity() {
    const now = Date.now();
    const gap = now - lastActivityAt;
    lastActivityAt = now;
    if (gap >= IDLE_RETURN_MS) checkSession(sessionExpired);
  }

  ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'].forEach((evt) =>
    document.addEventListener(evt, onActivity, { passive: true }),
  );

  // Background poll — only fires when the user has been active recently
  setInterval(() => {
    if (Date.now() - lastActivityAt < ACTIVITY_WINDOW_MS)
      checkSession(sessionExpired);
  }, POLL_INTERVAL_MS);

  // Immediate check on page load — catches browser-restored tabs where the
  // IAP session already expired overnight.
  checkSession(sessionExpired);

  // Check when tab becomes visible — catches sessions that expired while the
  // tab was idle in the background.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      const gap = Date.now() - lastActivityAt;
      if (gap >= IDLE_RETURN_MS) checkSession(sessionExpired);
    }
  });
}
