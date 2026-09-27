// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const CHANNEL_NAME = 'agiledata-iap-session';
const REFRESHED = { type: 'iap-session-refreshed' };

const OK = { ok: true, status: 200, type: 'basic' };
const EXPIRED = { ok: false, status: 0, type: 'opaqueredirect' };
const UNAUTHORIZED = { ok: false, status: 401, type: 'basic' };

// In-memory BroadcastChannel: delivers to every other open instance with the
// same name, like the real one (which never echoes to the sender).
class FakeBroadcastChannel {
  static instances = [];
  constructor(name) {
    this.name = name;
    this.onmessage = null;
    this.sent = [];
    FakeBroadcastChannel.instances.push(this);
  }
  postMessage(data) {
    this.sent.push(data);
    for (const other of FakeBroadcastChannel.instances) {
      if (other !== this && other.name === this.name) other.onmessage?.({ data });
    }
  }
  close() {
    FakeBroadcastChannel.instances = FakeBroadcastChannel.instances.filter(
      (c) => c !== this,
    );
  }
}

let sessionCheck;
let store;
let activation;
let sessionValid;
let fetchMock;
let originalFetch;

function createStore() {
  const s = { value: undefined };
  s.set = vi.fn((v) => {
    s.value = v;
  });
  return s;
}

// A popup whose opener link COOP has already severed: closed from the start.
function severedPopup() {
  return { closed: true, close: vi.fn() };
}

beforeEach(async () => {
  vi.useFakeTimers();
  vi.resetModules();
  FakeBroadcastChannel.instances = [];
  vi.stubGlobal('BroadcastChannel', FakeBroadcastChannel);

  activation = { isActive: false };
  Object.defineProperty(window.navigator, 'userActivation', {
    value: activation,
    configurable: true,
  });

  sessionValid = true;
  fetchMock = vi.fn(async (input) => {
    const url = typeof input === 'string' ? input : input.url;
    if (url.startsWith('/internal/session-check'))
      return sessionValid ? OK : EXPIRED;
    return sessionValid ? OK : UNAUTHORIZED;
  });
  originalFetch = window.fetch;
  vi.stubGlobal('fetch', fetchMock);
  window.fetch = fetchMock;

  store = createStore();
  sessionCheck = await import('./sessionCheck.js');
});

afterEach(() => {
  window.fetch = originalFetch;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.clearAllTimers();
  vi.useRealTimers();
  delete window.navigator.userActivation;
});

async function init() {
  sessionCheck.initSessionCheck(store);
  await vi.advanceTimersByTimeAsync(0);
  store.set.mockClear();
}

describe('without user activation', () => {
  it('does not open a popup on auth failure and flags the store', async () => {
    const open = vi.spyOn(window, 'open');
    await init();

    await expect(sessionCheck.handleAuthFailure()).resolves.toBe(false);

    expect(open).not.toHaveBeenCalled();
    expect(store.value).toBe(true);
  });

  it('flags the store when the background check finds the session expired', async () => {
    const open = vi.spyOn(window, 'open');
    sessionValid = false;

    sessionCheck.initSessionCheck(store);
    await vi.advanceTimersByTimeAsync(0);

    expect(open).not.toHaveBeenCalled();
    expect(store.value).toBe(true);
  });

  it('flags the store when an API call returns 401', async () => {
    const open = vi.spyOn(window, 'open');
    await init();
    sessionValid = false;

    await window.fetch('/api/catalog/');

    expect(open).not.toHaveBeenCalled();
    expect(store.value).toBe(true);
  });

  it('does not open a popup from the gesture path and flags the store', async () => {
    const open = vi.spyOn(window, 'open');
    await init();

    await expect(sessionCheck.refreshSessionFromGesture()).resolves.toBe(false);

    expect(open).not.toHaveBeenCalled();
    expect(store.value).toBe(true);
  });
});

describe('without the userActivation API', () => {
  beforeEach(() => {
    delete window.navigator.userActivation;
  });

  it('opens the refresh popup from the gesture path', async () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(severedPopup());
    await init();

    sessionCheck.refreshSessionFromGesture();

    expect(open).toHaveBeenCalledWith(
      '/?gcp-iap-mode=DO_SESSION_REFRESH',
      '_blank',
      'width=500,height=600',
    );
    expect(store.set).not.toHaveBeenCalled();
  });

  it('refuses to open a popup on auth failure and flags the store', async () => {
    const open = vi.spyOn(window, 'open');
    await init();

    await expect(sessionCheck.handleAuthFailure()).resolves.toBe(false);

    expect(open).not.toHaveBeenCalled();
    expect(store.value).toBe(true);
  });
});

