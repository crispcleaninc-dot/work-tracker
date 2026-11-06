# Work Tracker

A home-screen app (installable web app) for the Running To-Do List.

**No tasks or personal information are stored in this repository.** The app's code is public so it can be hosted free on GitHub Pages. Your tasks live in your own Google Sheet and load only through a private Apps Script relay after your PIN is checked there.

## Install on your phone
- iPhone (Safari): open the app link, tap Share, then **Add to Home Screen**.
- Android (Chrome): open the app link, tap the menu, then **Install app** or **Add to Home screen**.

## Parts
- `index.html`, `app.js`, `styles.css`: the app
- `sw.js`, `manifest.webmanifest`, `icons/`: home-screen install and offline start
- `config.js`: the relay address (no data)
- The relay is the "Work Tracker Relay" Apps Script project in the crispcleaninc Google account (not stored here). It checks the PIN and reads/writes the sheet, and applies nightly "WT Inbox" updates every 2 hours.
