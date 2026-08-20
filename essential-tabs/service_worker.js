const STORAGE_KEY = "chromeEssentialsState";
const MENU_ADD = "essentials-add";
const MENU_REMOVE = "essentials-remove";
const MENU_RESET = "essentials-reset";
const MENU_SET_URL = "essentials-set-url";

let serialized = Promise.resolve();

function runSerialized(task) {
  const result = serialized.then(task, task);
  serialized = result.catch(() => undefined);
  return result;
}

function emptyState() {
  return { essentials: [], bindings: {} };
}

async function readState() {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  const state = result[STORAGE_KEY] || emptyState();
  return {
    essentials: Array.isArray(state.essentials) ? state.essentials : [],
    bindings: state.bindings && typeof state.bindings === "object"
      ? state.bindings
      : {}
  };
}

async function writeState(state) {
  await chrome.storage.local.set({ [STORAGE_KEY]: state });
}

function essentialById(state, id) {
  return state.essentials.find((essential) => essential.id === id);
}

function bindingForTab(state, tabId) {
  return state.bindings[String(tabId)] || null;
}

function bindingTabIds(state, essentialId) {
  return Object.entries(state.bindings)
    .filter(([, binding]) => binding.essentialId === essentialId)
    .map(([tabId]) => Number(tabId));
}

async function getNormalWindows() {
  return chrome.windows.getAll({ windowTypes: ["normal"] });
}

async function chooseWindowId(preferredWindowId) {
  if (preferredWindowId !== undefined && preferredWindowId !== null) {
    try {
      const preferred = await chrome.windows.get(preferredWindowId);
      if (preferred.type === "normal") return preferred.id;
    } catch (_) {
      // The window may have closed between the event and this lookup.
    }
  }

  try {
    const lastFocused = await chrome.windows.getLastFocused();
    if (lastFocused.type === "normal") return lastFocused.id;
  } catch (_) {
    // Fall through to the first normal window.
  }

  const windows = await getNormalWindows();
  return windows[0]?.id;
}

async function tabsInWindow(windowId) {
  return chrome.tabs.query({ windowId });
}

async function bindTab(state, tab, essential, discardWhenLoaded = false) {
  state.bindings[String(tab.id)] = {
    essentialId: essential.id,
    windowId: tab.windowId,
    index: tab.index,
    discardWhenLoaded
  };
}

async function createReplacement(essential, windowId, index) {
  if (windowId === undefined || windowId === null) return null;

  const tab = await chrome.tabs.create({
    windowId,
    url: essential.url,
    pinned: true,
    active: false,
    index: Math.max(0, index ?? essential.order ?? 0)
  });

  // Chrome clamps the requested index. Move once more after creation so the
  // order remains deterministic when several pinned tabs already exist.
  try {
    await chrome.tabs.move(tab.id, {
      index: Math.max(0, index ?? essential.order ?? 0)
    });
  } catch (_) {
    // A tab can disappear during shutdown; the next reconciliation will fix it.
  }

  return tab;
}

async function discardIfReady(tabId) {
  const state = await readState();
  const binding = bindingForTab(state, tabId);
  if (!binding?.discardWhenLoaded) return;

  let tab;
  try {
    tab = await chrome.tabs.get(tabId);
  } catch (_) {
    return;
  }

  // Never discard a tab before its requested URL has committed. Doing that
  // to a newly-created loading tab can leave Chrome showing about:blank.
  if (tab.active || tab.status !== "complete") return;

  try {
    await chrome.tabs.discard(tabId);
    binding.discardWhenLoaded = false;
    await writeState(state);
  } catch (_) {
    // Chrome may temporarily reject discard; the next update can retry it.
  }
}

