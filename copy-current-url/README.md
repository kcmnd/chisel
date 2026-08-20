# Copy Current URL

This extension adds a shortcut for copying the current tab's URL. After a successful copy, a small `URL copied ✓` toast appears near the top of the page and disappears automatically after about 1.5 seconds.

## Default shortcut

* Windows/Linux: `Ctrl + Shift + Y`
* macOS: `Command + Shift + Y`

## Changing the shortcut

1. Open `chrome://extensions/shortcuts`.
2. Find **Copy Current URL**.
3. Assign any available shortcut you prefer.

## Notes

* Chrome reserves `Ctrl + Shift + C` on Windows/Linux for opening DevTools.
* The toast can appear on normal web pages.
* Chrome does not allow extensions to inject page UI into protected pages such as `chrome://extensions`.
* The URL can still be copied from those pages even when no toast is shown.
* You can also click the extension's toolbar icon to copy the current URL.

## Privacy

This extension has no network code and sends no data anywhere.

It accesses the current tab only when you explicitly invoke it.
