# Workshop Log — Wood Talking & Craft & Carry

A simple phone app for recording the things I make:

- **Wood Talking**: woodwork, coded `WT` + year + item number (e.g. `WT2601` is the first piece of 2026)
- **Craft & Carry**: leatherwork, coded `CC` + year + item number (e.g. `CC2601`)

**Open it:** https://jaspertwigg.github.io/Craft-Carry/

## Adding it to your phone
- **iPhone (Safari):** open the link, tap **Share → Add to Home Screen**.
- **Android (Chrome):** open the link, tap **⋮ → Add to Home screen / Install app**.

It then opens like a normal app and works without internet.

## What each project records
- Name, code (filled in automatically, but you can change it) and status (Idea, In progress, Finished, For sale, Sold, Gifted, Kept)
- Start and completion dates
- Description, purpose, size and materials cost
- **Materials:** tap to pick from a list. Type in the box and tap **Add** to put a new material on the list. Remove materials from the list in ⚙︎ Settings.
- Photos: **Take photos** opens the camera inside the app, so you can take several in a row and then tap **Done**. Or choose from your photo library. The first photo is the cover; tap a photo to make it the cover or delete it.
- Videos
- **Timer:** tap ▶ Start when you begin working and ■ Stop when you finish. It keeps counting even if you close the app. Open **Time log** to fix a session you forgot to stop, delete an entry (×), add time by hand, or **Reset timer** back to zero.
- Sale details: asking price, sold price, date, buyer and where it sold. If you enter a materials cost, the app works out your profit and what you earned per hour.

## Your data
Everything is stored **only on your phone**. Nothing is uploaded anywhere.
Use **⚙︎ Settings → Download backup** now and then (and before changing phones). Restore it with **Restore from backup**.
Videos are left out of backups unless you tick the box, because they make the file very large.
Settings also has a **spreadsheet (CSV)** download of all projects, and lets you change the `WT` / `CC` code prefixes.

## For developers
Plain HTML, CSS and JavaScript with no build step. The `app/` folder is published to GitHub Pages by `.github/workflows/deploy.yml` on every push to `main`.
Project records are kept in `localStorage`, and photos and videos in IndexedDB.
Bump `CACHE` in `app/sw.js` when the asset list changes.