async function resetBinding(tabId, binding, state) {
  const essential = essentialById(state, binding.essentialId);
  if (!essential) return;

  let index = binding.index ?? essential.order ?? 0;
  let windowId = binding.windowId;

  try {
    const tab = await chrome.tabs.get(tabId);
    index = tab.index;
    windowId = tab.windowId;
  } catch (_) {
    // Use the last recorded location if the tab has already disappeared.
  }

  delete state.bindings[String(tabId)];
  await writeState(state);

  const replacement = await createReplacement(essential, windowId, index);
  if (!replacement) return;

  const latest = await readState();
  const stillExists = essentialById(latest, essential.id);
  if (!stillExists) {
    // The user removed the Essential while the replacement was being created.
    try {
      await chrome.tabs.update(replacement.id, { pinned: false });
    } catch (_) {
      // Ignore a tab that was closed concurrently.
    }
    return;
  }

  await bindTab(latest, replacement, essential, true);
  await writeState(latest);
  await discardIfReady(replacement.id);
}

async function reconcileBindings() {
  const state = await readState();
  const windows = await getNormalWindows();
  const liveTabs = new Map();

  for (const window of windows) {
    const tabs = await tabsInWindow(window.id);
    for (const tab of tabs) liveTabs.set(String(tab.id), tab);
  }

  for (const tabId of Object.keys(state.bindings)) {
    if (!liveTabs.has(tabId)) delete state.bindings[tabId];
  }

  // A previous version could create more than one replacement while a tab was
  // still loading. Keep one binding per Essential and close stale blank
  // replacements so upgrading cannot leave a trail of about:blank tabs.
  const firstBinding = new Map();
  for (const [tabId, binding] of Object.entries(state.bindings)) {
    if (!firstBinding.has(binding.essentialId)) {
      firstBinding.set(binding.essentialId, tabId);
      continue;
    }

    delete state.bindings[tabId];
    const duplicate = liveTabs.get(tabId);
    if (duplicate?.url === "about:blank") {
      try {
        await chrome.tabs.remove(Number(tabId));
      } catch (_) {
        // The duplicate may have disappeared already.
      }
    }
  }

  // Chrome may restore a pinned tab with a new tab ID after a restart. Match
  // such a tab by its canonical URL before creating another one.
  const alreadyBound = new Set(
    Object.values(state.bindings).map((binding) => binding.essentialId)
  );

  for (const essential of state.essentials) {
    if (alreadyBound.has(essential.id)) continue;

    const restored = [...liveTabs.values()].find((tab) =>
      tab.pinned && tab.url === essential.url
    );
    if (!restored) continue;

    await bindTab(state, restored, essential);
    alreadyBound.add(essential.id);
  }

  await writeState(state);
  return { state, windows, liveTabs };
}

async function ensureEssentials() {
  const { state, windows, liveTabs } = await reconcileBindings();
  if (!state.essentials.length || !windows.length) return;

  const boundEssentialIds = new Set(
    Object.values(state.bindings).map((binding) => binding.essentialId)
  );

  // This implementation keeps one live instance of each Essential in the
  // profile's normal browsing window. A new instance is created only when no
  // instance exists anywhere, avoiding duplicate Essentials in multi-window
  // sessions.
  const targetWindowId = await chooseWindowId();
  if (targetWindowId === undefined) return;

  for (const essential of state.essentials) {
    if (boundEssentialIds.has(essential.id)) continue;

    const replacement = await createReplacement(
      essential,
      targetWindowId,
      essential.order ?? 0
    );
    if (replacement) {
      await bindTab(state, replacement, essential, true);
      boundEssentialIds.add(essential.id);
      await discardIfReady(replacement.id);
    }
  }

  await writeState(state);
}

async function addEssential(tabId) {
  const tab = await chrome.tabs.get(tabId);
  if (!tab.url || !/^(https?|file):/i.test(tab.url)) {
    throw new Error("Only http, https, and file pages can be Essentials.");
  }

  const state = await readState();
  const existingBinding = bindingForTab(state, tabId);
  if (existingBinding) return essentialById(state, existingBinding.essentialId);

  const duplicate = state.essentials.find((essential) => essential.url === tab.url);
  if (duplicate) {
    await bindTab(state, tab, duplicate);
    await writeState(state);
    return duplicate;
  }

  const existingEssentialIds = new Set(
    Object.values(state.bindings)
      .filter((binding) => binding.windowId === tab.windowId)
      .map((binding) => binding.essentialId)
  );
  const essential = {
    id: crypto.randomUUID(),
    url: tab.url,
    title: tab.title || tab.url,
    // Essentials occupy the beginning of Chrome's pinned region. Ordinary
    // Chrome-pinned tabs, if any, remain after them.
    order: existingEssentialIds.size,
    createdAt: Date.now()
  };

  state.essentials.push(essential);
  await chrome.tabs.update(tabId, { pinned: true });
  await chrome.tabs.move(tabId, { index: essential.order });
  const updated = await chrome.tabs.get(tabId);
  await bindTab(state, updated, essential, false);
  await writeState(state);
  return essential;
}

