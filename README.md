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
- Start and completion dates (tick **Dates unknown** for older pieces; there's also **Time taken unknown**)
- Description, purpose, size and materials cost
- **Materials** and **Finish** (beeswax, CA glue, Danish oil…): your 5 most recently used choices are shown; tap to pick. Type in the search box to find any other choice, or tap **＋ Add** to put a new one on the list. Remove choices from the lists in ⚙︎ Settings.
- Photos and videos: in the project form or on the project page, **📷 Camera** / **🎥 Record** opens the camera and **🖼 Library** opens your photo library. The in-app camera lets you take several photos in a row, then tap **Done**. The first photo is the cover.
- **Fields follow the status:** For sale shows the asking price and where it's listed; Sold shows the full sale details; Gifted shows who it was for, the date and occasion; Kept shows where it lives. The completion date appears once a piece is finished.
- **Camera roll:** photos and videos taken in the app are offered to your camera roll. On iPhone, tap **Save Images** / **Save Video** in the menu that pops up. On Android they go to the Downloads album. Turn this off in ⚙︎ Settings. Any photo or video can also be saved later with **Save to camera roll**.
- **Timer:** tap ▶ Start when you begin working and ■ Stop when you finish. It keeps counting even if you close the app. Open **Time log** to fix a session you forgot to stop, delete an entry (×), add time by hand, or **Reset timer** back to zero.
- Sale details: if you enter a materials cost, the app works out your profit and what you earned per hour.

## Your data
Everything is stored **only on your phone**. Nothing is uploaded anywhere.
Use **⚙︎ Settings → Download backup** now and then (and before changing phones). Restore it with **Restore from backup**.
Videos are left out of backups unless you tick the box, because they make the file very large.
Settings also has a **spreadsheet (CSV)** download of all projects, and lets you change the `WT` / `CC` code prefixes.

## For developers
Plain HTML, CSS and JavaScript with no build step. The `app/` folder is published to GitHub Pages by `.github/workflows/deploy.yml` on every push to `main`.
Project records are kept in `localStorage`, and photos and videos in IndexedDB.
Bump `CACHE` in `app/sw.js` when the asset list changes.
