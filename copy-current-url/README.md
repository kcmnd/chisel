COPY CURRENT URL — Chrome Extension v1.1

This extensions adds a shortcut to copy the current URL (inspired by Zen Browser's `Ctrl + Shift + C`). After a successful copy, a small "URL copied ✓" toast appears near the top of the page and disappears automatically after about 1.5 seconds.

Default shortcut
  Windows/Linux: Ctrl + Shift + Y
  macOS:         Command + Shift + Y

Change the shortcut
  1. Go to: chrome://extensions/shortcuts
  2. Find "Copy Current URL".
  3. Assign any available shortcut you prefer.

Notes
  - Chrome reserves Ctrl + Shift + C on Windows/Linux for DevTools.
  - The toast can appear on normal web pages. Chrome does not allow extensions to inject page UI into protected pages such as chrome://extensions.
  - The URL can still be copied there even when no toast is shown.
  - You can also click the extension's toolbar icon to copy the current URL.

Privacy
  This extension has no network code and sends no data anywhere.
  It accesses the current tab only when you explicitly invoke it.
