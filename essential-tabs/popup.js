const $ = (selector) => document.querySelector(selector);

let currentTab;

function send(message) {
  return chrome.runtime.sendMessage(message);
}

function showStatus(message = "") {
  $("#status").textContent = message;
}

function render({ state, live }) {
  const list = $("#list");
  list.replaceChildren();
  $("#empty").hidden = state.essentials.length !== 0;

  const currentBinding = currentTab && state.bindings[String(currentTab.id)];
  if (currentBinding) {
    $("#add-current").textContent = "Current tab is an Essential";
    $("#add-current").disabled = true;
  } else {
    $("#add-current").textContent = "Add current tab";
    $("#add-current").disabled = false;
  }

  [...state.essentials]
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .forEach((essential) => {
      const item = document.createElement("article");
      item.className = "essential";
      if (currentBinding?.essentialId === essential.id) item.classList.add("active");

      const text = document.createElement("div");
      const title = document.createElement("div");
      title.className = "title";
      title.textContent = essential.title || essential.url;
      const url = document.createElement("div");
      url.className = "url";
      url.textContent = essential.url;
      text.append(title, url);

      const actions = document.createElement("div");
      actions.className = "actions";
      actions.append(
        actionButton("Open", () => send({ type: "openEssential", essentialId: essential.id })),
        actionButton("Reset", () => send({ type: "resetEssential", essentialId: essential.id })),
        actionButton("Remove", () => send({ type: "removeEssential", essentialId: essential.id }))
      );
      item.append(text, actions);
      list.append(item);
    });
}

function actionButton(label, callback) {
  const button = document.createElement("button");
  button.textContent = label;
  button.addEventListener("click", async () => {
    button.disabled = true;
    try {
      const result = await callback();
      if (result?.ok === false) showStatus(result.error || "Operation failed.");
      else window.close();
    } catch (error) {
      showStatus(error.message);
      button.disabled = false;
    }
  });
  return button;
}

async function refresh() {
  const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  currentTab = tabs[0];
  const result = await send({ type: "getState" });
  if (result?.ok === false) throw new Error(result.error);
  render(result);
}

$("#add-current").addEventListener("click", async () => {
  try {
    const result = await send({ type: "addCurrent", tabId: currentTab.id });
    if (result?.ok === false) throw new Error(result.error);
    window.close();
  } catch (error) {
    showStatus(error.message);
  }
});

refresh().catch((error) => showStatus(error.message));
