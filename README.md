# Chisel

I recently moved from [Zen Browser](https://zen-browser.app/) back to Chrome and missed some of Zen's functionality. **Chisel** is a collection of small extensions that shape Chrome around the way I like to use it. For now, that mostly means bringing back features I miss from Zen whenever it's easy.

## Current extensions:

### always-last-tab
In Zen (at least the way I had it), tabs are vertical and aligned to the left of the screen, and a new tab adds it to the top of the list. Chrome now has native support for left-aligned vertical tabs but adding a new tab appends to the end of the list.
This is a problem for me because I used to always keep a YouTube or a music app's tab at the bottom of the tab list so I can easily access with `Ctrl + 9` but in Chrome that tab wasn't always the last tab.
This extension aims to fix that for me :)

### copy-current-url
Zen had a shortcut to copy the current URL with `Ctrl + Shift + C` but Chrome doesn't natively have that so this extension adds that shortcut as `Ctrl + Shift + Y`. The reason I had to switch to `Y` instead of using `C` is because Chrome already reserved `Ctrl + Shift + C` for opening developer tools :/ at least by using `Y` it's a little closer to vim's `y` for yank =D

## Installing an extension

1. Download and extract this repository.
2. Open `chrome://extensions` in Chrome.
3. Turn on **Developer mode**.
4. Click **Load unpacked**.
5. Select the folder of the extension you want to install.
6. You're done! go ahead and test to make sure it works ;)

## Updating an extension

Replace the extension’s existing files with the updated files, then open `chrome://extensions` and click the extension’s **Reload** button.

Alternatively, remove the old extension and load the updated folder again.