async function removeEssential(essentialId, tabId) {
  const state = await readState();
  state.essentials = state.essentials.filter((essential) => essential.id !== essentialId);

  for (const [boundTabId, binding] of Object.entries(state.bindings)) {
    if (binding.essentialId !== essentialId) continue;
    delete state.bindings[boundTabId];
    try {
      await chrome.tabs.update(Number(boundTabId), { pinned: false });
    } catch (_) {
      // The tab may already have been closed.
    }
  }

  if (tabId !== undefined) delete state.bindings[String(tabId)];
  await writeState(state);
  await normalizeOrders();
}

async function normalizeOrders() {
  const state = await readState();
  const live = [];

  for (const [tabId, binding] of Object.entries(state.bindings)) {
    const essential = essentialById(state, binding.essentialId);
    if (!essential) continue;
    try {
      const tab = await chrome.tabs.get(Number(tabId));
      live.push({ tab, essential });
    } catch (_) {
      delete state.bindings[tabId];
    }
  }

  live.sort((a, b) => a.tab.index - b.tab.index);
  live.forEach(({ essential }, order) => {
    essential.order = order;
  });
  await writeState(state);
}

async function resetEssentialById(essentialId) {
  const state = await readState();
  const tabId = bindingTabIds(state, essentialId)[0];
  if (tabId === undefined) {
    await ensureEssentials();
    return;
  }

  const binding = bindingForTab(state, tabId);
  await resetBinding(tabId, binding, state);
}

async function resetActiveEssential() {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (!tab) return false;

  const state = await readState();
  const binding = bindingForTab(state, tab.id);
  if (!binding) return false;

  await resetBinding(tab.id, binding, state);
  return true;
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll().then(() => {
    chrome.contextMenus.create({
      id: MENU_ADD,
      title: "Add tab to Essentials",
      contexts: ["tab"]
    });
    chrome.contextMenus.create({
      id: MENU_REMOVE,
      title: "Remove tab from Essentials",
      contexts: ["tab"]
    });
    chrome.contextMenus.create({
      id: MENU_RESET,
      title: "Reset Essential to its saved URL",
      contexts: ["tab"]
    });
    chrome.contextMenus.create({
      id: MENU_SET_URL,
      title: "Set current URL as Essential URL",
      contexts: ["tab"]
    });
  });
  runSerialized(ensureEssentials).catch(console.error);
});

chrome.runtime.onStartup.addListener(() => {
  runSerialized(ensureEssentials).catch(console.error);
});

chrome.windows.onCreated.addListener(() => {
  runSerialized(ensureEssentials).catch(console.error);
});

chrome.windows.onRemoved.addListener(() => {
  runSerialized(ensureEssentials).catch(console.error);
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  runSerialized(async () => {
    if (!tab?.id) return;
    const state = await readState();
    const binding = bindingForTab(state, tab.id);

    if (info.menuItemId === MENU_ADD) {
      await addEssential(tab.id);
      return;
    }

    if (!binding) return;

    if (info.menuItemId === MENU_REMOVE) {
      await removeEssential(binding.essentialId, tab.id);
    } else if (info.menuItemId === MENU_RESET) {
      await resetBinding(tab.id, binding, state);
    } else if (info.menuItemId === MENU_SET_URL) {
      const essential = essentialById(state, binding.essentialId);
      if (essential && tab.url) {
        essential.url = tab.url;
        essential.title = tab.title || tab.url;
        await writeState(state);
      }
    }
  }).catch(console.error);
});

