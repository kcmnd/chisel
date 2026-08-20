const TARGET_KEY = "alwaysLastTarget";
const BOUND_KEY = "alwaysLastBoundTabId";

function normalizePath(pathname) {
  if (!pathname || pathname === "/") return "/";
  return pathname.replace(/\/+$/, "");
}

function makeTarget(rawUrl) {
  try {
    const url = new URL(rawUrl);

    // Only normal websites.
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }

    return {
      origin: url.origin,
      pathname: normalizePath(url.pathname)
    };
  } catch {
    return null;
  }
}

function matchesTarget(rawUrl, target) {
  if (!rawUrl || !target) return false;

  try {
    const url = new URL(rawUrl);

    return (
      url.origin === target.origin &&
      normalizePath(url.pathname) === target.pathname
    );
  } catch {
    return false;
  }
}

async function getTarget() {
  return (await chrome.storage.local.get(TARGET_KEY))[TARGET_KEY];
}

async function getBoundTabId() {
  return (await chrome.storage.session.get(BOUND_KEY))[BOUND_KEY];
}

async function setBadge(tabId, enabled) {
  try {
    await chrome.action.setBadgeText({
      tabId,
      text: enabled ? "9" : ""
    });
  } catch {
    // Tab may have disappeared.
  }
}

async function keepLast(tabId) {
  try {
    const tab = await chrome.tabs.get(tabId);

    const tabs = await chrome.tabs.query({
      windowId: tab.windowId
    });

    if (tab.index !== tabs.length - 1) {
      await chrome.tabs.move(tabId, { index: -1 });
    }
  } catch {
    // Can fail briefly while tabs are being dragged,
    // detached, restored, or closed.
  }
}

async function bindToTab(tab) {
  if (!tab?.id) return;

  await chrome.storage.session.set({
    [BOUND_KEY]: tab.id
  });

  await setBadge(tab.id, true);
  await keepLast(tab.id);
}

async function findMatchingTab(target) {
  const tabs = await chrome.tabs.query({});

  const candidates = tabs.filter(
    tab => tab.id && matchesTarget(tab.url, target)
  );

  if (candidates.length === 0) {
    return null;
  }

  // If several identical pages exist, use the one
  // Chrome says was accessed most recently.
  candidates.sort(
    (a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0)
  );

  return candidates[0];
}

async function ensureTargetIsLast() {
  const target = await getTarget();

  if (!target) return;

  const boundId = await getBoundTabId();

  // First try the already-bound tab.
  if (boundId) {
    try {
      const tab = await chrome.tabs.get(boundId);

      if (matchesTarget(tab.url, target)) {
        await setBadge(tab.id, true);
        await keepLast(tab.id);
        return;
      }
    } catch {
      // Bound tab no longer exists.
    }

    await chrome.storage.session.remove(BOUND_KEY);
  }

  // The runtime tab ID disappeared, such as after a
  // Chrome restart. Find the restored page again.
  const candidate = await findMatchingTab(target);

  if (candidate) {
    await bindToTab(candidate);
  }
}


// --------------------------------------------------
// Clicking the extension toggles Always Last
// --------------------------------------------------

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab?.id) return;

  const clickedTarget = makeTarget(tab.url);

  // chrome:// pages, extension pages, etc. aren't supported.
  if (!clickedTarget) {
    await chrome.action.setBadgeText({
      tabId: tab.id,
      text: "!"
    });

    setTimeout(() => {
      chrome.action.setBadgeText({
        tabId: tab.id,
        text: ""
      }).catch(() => {});
    }, 1500);

    return;
  }

  const currentTarget = await getTarget();
  const boundId = await getBoundTabId();

  // Clicking the currently-designated tab turns it off.
  if (
    currentTarget &&
    matchesTarget(tab.url, currentTarget) &&
    (!boundId || boundId === tab.id)
  ) {
    await setBadge(tab.id, false);

    await chrome.storage.local.remove(TARGET_KEY);
    await chrome.storage.session.remove(BOUND_KEY);

    return;
  }

  // Clear the badge from the old designated tab.
  if (boundId && boundId !== tab.id) {
    await setBadge(boundId, false);
  }

  // Store the website permanently.
  await chrome.storage.local.set({
    [TARGET_KEY]: clickedTarget
  });

  // Store this particular runtime tab ID for this session.
  await chrome.storage.session.set({
    [BOUND_KEY]: tab.id
  });

  await setBadge(tab.id, true);
  await keepLast(tab.id);
});


// --------------------------------------------------
// Restore behavior after Chrome restarts
// --------------------------------------------------

chrome.runtime.onStartup.addListener(() => {
  ensureTargetIsLast();
});


// --------------------------------------------------
// Keep enforcing the last position
// --------------------------------------------------

chrome.tabs.onCreated.addListener(() => {
  ensureTargetIsLast();
});

chrome.tabs.onMoved.addListener(() => {
  ensureTargetIsLast();
});

chrome.tabs.onAttached.addListener(() => {
  ensureTargetIsLast();
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.url || changeInfo.status === "complete") {
    ensureTargetIsLast();
  }
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
  const boundId = await getBoundTabId();

  if (boundId === tabId) {
    // Forget the temporary tab ID, but NOT the saved website.
    await chrome.storage.session.remove(BOUND_KEY);

    // If another matching tab exists, adopt it.
    await ensureTargetIsLast();
  }
});


// Also run once whenever the service worker wakes up.
ensureTargetIsLast();