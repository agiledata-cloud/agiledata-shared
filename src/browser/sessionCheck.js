const ACTIVITY_WINDOW_MS = 5 * 60 * 1000;
const IDLE_RETURN_MS = 30 * 60 * 1000;
const POLL_INTERVAL_MS = 20 * 60 * 1000;
const REFRESH_TIMEOUT_MS = 30 * 1000;
const REFRESH_PROBE_MS = 1000;

const REFRESH_URL = '/?gcp-iap-mode=DO_SESSION_REFRESH';
// The tenant landing page posts { type: REFRESHED } on this channel when the
// DO_SESSION_REFRESH popup completes. window.opener cannot be used: COOP
// same-origin severs it on the cross-site hop to the identity sign-in page.
const CHANNEL_NAME = 'agiledata-iap-session';
const REFRESHED = 'iap-session-refreshed';

let sessionExpiredStore = null;
let channel = null;
let pendingRefresh = null;
let finishPendingRefresh = null;

function setExpired(value) {
  sessionExpiredStore?.set(value);
}

function isAuthFailure(res) {
  return res.type === 'opaqueredirect' || res.status === 401;
}

function probeSession() {
  return fetch('/internal/session-check', {
    credentials: 'include',
    redirect: 'manual',
  });
}

async function sessionIsValid() {
  try {
    return (await probeSession()).ok;
  } catch {
    return false;
  }
}

function getChannel() {
  if (channel || typeof BroadcastChannel === 'undefined') return channel;
  channel = new BroadcastChannel(CHANNEL_NAME);
  channel.onmessage = (event) => {
    if (event.data?.type !== REFRESHED) return;
    if (finishPendingRefresh) finishPendingRefresh(true);
    else setExpired(false);
  };
  return channel;
}

function markRenewed() {
  setExpired(false);
  getChannel()?.postMessage({ type: REFRESHED });
}

function refreshSession() {
  if (pendingRefresh) return pendingRefresh;

  // Without transient user activation the popup would be blocked, so flag the
  // store instead and let the UI offer a button that calls
  // refreshSessionFromGesture().
  if (!navigator.userActivation?.isActive) {
    setExpired(true);
    return Promise.resolve(false);
  }

  const popup = window.open(REFRESH_URL, '_blank', 'width=500,height=600');
  if (!popup) {
    setExpired(true);
    return Promise.resolve(false);
  }

  getChannel();
  pendingRefresh = new Promise((resolve) => {
    let done = false;
    let probing = false;

    // popup.closed is true as soon as COOP moves the popup to another
    // browsing-context group, so success is detected by probing instead.
    const poll = setInterval(async () => {
      if (probing) return;
      probing = true;
      const ok = await sessionIsValid();
      probing = false;
      if (ok) finish(true);
    }, REFRESH_PROBE_MS);

    const timer = setTimeout(async () => {
      clearInterval(poll);
      finish(await sessionIsValid());
    }, REFRESH_TIMEOUT_MS);

    function onMessage(event) {
      if (event.origin !== window.location.origin) return;
      if (event.data?.type !== REFRESHED) return;
      finish(true);
    }
    window.addEventListener('message', onMessage);

    function finish(ok) {
      if (done) return;
      done = true;
      clearInterval(poll);
      clearTimeout(timer);
      window.removeEventListener('message', onMessage);
      pendingRefresh = null;
      finishPendingRefresh = null;
      try {
        if (!popup.closed) popup.close();
      } catch {
        // Handle severed by COOP; the landing page closes itself.
      }
      if (ok) markRenewed();
      else setExpired(true);
      resolve(ok);
    }
    finishPendingRefresh = finish;
  });
  return pendingRefresh;
}

// Call synchronously from a click handler (e.g. the Session Expired prompt) so
// the refresh popup opens with user activation. Resolves true once the session
// is renewed, false if the popup was blocked or renewal timed out.
export function refreshSessionFromGesture() {
  return refreshSession();
}

// Call when an API request fails authentication (401 or opaqueredirect).
// Renews immediately when the failure follows a user gesture, otherwise flags
// the sessionExpired store so the UI can prompt. Resolves true once renewed.
export function handleAuthFailure() {
  return refreshSession();
}

async function checkSession() {
  try {
    const res = await probeSession();
    if (isAuthFailure(res)) handleAuthFailure();
    else if (res.ok && !pendingRefresh) setExpired(false);
  } catch {
    // Network error — transient, don't flag as expired
  }
}

export function initSessionCheck(sessionExpired) {
  sessionExpiredStore = sessionExpired;
  getChannel();

  const _fetch = window.fetch;
  window.fetch = async function (input, init = {}) {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.href
          : input.url ?? '';
    const isApi = url.includes('/api/');
    if (isApi && !import.meta.env.DEV) {
      const headers = new Headers(init.headers);
      if (!headers.has('X-Requested-With')) {
        headers.set('X-Requested-With', 'XMLHttpRequest');
      }
      init = { ...init, headers };
    }
    try {
      const res = await _fetch.call(this, input, init);
      if (isApi && isAuthFailure(res)) handleAuthFailure();
      return res;
    } catch (e) {
      // Confirm with the session probe rather than flagging expiry on what
      // may be a transient network error.
      if (isApi && !import.meta.env.DEV) checkSession();
      throw e;
    }
  };

  let lastActivityAt = Date.now();

  function onActivity() {
    const now = Date.now();
    const gap = now - lastActivityAt;
    lastActivityAt = now;
    if (gap >= IDLE_RETURN_MS) checkSession();
  }

  ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'].forEach((evt) =>
    document.addEventListener(evt, onActivity, { passive: true }),
  );

  setInterval(() => {
    if (Date.now() - lastActivityAt < ACTIVITY_WINDOW_MS) checkSession();
  }, POLL_INTERVAL_MS);

  checkSession();

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      const gap = Date.now() - lastActivityAt;
      if (gap >= IDLE_RETURN_MS) checkSession();
    }
  });
}
