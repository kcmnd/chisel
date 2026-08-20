const OFFSCREEN_DOCUMENT = "offscreen.html";
let creatingOffscreenDocument = null;

async function ensureOffscreenDocument() {
  const offscreenUrl = chrome.runtime.getURL(OFFSCREEN_DOCUMENT);

  const contexts = await chrome.runtime.getContexts({
    contextTypes: ["OFFSCREEN_DOCUMENT"],
    documentUrls: [offscreenUrl],
  });

  if (contexts.length > 0) {
    return;
  }

  if (!creatingOffscreenDocument) {
    creatingOffscreenDocument = chrome.offscreen.createDocument({
      url: OFFSCREEN_DOCUMENT,
      reasons: ["CLIPBOARD"],
      justification:
        "Copy the current tab URL to the clipboard when the user invokes the extension.",
    });
  }

  try {
    await creatingOffscreenDocument;
  } finally {
    creatingOffscreenDocument = null;
  }
}

async function showCopiedToast(tabId) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        const TOAST_ID = "__copy_current_url_toast__";
        const oldToast = document.getElementById(TOAST_ID);
        if (oldToast) oldToast.remove();

        const toast = document.createElement("div");
        toast.id = TOAST_ID;
        toast.setAttribute("role", "status");
        toast.setAttribute("aria-live", "polite");
        toast.textContent = "URL copied ✓";

        Object.assign(toast.style, {
          position: "fixed",
          top: "18px",
          left: "50%",
          transform: "translateX(-50%) translateY(-6px)",
          zIndex: "2147483647",
          padding: "7px 11px",
          borderRadius: "8px",
          background: "rgba(24, 24, 27, 0.94)",
          color: "#ffffff",
          fontFamily:
            'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
          fontSize: "13px",
          fontWeight: "500",
          lineHeight: "18px",
          boxShadow: "0 4px 14px rgba(0, 0, 0, 0.22)",
          pointerEvents: "none",
          opacity: "0",
          transition: "opacity 120ms ease, transform 120ms ease",
        });

        const parent = document.body || document.documentElement;
        parent.appendChild(toast);

        requestAnimationFrame(() => {
          toast.style.opacity = "1";
          toast.style.transform = "translateX(-50%) translateY(0)";
        });

        setTimeout(() => {
          toast.style.opacity = "0";
          toast.style.transform = "translateX(-50%) translateY(-4px)";

          setTimeout(() => {
            if (toast.isConnected) toast.remove();
          }, 180);
        }, 1350);
      },
    });
  } catch {
    // Chrome internal pages and some protected pages do not allow script injection.
    // The URL has still been copied successfully.
  }
}

async function copyCurrentUrl() {
  const [tab] = await chrome.tabs.query({
    active: true,
    currentWindow: true,
  });

  if (!tab || !tab.id || !tab.url) {
    throw new Error("Could not read the current tab URL.");
  }

  await ensureOffscreenDocument();

  const response = await chrome.runtime.sendMessage({
    target: "offscreen",
    type: "copy-text",
    text: tab.url,
  });

  if (!response?.ok) {
    throw new Error(response?.error || "Could not copy the URL.");
  }

  await showCopiedToast(tab.id);
}

chrome.commands.onCommand.addListener((command) => {
  if (command === "copy-current-url") {
    copyCurrentUrl().catch((error) => console.error(error));
  }
});

chrome.action.onClicked.addListener(() => {
  copyCurrentUrl().catch((error) => console.error(error));
});