describe('with user activation', () => {
  beforeEach(() => {
    activation.isActive = true;
  });

  it('opens the refresh popup when an API call returns 401', async () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(severedPopup());
    await init();
    sessionValid = false;

    await window.fetch('/api/catalog/');

    expect(open).toHaveBeenCalledWith(
      '/?gcp-iap-mode=DO_SESSION_REFRESH',
      '_blank',
      'width=500,height=600',
    );
    expect(store.set).not.toHaveBeenCalled();
  });

  it('opens only one popup for concurrent failures', async () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(severedPopup());
    await init();
    sessionValid = false;

    const first = sessionCheck.handleAuthFailure();
    const second = sessionCheck.refreshSessionFromGesture();

    expect(second).toBe(first);
    expect(open).toHaveBeenCalledTimes(1);
  });

  it('flags the store when the popup is blocked anyway', async () => {
    vi.spyOn(window, 'open').mockReturnValue(null);
    await init();

    await expect(sessionCheck.refreshSessionFromGesture()).resolves.toBe(false);
    expect(store.value).toBe(true);
  });

  it('detects success from the session probe when the popup is severed', async () => {
    const popup = severedPopup();
    vi.spyOn(window, 'open').mockReturnValue(popup);
    await init();
    store.set(true);
    sessionValid = false;

    const onResolve = vi.fn();
    sessionCheck.refreshSessionFromGesture().then(onResolve);

    // popup.closed is already true but that is not treated as an outcome.
    await vi.advanceTimersByTimeAsync(2000);
    expect(onResolve).not.toHaveBeenCalled();

    sessionValid = true;
    await vi.advanceTimersByTimeAsync(1000);

    expect(onResolve).toHaveBeenCalledWith(true);
    expect(store.value).toBe(false);
  });

  it('detects success from a BroadcastChannel message', async () => {
    vi.spyOn(window, 'open').mockReturnValue(severedPopup());
    await init();
    store.set(true);
    sessionValid = false;

    const onResolve = vi.fn();
    sessionCheck.refreshSessionFromGesture().then(onResolve);
    await vi.advanceTimersByTimeAsync(1500);

    // The tenant landing page in the popup announces success.
    new FakeBroadcastChannel(CHANNEL_NAME).postMessage(REFRESHED);
    await vi.advanceTimersByTimeAsync(0);

    expect(onResolve).toHaveBeenCalledWith(true);
    expect(store.value).toBe(false);
  });

  it('detects success from a same-origin message', async () => {
    vi.spyOn(window, 'open').mockReturnValue(severedPopup());
    await init();
    sessionValid = false;

    const onResolve = vi.fn();
    sessionCheck.refreshSessionFromGesture().then(onResolve);

    window.dispatchEvent(
      new MessageEvent('message', {
        origin: window.location.origin,
        data: REFRESHED,
      }),
    );
    await vi.advanceTimersByTimeAsync(0);

    expect(onResolve).toHaveBeenCalledWith(true);
    expect(store.value).toBe(false);
  });

  it('ignores a cross-origin message', async () => {
    vi.spyOn(window, 'open').mockReturnValue(severedPopup());
    await init();
    sessionValid = false;

    const onResolve = vi.fn();
    sessionCheck.refreshSessionFromGesture().then(onResolve);

    window.dispatchEvent(
      new MessageEvent('message', {
        origin: 'https://identity-dot-agiledata-core-prd.appspot.com',
        data: REFRESHED,
      }),
    );
    await vi.advanceTimersByTimeAsync(1000);
    expect(onResolve).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(30000);
    expect(onResolve).toHaveBeenCalledWith(false);
    expect(store.value).toBe(true);
  });

  describe('on timeout', () => {
    // Hold the first poll probe open so no later poll runs; the next probe
    // is then the one the timeout makes.
    function holdPolls() {
      let calls = 0;
      fetchMock.mockImplementation(() => {
        calls += 1;
        if (calls === 1) return new Promise(() => {});
        return Promise.resolve(sessionValid ? OK : EXPIRED);
      });
      return () => calls;
    }

    it('re-probes and succeeds if the session is now valid', async () => {
      vi.spyOn(window, 'open').mockReturnValue(severedPopup());
      await init();
      store.set(true);
      const calls = holdPolls();

      const onResolve = vi.fn();
      sessionCheck.refreshSessionFromGesture().then(onResolve);
      await vi.advanceTimersByTimeAsync(29000);
      expect(calls()).toBe(1);
      expect(onResolve).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(1000);

      expect(calls()).toBe(2);
      expect(onResolve).toHaveBeenCalledWith(true);
      expect(store.value).toBe(false);
    });

    it('re-probes before flagging the session expired', async () => {
      vi.spyOn(window, 'open').mockReturnValue(severedPopup());
      await init();
      sessionValid = false;
      const calls = holdPolls();

      const onResolve = vi.fn();
      sessionCheck.refreshSessionFromGesture().then(onResolve);
      await vi.advanceTimersByTimeAsync(30000);

      expect(calls()).toBe(2);
      expect(onResolve).toHaveBeenCalledWith(false);
      expect(store.value).toBe(true);
    });
  });

  it('broadcasts success so other tabs clear', async () => {
    vi.spyOn(window, 'open').mockReturnValue(severedPopup());
    await init();
    sessionValid = false;
    const otherTab = new FakeBroadcastChannel(CHANNEL_NAME);
    otherTab.onmessage = vi.fn();

    sessionCheck.refreshSessionFromGesture();
    sessionValid = true;
    await vi.advanceTimersByTimeAsync(1000);

    expect(otherTab.onmessage).toHaveBeenCalledWith({ data: REFRESHED });
  });
});

it('clears the store when another tab broadcasts a renewal', async () => {
  await init();
  await sessionCheck.handleAuthFailure();
  expect(store.value).toBe(true);

  new FakeBroadcastChannel(CHANNEL_NAME).postMessage(REFRESHED);

  expect(store.value).toBe(false);
});

it('clears the store when a later session check passes', async () => {
  await init();
  sessionValid = false;
  await sessionCheck.handleAuthFailure();
  expect(store.value).toBe(true);

  sessionValid = true;
  // Next background poll tick, with activity in the last few minutes.
  await vi.advanceTimersByTimeAsync(19 * 60 * 1000);
  document.dispatchEvent(new Event('keydown'));
  await vi.advanceTimersByTimeAsync(60 * 1000);

  expect(store.value).toBe(false);
});
