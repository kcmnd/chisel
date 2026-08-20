const clipboard = document.getElementById("clipboard");

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.target !== "offscreen" || message?.type !== "copy-text") {
    return;
  }

  try {
    clipboard.value = String(message.text ?? "");
    clipboard.select();

    const copied = document.execCommand("copy");
    sendResponse({
      ok: copied,
      error: copied ? undefined : "Chrome rejected the clipboard copy operation.",
    });
  } catch (error) {
    sendResponse({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});
