# Chrome Essentials

This is a small Manifest V3 extension that approximates Zen Browser's Essential
Tabs using Chrome's native pinned tabs.

## Behavior

- Add a tab through the extension popup or the tab context menu.
- The tab is pinned and stored with its original URL.
- Navigate anywhere inside the Essential.
- Press `Ctrl+W` (or close it through Chrome's UI).
- Chrome closes the live instance; the extension immediately creates a pinned
  replacement at the saved URL, puts it back in the same pinned position, and
  discards it only after the URL has finished loading so it remains visible
  without an active renderer.
- Selecting the pinned tab later loads the saved URL again.

The saved definition is removed through the popup's **Remove** button or the
tab context menu's **Remove tab from Essentials**. A native unpin is treated as
removal after a short delay, but the extension deliberately waits first because
Chrome can emit a transient unpinned update during its two-keystroke pinned-tab
close confirmation. Ordinary closing never deletes the saved definition.

## Install locally

1. Open `chrome://extensions` in Chrome.
2. Enable **Developer mode**.
3. Select **Load unpacked**.
4. Choose this directory (`chrome-essentials`).
5. Pin the extension's toolbar button if you want quick access to its popup.

The extension does not need host permissions because it only uses Chrome's tab
metadata APIs. It does request the `tabs` permission so it can remember the
current URL and title when you create an Essential.

Only install one copy of this extension. If you previously loaded an older
unpacked copy, remove or disable it before loading an updated copy; two active
copies will both respond to a close event and can create duplicate replacement
tabs.

## Notes and limitations

- The current implementation keeps one live instance of each Essential in the
  profile's normal browsing windows. It does not create a duplicate copy in
  every Chrome window.
- If the entire window is closed, the Essential definition is retained and is
  recreated in the next available normal window.
- Chrome's extension APIs cannot create a fake tab-strip entry. The extension
  therefore keeps a real pinned tab and discards its renderer after resetting.
- `Alt+Shift+E` (or `Command+Shift+E` on macOS) resets the active Essential. The
  shortcut can be changed at `chrome://extensions/shortcuts`.
