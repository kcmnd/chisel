# Always Last Tab

This extension keeps one chosen tab in the last position of its Chrome window, making it easy to access with Chrome's built-in last-tab shortcut.

With horizontal tabs, the designated tab stays at the far right. With vertical tabs, it stays at the bottom.

## Last-tab shortcut

* Windows/Linux: `Ctrl + 9`
* macOS: `Command + 9`

## Choosing the always-last tab

1. Open the page you want to keep last.
2. Click the extension's toolbar icon.
3. A `9` badge will appear on the icon, and the tab will move to the last position.

Click the extension icon again while viewing the designated tab to turn the behavior off. Clicking the icon from another tab will make that tab the new always-last tab.

## Notes

* Only one tab can be designated at a time.
* The selected page is remembered across Chrome restarts.
* If the original tab disappears, the extension will bind to a matching page when one is restored or opened.
* Pages are matched using their origin and path. Query parameters and URL fragments are ignored.
* Only normal `http://` and `https://` pages are supported. Chrome pages such as `chrome://extensions` cannot be selected.

## Privacy

This extension has no network code and sends no data anywhere.

It stores the selected page's origin and path locally and accesses open tabs only to find and move the designated page.
