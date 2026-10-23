# JT Creations

A simple phone app for recording the things I make, all in one library:

- **Wood Talking**: woodwork, coded `WT` + year + item number (e.g. `WT2601` is the first piece of 2026)
- **Craft & Carry**: leatherwork, coded `CC` + year + item number (e.g. `CC2601`)

**Open it:** https://jaspertwigg.github.io/Craft-Carry/

## Adding it to your phone
- **iPhone (Safari):** open the link, tap **Share → Add to Home Screen**.
- **Android (Chrome):** open the link, tap **⋮ → Add to Home screen / Install app**.

It then opens like a normal app and works without internet. If you added the old "Workshop" icon to your home screen, remove it and add the app again to get the new name and icon (your projects stay).

## What each project records
- Name, code (filled in automatically, but you can change it) and status (Idea, In progress, Finished, For sale, Sold, Gifted, Kept)
- Start and completion dates (the completed date matches the start date unless you change it; tick **Dates unknown** for older pieces; there's also **Time taken unknown**)
- Description, purpose, size and materials cost
- **Materials** and **Finish** (beeswax, CA glue, Danish oil…): your 5 most recently used choices are shown; tap to pick. Type in the search box to find any other choice, or tap **＋ Add** to put a new one on the list. Remove choices from the lists in ⚙︎ Settings.
- Photos and videos: tap **＋ Add photo** / **＋ Add video** in the project form or on the project page. On iPhone, Apple's menu then lets you choose **Photo Library** or **Take Photo**. The first photo is the cover.
- **Fields follow the status:** For sale shows the asking price and where it's listed; Sold shows the full sale details; Gifted shows who it was for, the date and occasion; Kept shows where it lives. The completion date appears once a piece is finished.
- **Edit photos:** open a photo and tap **✂︎ Edit** to rotate or crop it (free, square, 4:3 or 3:4). Saving replaces the photo.
- **Trim videos:** tap **✂︎ Trim** under a video to set start and end points. The app only plays that part; the original file is kept.
- **Save to camera roll:** open any photo, or look under any video, and tap **Save to camera roll**. On iPhone, tap **Save Image** / **Save Video** in the menu that pops up.
- **Timer:** tap ▶ Start when you begin working and ■ Stop when you finish. It keeps counting even if you close the app. Open **Time log** to fix a session you forgot to stop, delete an entry (×), add time by hand, or **Reset timer** back to zero.
- Sale details: if you enter a materials cost, the app works out your profit and what you earned per hour.

## Getting around
The app opens on a landing page with: **Start new project**, **View project list**, **Pick up where you left off** (your most recently updated project), **Wood Talking** and **Craft & Carry** (the list filtered to that workshop), and **Settings & backup**.

## Finding projects
The project list shows every project. Filter by workshop (All / Wood Talking / Craft & Carry) and by status, search, and use the **Sort** menu: newest added, code (newest or oldest), completed date (newest or oldest), name, material, status or recently updated. The app remembers your choice.

## Your data
Everything is stored **only on your phone**. Nothing is uploaded anywhere.
Use **⚙︎ Settings → Download backup** now and then (and before changing phones). Restore it with **Restore from backup**.
Videos are left out of backups unless you tick the box, because they make the file very large.
Settings also has a **spreadsheet (CSV)** download of all projects, lets you change the `WT` / `CC` code prefixes, and has **Renumber codes by completion date** (each year counts from 01 in the order pieces were finished; you see every change before it's applied).

## For developers
Plain HTML, CSS and JavaScript with no build step. The `app/` folder is published to GitHub Pages by `.github/workflows/deploy.yml` on every push to `main`.
Project records are kept in `localStorage`, and photos and videos in IndexedDB.
Bump `CACHE` in `app/sw.js` when the asset list changes.