chrome.tabs.onRemoved.addListener((tabId, removeInfo) => {
  runSerialized(async () => {
    const state = await readState();
    const binding = bindingForTab(state, tabId);
    if (!binding) return;

    delete state.bindings[String(tabId)];
    await writeState(state);

    if (removeInfo.isWindowClosing) {
      // The definition remains. ensureEssentials() will place it in a
      // surviving/new window after the browser/window lifecycle completes.
      return;
    }

    const essential = essentialById(state, binding.essentialId);
    if (!essential) return;

    const replacement = await createReplacement(
      essential,
      binding.windowId,
      binding.index ?? essential.order ?? 0
    );
    if (replacement) {
      await bindTab(state, replacement, essential, true);
      await writeState(state);
      await discardIfReady(replacement.id);
    }
  }).catch(console.error);
});

chrome.tabs.onMoved.addListener((tabId, moveInfo) => {
  runSerialized(async () => {
    const state = await readState();
    const binding = bindingForTab(state, tabId);
    if (!binding) return;

    binding.index = moveInfo.toIndex;
    binding.windowId = moveInfo.windowId;
    const essential = essentialById(state, binding.essentialId);
    if (essential) essential.order = moveInfo.toIndex;
    await writeState(state);
  }).catch(console.error);
});

chrome.tabs.onAttached.addListener((tabId, attachInfo) => {
  runSerialized(async () => {
    const state = await readState();
    const binding = bindingForTab(state, tabId);
    if (!binding) return;
    binding.windowId = attachInfo.newWindowId;
    binding.index = attachInfo.newPosition;
    await writeState(state);
  }).catch(console.error);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === "complete") {
    runSerialized(() => discardIfReady(tabId)).catch(console.error);
  }

  if (changeInfo.pinned !== false) return;

  // Chrome can emit a transient pinned=false update as part of its special
  // two-keystroke close flow for pinned tabs. Wait until we know the tab still
  // exists before interpreting this as an intentional native "Unpin".
  setTimeout(() => {
    runSerialized(async () => {
      const state = await readState();
      const binding = bindingForTab(state, tabId);
      if (!binding) return;

      try {
        const tab = await chrome.tabs.get(tabId);
        if (tab.pinned) return;
      } catch (_) {
        // The tab was actually closed; tabs.onRemoved owns the reset path.
        return;
      }

      await removeEssential(binding.essentialId, tabId);
    }).catch(console.error);
  }, 250);
});

chrome.commands.onCommand.addListener((command) => {
  if (command === "reset-active-essential") {
    runSerialized(resetActiveEssential).catch(console.error);
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  runSerialized(async () => {
    if (message.type === "getState") {
      const state = await readState();
      const tabs = await chrome.tabs.query({});
      const live = {};
      for (const tab of tabs) {
        const binding = bindingForTab(state, tab.id);
        if (binding) live[binding.essentialId] = tab;
      }
      return { state, live };
    }

    if (message.type === "addCurrent") {
      await addEssential(message.tabId);
      return { ok: true };
    }

    if (message.type === "removeEssential") {
      await removeEssential(message.essentialId);
      return { ok: true };
    }

    if (message.type === "resetEssential") {
      await resetEssentialById(message.essentialId);
      return { ok: true };
    }

    if (message.type === "openEssential") {
      const state = await readState();
      const existingTabId = bindingTabIds(state, message.essentialId)[0];
      if (existingTabId !== undefined) {
        const existingTab = await chrome.tabs.get(existingTabId);
        await chrome.windows.update(existingTab.windowId, { focused: true });
        await chrome.tabs.update(existingTabId, { active: true });
      } else {
        await ensureEssentials();
      }
      return { ok: true };
    }

    throw new Error(`Unknown message: ${message.type}`);
  }).then((result) => sendResponse(result)).catch((error) => {
    sendResponse({ ok: false, error: error.message });
  });

  return true;
});

// Reconcile once when the worker is first loaded (including extension reloads).
runSerialized(ensureEssentials).catch(console.error);
