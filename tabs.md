Update the UI so that tabs can be added and remove from the page, and tabs will be inside of the dock/bottom bar. 

**Preliminary Changes**
- The admin panel close behavior will have to change so that an "X" appears in the top right corner to explicitly close the admin panel instead of the current clicking outside of the window to close it.

**Primary Changes**
- There will be one permenant tab (home tab) that contains the logo.png. It cannot be removed.
- When the user clicks the unlock icon to allow for UI changes and widget resizing, a mini tab with a "+" icon will appear next to the home tab so that the user can add a tab.
  - A modal window will pop up and show a series of font-awesome icons to select from, and a label field to enter a tab name. Once saved, the tab can be used.
  - There will be a toggle to show or hide the tab label during the create.
- Once a tab is added, another "+" mini tab will appear next to it so another can be added.
  - The tabs can simply be pipes between them, similar to how the Chrome and Brave browsers render tabs:
  - ![tabs](https://github.com/jherforth/HomeGlow/blob/Testing/screenshots/Screenshot%202026-03-03%20103618.png?raw=true)
- When the UI is locked again, the "+" mini tab and "-" red icon will be removed from view.
- When a custom tab has been added, a new picklist/drop down selection will appear next to all of the core applications to allow them to be rended on the custom tab selected.
  - The picklist will show the tab label and not the icon.
